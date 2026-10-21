create extension if not exists btree_gist with schema extensions;

-- ---------- Πίνακες ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  role text check (role in ('admin','reception','housekeeping')),
  created_at timestamptz not null default now()
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  hotel_name text not null default 'Το ξενοδοχείο μας',
  address text,
  phone text,
  email text,
  check_in_time text not null default '14:00',
  check_out_time text not null default '11:00',
  online_booking boolean not null default true
);
insert into public.settings default values;

create table public.room_types (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  capacity int not null default 2 check (capacity between 1 and 20),
  base_price numeric(10,2) not null default 0 check (base_price >= 0),
  active boolean not null default true,
  sort int not null default 0
);

create table public.rooms (
  id bigint generated always as identity primary key,
  number text not null unique,
  room_type_id bigint not null references public.room_types(id),
  floor text,
  status text not null default 'clean' check (status in ('clean','dirty','inspect','out_of_order')),
  notes text,
  active boolean not null default true
);
create index on public.rooms(room_type_id);

create table public.guests (
  id bigint generated always as identity primary key,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  nationality text,
  birth_date date,
  id_type text check (id_type in ('id_card','passport','other')),
  id_number text,
  address text,
  city text,
  country text,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.guests(lower(last_name));
create index on public.guests(lower(email));

create function public.gen_res_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.reservations where code = c);
  end loop;
  return c;
end $$;

create table public.reservations (
  id bigint generated always as identity primary key,
  code text not null unique default public.gen_res_code(),
  guest_id bigint not null references public.guests(id),
  room_type_id bigint not null references public.room_types(id),
  room_id bigint references public.rooms(id),
  check_in date not null,
  check_out date not null,
  adults int not null default 2 check (adults between 1 and 20),
  children int not null default 0 check (children between 0 and 20),
  status text not null default 'confirmed'
    check (status in ('pending','confirmed','checked_in','checked_out','cancelled','no_show')),
  source text not null default 'direct'
    check (source in ('direct','phone','email','online','booking','airbnb','expedia','other')),
  total_price numeric(10,2) not null default 0 check (total_price >= 0),
  paid numeric(10,2) not null default 0 check (paid >= 0),
  notes text,
  precheckin_at timestamptz,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  check (check_out > check_in),
  check (status not in ('checked_in','checked_out') or room_id is not null),
  constraint reservations_no_overlap exclude using gist (
    room_id with =, daterange(check_in, check_out) with &&
  ) where (room_id is not null and status not in ('cancelled','no_show'))
);
create index on public.reservations(check_in);
create index on public.reservations(check_out);
create index on public.reservations(guest_id);
create index on public.reservations(room_type_id);
create index on public.reservations(room_id);
create index on public.reservations(created_by);

-- ---------- Ρόλοι ----------
create function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;
create function public.is_staff() returns boolean
language sql stable set search_path = '' as $$ select public.my_role() is not null $$;
create function public.is_front() returns boolean
language sql stable set search_path = '' as $$ select coalesce(public.my_role() in ('admin','reception'), false) $$;
create function public.is_admin() returns boolean
language sql stable set search_path = '' as $$ select coalesce(public.my_role() = 'admin', false) $$;

-- Ο πρώτος λογαριασμός γίνεται διαχειριστής· οι επόμενοι περιμένουν έγκριση.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('hotel_new_user'));
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
          case when not exists (select 1 from public.profiles) then 'admin' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Να μένει πάντα τουλάχιστον ένας διαχειριστής.
create function public.keep_one_admin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role is distinct from 'admin')
     and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'Πρέπει να υπάρχει τουλάχιστον ένας διαχειριστής';
  end if;
  return coalesce(new, old);
end $$;
create trigger profiles_keep_one_admin before update or delete on public.profiles
  for each row execute function public.keep_one_admin();

-- ---------- Κρατήσεις: αυτόματες ενέργειες ----------
create function public.reservation_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.room_id is not null and (tg_op = 'INSERT' or new.room_id is distinct from old.room_id) then
    select room_type_id into new.room_type_id from public.rooms where id = new.room_id;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'checked_in' then
      new.checked_in_at := now();
    elsif new.status = 'checked_out' then
      new.checked_out_at := now();
      -- Πρόωρη αναχώρηση: ελευθερώνει τις υπόλοιπες νύχτες.
      new.check_out := greatest(new.check_in + 1, least(new.check_out, current_date));
    end if;
  end if;
  return new;
end $$;
create trigger reservations_before before insert or update on public.reservations
  for each row execute function public.reservation_before();

create function public.reservation_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    update public.rooms set status = 'dirty' where id = new.room_id;
  end if;
  return null;
end $$;
create trigger reservations_after after update on public.reservations
  for each row execute function public.reservation_after();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;

create policy "profiles: own or admin" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles: admin update" on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "profiles: admin delete" on public.profiles for delete to authenticated
  using ((select public.is_admin()));

create policy "settings: public read" on public.settings for select to anon, authenticated using (true);
create policy "settings: admin update" on public.settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "room_types: public read" on public.room_types for select to anon, authenticated using (true);
create policy "room_types: admin insert" on public.room_types for insert to authenticated with check ((select public.is_admin()));
create policy "room_types: admin update" on public.room_types for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "room_types: admin delete" on public.room_types for delete to authenticated using ((select public.is_admin()));

create policy "rooms: staff read" on public.rooms for select to authenticated using ((select public.is_staff()));
create policy "rooms: admin insert" on public.rooms for insert to authenticated with check ((select public.is_admin()));
create policy "rooms: admin update" on public.rooms for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "rooms: admin delete" on public.rooms for delete to authenticated using ((select public.is_admin()));

create policy "guests: front desk" on public.guests for all to authenticated
  using ((select public.is_front())) with check ((select public.is_front()));
create policy "reservations: front desk" on public.reservations for all to authenticated
  using ((select public.is_front())) with check ((select public.is_front()));

-- ---------- Λειτουργίες προσωπικού ----------
create function public.housekeeping_board(p_date date default current_date)
returns table (room_id bigint, number text, floor text, room_type text, status text, notes text,
               occupied boolean, departing boolean, arriving boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  return query
  select r.id, r.number, r.floor, t.name, r.status, r.notes,
    exists (select 1 from public.reservations x where x.room_id = r.id and x.status = 'checked_in'),
    exists (select 1 from public.reservations x where x.room_id = r.id and x.check_out = p_date
            and x.status in ('confirmed','checked_in','checked_out')),
    exists (select 1 from public.reservations x where x.room_id = r.id and x.check_in = p_date
            and x.status in ('pending','confirmed','checked_in'))
  from public.rooms r join public.room_types t on t.id = r.room_type_id
  where r.active
  order by r.floor nulls last, r.number;
end $$;

create function public.set_room_status(p_room bigint, p_status text, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  update public.rooms set status = p_status, notes = coalesce(p_notes, notes) where id = p_room;
end $$;

-- ---------- Πύλη πελατών (δημόσια) ----------
-- availability, request_booking, guest_precheckin: βλ. 0002_error_codes.sql
create function public.availability(p_in date, p_out date)
returns table (room_type_id bigint, name text, description text, capacity int,
               base_price numeric, nights int, total numeric, available int)
language sql as $$ select null::bigint, null::text, null::text, null::int, null::numeric, null::int, null::numeric, null::int where false $$;

create function public.request_booking(
  p_room_type bigint, p_in date, p_out date, p_adults int, p_children int,
  p_first_name text, p_last_name text, p_email text, p_phone text, p_notes text default null)
returns text language sql as $$ select null::text $$;

create function public.guest_precheckin(
  p_code text, p_email text, p_birth_date date, p_nationality text, p_id_type text, p_id_number text,
  p_address text, p_city text, p_country text, p_phone text)
returns void language plpgsql as $$ begin null; end $$;

create function public.find_booking(p_code text, p_email text)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'code', r.code, 'status', r.status, 'check_in', r.check_in, 'check_out', r.check_out,
    'adults', r.adults, 'children', r.children, 'total_price', r.total_price, 'paid', r.paid,
    'room_type', t.name, 'first_name', g.first_name, 'last_name', g.last_name,
    'precheckin_done', r.precheckin_at is not null)
  from public.reservations r
  join public.guests g on g.id = r.guest_id
  join public.room_types t on t.id = r.room_type_id
  where r.code = upper(trim(p_code)) and lower(g.email) = lower(trim(p_email))
$$;

-- ---------- Δικαιώματα εκτέλεσης ----------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.availability(date, date), public.request_booking(bigint, date, date, int, int, text, text, text, text, text),
  public.find_booking(text, text), public.guest_precheckin(text, text, date, text, text, text, text, text, text, text)
  to anon, authenticated;
grant execute on function public.my_role(), public.is_staff(), public.is_front(), public.is_admin(),
  public.housekeeping_board(date), public.set_room_status(bigint, text, text), public.gen_res_code()
  to authenticated;
revoke execute on function public.handle_new_user(), public.keep_one_admin(),
  public.reservation_before(), public.reservation_after() from authenticated;
