-- =====================================================================
-- Πρόγραμμα ξενοδοχείου: πλήρης εγκατάσταση βάσης σε ΝΕΟ έργο Supabase.
-- Supabase → SQL Editor → New query → επικόλλησε ΟΛΟ το αρχείο → Run.
-- Τρέχει μία φορά, σε άδειο έργο.
-- Περιέχει με τη σειρά: supabase/migrations/0001 … 0005.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0001_initial_schema.sql
-- ---------------------------------------------------------------------
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
language sql as $$ select null::bigint, null, null, null::int, null::numeric, null::int, null::numeric, null::int where false $$;

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

-- ---------------------------------------------------------------------
-- 0002_error_codes.sql
-- ---------------------------------------------------------------------
-- Οι δημόσιες λειτουργίες επιστρέφουν κωδικούς σφάλματος (ERR_*),
-- ώστε η εφαρμογή να τους μεταφράζει (ελληνικά / αγγλικά).

create or replace function public.availability(p_in date, p_out date)
returns table (room_type_id bigint, name text, description text, capacity int,
               base_price numeric, nights int, total numeric, available int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_in is null or p_out is null or p_out <= p_in then raise exception 'ERR_DATES'; end if;
  if p_out - p_in > 60 then raise exception 'ERR_MAX_NIGHTS'; end if;
  if not public.is_staff() and (p_in < current_date or p_in > current_date + 730) then
    raise exception 'ERR_DATES';
  end if;
  return query
  select t.id, t.name, t.description, t.capacity, t.base_price,
         (p_out - p_in)::int, t.base_price * (p_out - p_in),
         greatest(0,
           (select count(*) from public.rooms r where r.room_type_id = t.id and r.active and r.status <> 'out_of_order')::int
           - (select count(*) from public.reservations x where x.room_type_id = t.id
                and x.status not in ('cancelled','no_show')
                and daterange(x.check_in, x.check_out) && daterange(p_in, p_out))::int)
  from public.room_types t
  where t.active
  order by t.sort, t.base_price, t.name;
end $$;

create or replace function public.request_booking(
  p_room_type bigint, p_in date, p_out date, p_adults int, p_children int,
  p_first_name text, p_last_name text, p_email text, p_phone text, p_notes text default null)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_type record;
  v_guest bigint;
  v_code text;
begin
  if not (select online_booking from public.settings where id = 1) then raise exception 'ERR_CLOSED'; end if;
  p_first_name := trim(p_first_name); p_last_name := trim(p_last_name);
  p_email := lower(trim(p_email)); p_phone := trim(p_phone); p_notes := nullif(trim(p_notes), '');
  if coalesce(length(p_first_name), 0) not between 1 and 80 or coalesce(length(p_last_name), 0) not between 1 and 80 then
    raise exception 'ERR_NAME';
  end if;
  if p_email is null or length(p_email) > 200 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'ERR_EMAIL'; end if;
  if coalesce(length(p_phone), 0) not between 5 and 40 then raise exception 'ERR_PHONE'; end if;
  if length(p_notes) > 1000 then raise exception 'ERR_NOTES'; end if;
  if coalesce(p_adults, 0) < 1 or coalesce(p_children, 0) < 0 then raise exception 'ERR_PERSONS'; end if;

  perform pg_advisory_xact_lock(hashtext('hotel_booking'));
  select * into v_type from public.availability(p_in, p_out) a where a.room_type_id = p_room_type;
  if not found then raise exception 'ERR_TYPE'; end if;
  if v_type.available < 1 then raise exception 'ERR_SOLD_OUT'; end if;
  if p_adults + p_children > v_type.capacity then raise exception 'ERR_CAPACITY'; end if;

  insert into public.guests (first_name, last_name, email, phone)
  values (p_first_name, p_last_name, p_email, p_phone) returning id into v_guest;
  insert into public.reservations (guest_id, room_type_id, check_in, check_out, adults, children,
                                   status, source, total_price, notes, created_by)
  values (v_guest, p_room_type, p_in, p_out, p_adults, p_children,
          'pending', 'online', v_type.total, p_notes, null)
  returning code into v_code;
  return v_code;
end $$;

create or replace function public.guest_precheckin(
  p_code text, p_email text, p_birth_date date, p_nationality text, p_id_type text, p_id_number text,
  p_address text, p_city text, p_country text, p_phone text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v record;
begin
  select r.id, r.status, r.guest_id into v
  from public.reservations r join public.guests g on g.id = r.guest_id
  where r.code = upper(trim(p_code)) and lower(g.email) = lower(trim(p_email));
  if not found then raise exception 'ERR_NOT_FOUND'; end if;
  if v.status not in ('pending','confirmed') then raise exception 'ERR_PRECHECKIN_CLOSED'; end if;
  if p_id_type is null or p_id_type not in ('id_card','passport','other') then raise exception 'ERR_ID_TYPE'; end if;
  if coalesce(length(trim(p_id_number)), 0) not between 3 and 40 then raise exception 'ERR_ID_NUMBER'; end if;
  if p_birth_date is null or p_birth_date > current_date or p_birth_date < date '1900-01-01' then
    raise exception 'ERR_BIRTH';
  end if;
  update public.guests set
    birth_date = p_birth_date,
    nationality = left(nullif(trim(p_nationality), ''), 80),
    id_type = p_id_type,
    id_number = left(trim(p_id_number), 40),
    address = left(nullif(trim(p_address), ''), 200),
    city = left(nullif(trim(p_city), ''), 80),
    country = left(nullif(trim(p_country), ''), 80),
    phone = coalesce(left(nullif(trim(p_phone), ''), 40), phone)
  where id = v.guest_id;
  update public.reservations set precheckin_at = now() where id = v.id;
end $$;

-- ---------------------------------------------------------------------
-- 0003_first_admin.sql
-- ---------------------------------------------------------------------
-- Νέος λογαριασμός γίνεται διαχειριστής όταν δεν υπάρχει ακόμη ενεργός διαχειριστής
-- (όχι μόνο όταν ο πίνακας είναι άδειος).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('hotel_new_user'));
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''),
          case when not exists (select 1 from public.profiles where role = 'admin') then 'admin' end);
  return new;
end $$;

-- Ο έλεγχος «τουλάχιστον ένας διαχειριστής» ισχύει για αλλαγές ρόλου μέσα από την εφαρμογή.
-- Η διαγραφή λογαριασμού από τον πίνακα ελέγχου του Supabase επιτρέπεται.
create or replace function public.keep_one_admin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.role = 'admin' and new.role is distinct from 'admin'
     and not exists (select 1 from public.profiles where role = 'admin' and id <> old.id) then
    raise exception 'Πρέπει να υπάρχει τουλάχιστον ένας διαχειριστής';
  end if;
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- 0004_tablet.sql
-- ---------------------------------------------------------------------
-- Tablet δωματίου: πληροφορίες ξενοδοχείου, υπηρεσίες (transfer, yachting κ.λπ.) και αιτήματα πελατών.

alter table public.settings
  add column welcome_el text,
  add column welcome_en text,
  add column wifi_name text,
  add column wifi_password text,
  add column cover_image_url text;

create table public.info_sections (
  id bigint generated always as identity primary key,
  icon text,
  title_el text not null,
  title_en text,
  body_el text,
  body_en text,
  sort int not null default 0,
  active boolean not null default true
);

create table public.services (
  id bigint generated always as identity primary key,
  kind text not null default 'other' check (kind in ('transfer','yachting','tour','spa','restaurant','other')),
  name_el text not null,
  name_en text,
  description_el text,
  description_en text,
  image_url text,
  price numeric(10,2) check (price >= 0),
  price_unit text not null default 'on_request' check (price_unit in ('per_booking','per_person','on_request')),
  max_persons int check (max_persons between 1 and 50),
  sort int not null default 0,
  active boolean not null default true
);

create table public.service_requests (
  id bigint generated always as identity primary key,
  service_id bigint not null references public.services(id),
  room_id bigint references public.rooms(id),
  reservation_id bigint references public.reservations(id),
  guest_name text,
  request_date date,
  request_time time,
  persons int not null default 1 check (persons between 1 and 50),
  details jsonb not null default '{}'::jsonb,
  notes text,
  status text not null default 'new' check (status in ('new','confirmed','done','cancelled')),
  price numeric(10,2) check (price >= 0),
  staff_note text,
  source text not null default 'tablet' check (source in ('tablet','staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.service_requests(status);
create index on public.service_requests(service_id);
create index on public.service_requests(room_id);
create index on public.service_requests(reservation_id);
create index on public.service_requests(request_date);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger service_requests_touch before update on public.service_requests
  for each row execute function public.touch_updated_at();

-- Ένα tablet ανά δωμάτιο. Κρατάμε μόνο το hash του κλειδιού της συσκευής.
create table public.tablets (
  room_id bigint primary key references public.rooms(id) on delete cascade,
  token_hash text unique,
  pairing_code text unique,
  pairing_expires timestamptz,
  paired_at timestamptz,
  last_seen timestamptz
);

alter table public.info_sections enable row level security;
alter table public.services enable row level security;
alter table public.service_requests enable row level security;
alter table public.tablets enable row level security;

create policy "info_sections: public read" on public.info_sections for select to anon, authenticated using (true);
create policy "info_sections: admin insert" on public.info_sections for insert to authenticated with check ((select public.is_admin()));
create policy "info_sections: admin update" on public.info_sections for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "info_sections: admin delete" on public.info_sections for delete to authenticated using ((select public.is_admin()));

create policy "services: public read" on public.services for select to anon, authenticated using (true);
create policy "services: admin insert" on public.services for insert to authenticated with check ((select public.is_admin()));
create policy "services: admin update" on public.services for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "services: admin delete" on public.services for delete to authenticated using ((select public.is_admin()));

create policy "service_requests: front desk" on public.service_requests for all to authenticated
  using ((select public.is_front())) with check ((select public.is_front()));

create policy "tablets: admin read" on public.tablets for select to authenticated using ((select public.is_admin()));

-- ---------- Σύνδεση tablet ----------
create function public.random_code(n int) returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(n);
  c text := '';
begin
  for i in 0..n - 1 loop
    c := c || substr(alphabet, 1 + (get_byte(b, i) % 32), 1);
  end loop;
  return c;
end $$;

create function public.admin_tablet_code(p_room bigint) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_code text;
begin
  if not public.is_admin() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  if not exists (select 1 from public.rooms where id = p_room) then raise exception 'Το δωμάτιο δεν βρέθηκε'; end if;
  v_code := public.random_code(8);
  insert into public.tablets (room_id, pairing_code, pairing_expires)
  values (p_room, v_code, now() + interval '15 minutes')
  on conflict (room_id) do update set pairing_code = excluded.pairing_code, pairing_expires = excluded.pairing_expires;
  return v_code;
end $$;

create function public.admin_tablet_unpair(p_room bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  update public.tablets set token_hash = null, pairing_code = null, pairing_expires = null, paired_at = null
  where room_id = p_room;
end $$;

create function public.tablet_pair(p_code text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_room bigint; v_token text;
begin
  select room_id into v_room from public.tablets
  where pairing_code = upper(replace(trim(p_code), ' ', '')) and pairing_expires > now();
  if not found then raise exception 'ERR_CODE'; end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.tablets set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
    pairing_code = null, pairing_expires = null, paired_at = now(), last_seen = now()
  where room_id = v_room;
  return v_token;
end $$;

create function public.tablet_room(p_token text) returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare v_room bigint;
begin
  select room_id into v_room from public.tablets
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if not found then raise exception 'ERR_TABLET'; end if;
  return v_room;
end $$;

create function public.tablet_reservation(p_room bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select id from public.reservations where room_id = p_room and status = 'checked_in'
  order by check_in desc limit 1
$$;

-- ---------- Δεδομένα για το tablet ----------
create function public.tablet_home(p_token text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare v_room bigint; v_res bigint;
begin
  v_room := public.tablet_room(p_token);
  update public.tablets set last_seen = now() where room_id = v_room;
  v_res := public.tablet_reservation(v_room);
  return json_build_object(
    'room', (select number from public.rooms where id = v_room),
    'hotel', (select json_build_object('name', hotel_name, 'address', address, 'phone', phone, 'email', email,
               'check_in_time', check_in_time, 'check_out_time', check_out_time,
               'welcome_el', welcome_el, 'welcome_en', welcome_en, 'wifi_name', wifi_name, 'wifi_password', wifi_password,
               'cover_image_url', cover_image_url)
              from public.settings where id = 1),
    'guest', (select json_build_object('first_name', g.first_name, 'last_name', g.last_name, 'check_out', r.check_out)
              from public.reservations r join public.guests g on g.id = r.guest_id where r.id = v_res),
    'sections', coalesce((select json_agg(s order by s.sort, s.id) from
              (select id, icon, title_el, title_en, body_el, body_en, sort from public.info_sections where active) s), '[]'::json),
    'services', coalesce((select json_agg(s order by s.sort, s.id) from
              (select id, kind, name_el, name_en, description_el, description_en, image_url, price, price_unit, max_persons, sort
               from public.services where active) s), '[]'::json),
    'requests', coalesce((select json_agg(q order by q.created_at desc) from
              (select q.id, q.service_id, s.name_el, s.name_en, q.request_date, q.request_time, q.persons, q.status, q.price, q.created_at
               from public.service_requests q join public.services s on s.id = q.service_id
               where v_res is not null and q.reservation_id = v_res) q), '[]'::json)
  );
end $$;

create function public.tablet_request(
  p_token text, p_service bigint, p_date date, p_time time, p_persons int, p_details jsonb, p_notes text)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_room bigint; v_res bigint; v_svc record; v_guest text; v_id bigint;
begin
  v_room := public.tablet_room(p_token);
  v_res := public.tablet_reservation(v_room);
  if v_res is null then raise exception 'ERR_NO_GUEST'; end if;
  select * into v_svc from public.services where id = p_service and active;
  if not found then raise exception 'ERR_SERVICE'; end if;
  if coalesce(p_persons, 0) < 1 or p_persons > coalesce(v_svc.max_persons, 50) then raise exception 'ERR_PERSONS'; end if;
  if p_date is not null and (p_date < current_date or p_date > current_date + 365) then raise exception 'ERR_DATE'; end if;
  if length(p_notes) > 1000 then raise exception 'ERR_NOTES'; end if;
  if p_details is not null and (jsonb_typeof(p_details) <> 'object' or length(p_details::text) > 2000) then raise exception 'ERR_DETAILS'; end if;
  if (select count(*) from public.service_requests where reservation_id = v_res and status = 'new') >= 10 then
    raise exception 'ERR_TOO_MANY';
  end if;
  select g.first_name || ' ' || g.last_name into v_guest
  from public.reservations r join public.guests g on g.id = r.guest_id where r.id = v_res;
  insert into public.service_requests (service_id, room_id, reservation_id, guest_name, request_date, request_time,
                                       persons, details, notes, price, source)
  values (p_service, v_room, v_res, v_guest, p_date, p_time, p_persons, coalesce(p_details, '{}'::jsonb),
          nullif(trim(p_notes), ''),
          case v_svc.price_unit when 'per_booking' then v_svc.price when 'per_person' then v_svc.price * p_persons end,
          'tablet')
  returning id into v_id;
  return v_id;
end $$;

create function public.tablet_cancel(p_token text, p_request bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_res bigint;
begin
  v_res := public.tablet_reservation(public.tablet_room(p_token));
  update public.service_requests set status = 'cancelled'
  where id = p_request and reservation_id = v_res and status = 'new';
  if not found then raise exception 'ERR_CANNOT_CANCEL'; end if;
end $$;

-- ---------- Δικαιώματα εκτέλεσης ----------
revoke execute on function public.touch_updated_at(), public.random_code(int), public.admin_tablet_code(bigint),
  public.admin_tablet_unpair(bigint), public.tablet_pair(text), public.tablet_room(text), public.tablet_reservation(bigint),
  public.tablet_home(text), public.tablet_request(text, bigint, date, time, int, jsonb, text), public.tablet_cancel(text, bigint)
  from public, anon, authenticated;
grant execute on function public.tablet_pair(text), public.tablet_home(text),
  public.tablet_request(text, bigint, date, time, int, jsonb, text), public.tablet_cancel(text, bigint)
  to anon, authenticated;
grant execute on function public.admin_tablet_code(bigint), public.admin_tablet_unpair(bigint) to authenticated;

-- ---------- Αρχικό περιεχόμενο (επεξεργάσιμο από τον διαχειριστή) ----------
insert into public.info_sections (icon, title_el, title_en, body_el, body_en, sort) values
 ('🍳', 'Πρωινό', 'Breakfast', 'Το πρωινό σερβίρεται καθημερινά 08:00 – 10:30.', 'Breakfast is served daily 08:00 – 10:30.', 1),
 ('🏊', 'Πισίνα', 'Pool', 'Η πισίνα είναι ανοιχτή 09:00 – 19:00. Πετσέτες πισίνας στη ρεσεψιόν.', 'The pool is open 09:00 – 19:00. Pool towels are available at the reception.', 2),
 ('🛎️', 'Ρεσεψιόν', 'Reception', 'Η ρεσεψιόν είναι στη διάθεσή σας για ό,τι χρειαστείτε.', 'Our reception is happy to help with anything you need.', 3),
 ('🧳', 'Αναχώρηση', 'Check-out', 'Παρακαλούμε αφήστε το δωμάτιο έως την ώρα check-out. Μπορούμε να φυλάξουμε τις αποσκευές σας.', 'Please leave the room by check-out time. We are happy to store your luggage.', 4);

insert into public.services (kind, name_el, name_en, description_el, description_en, price_unit, max_persons, sort) values
 ('transfer', 'Transfer αεροδρόμιο', 'Airport transfer', 'Ιδιωτικό όχημα από/προς το αεροδρόμιο.', 'Private vehicle to/from the airport.', 'on_request', 8, 1),
 ('transfer', 'Transfer λιμάνι', 'Port transfer', 'Ιδιωτικό όχημα από/προς το λιμάνι.', 'Private vehicle to/from the port.', 'on_request', 8, 2),
 ('yachting', 'Κρουαζιέρα ηλιοβασιλέματος', 'Sunset cruise', 'Κρουαζιέρα με catamaran, κολύμπι, φαγητό και ποτά.', 'Catamaran cruise with swimming, food and drinks.', 'on_request', 20, 3),
 ('yachting', 'Ιδιωτικό σκάφος', 'Private yacht', 'Ναύλωση ιδιωτικού σκάφους για εσάς και την παρέα σας.', 'Private yacht charter for you and your party.', 'on_request', 12, 4);

-- ---------------------------------------------------------------------
-- 0005_channel_manager.sql
-- ---------------------------------------------------------------------
-- Σύνδεση με channel manager (πρώτος πάροχος: Channex.io).
-- Εισερχόμενα: κρατήσεις από Booking/Airbnb/Expedia κ.λπ. Εξερχόμενα: διαθεσιμότητα ανά τύπο δωματίου.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

alter table public.reservations
  add column channel text,
  add column external_id text,
  add column ota_code text;
create unique index reservations_channel_external on public.reservations(channel, external_id) where external_id is not null;

-- Ρυθμίσεις: χωρίς πολιτικές RLS, άρα το κλειδί API το διαβάζει μόνο ο server (service role).
create table public.channel_settings (
  id int primary key default 1 check (id = 1),
  provider text not null default 'channex' check (provider in ('channex')),
  environment text not null default 'staging' check (environment in ('staging','production')),
  api_key text,
  property_id text,
  enabled boolean not null default false,
  webhook_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  function_url text,  -- https://<έργο>.supabase.co/functions/v1/channel-sync, το ορίζει η εφαρμογή
  last_sync_at timestamptz,
  last_error text
);
insert into public.channel_settings default values;
alter table public.channel_settings enable row level security;

create table public.channel_room_map (
  room_type_id bigint primary key references public.room_types(id) on delete cascade,
  external_room_type_id text not null unique,
  external_rate_plan_id text
);
alter table public.channel_room_map enable row level security;
create policy "channel_room_map: admin" on public.channel_room_map for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create table public.channel_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  direction text not null check (direction in ('in','out','info')),
  ok boolean not null,
  message text,
  payload jsonb
);
create index on public.channel_log(created_at desc);
alter table public.channel_log enable row level security;
create policy "channel_log: admin read" on public.channel_log for select to authenticated using ((select public.is_admin()));

-- Ουρά αλλαγών διαθεσιμότητας: μία γραμμή ανά τύπο δωματίου με το εύρος ημερομηνιών που άλλαξε.
create table public.channel_ari_queue (
  room_type_id bigint primary key references public.room_types(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  pending boolean not null default true
);
alter table public.channel_ari_queue enable row level security;

create function public.channel_enqueue(p_type bigint, p_from date, p_to date) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_type is null or p_to <= p_from then return; end if;
  insert into public.channel_ari_queue as q (room_type_id, date_from, date_to, pending)
  values (p_type, p_from, p_to, true)
  on conflict (room_type_id) do update set
    date_from = case when q.pending then least(q.date_from, excluded.date_from) else excluded.date_from end,
    date_to   = case when q.pending then greatest(q.date_to, excluded.date_to) else excluded.date_to end,
    pending = true;
end $$;

create function public.channel_enqueue_full(p_days int default 500) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare r record;
begin
  for r in select room_type_id from public.channel_room_map loop
    perform public.channel_enqueue(r.room_type_id, current_date, current_date + p_days);
  end loop;
end $$;

create function public.channel_on_reservation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.channel_settings where enabled) then return null; end if;
  if tg_op <> 'INSERT' then perform public.channel_enqueue(old.room_type_id, old.check_in, old.check_out); end if;
  if tg_op <> 'DELETE' then perform public.channel_enqueue(new.room_type_id, new.check_in, new.check_out); end if;
  return null;
end $$;
create trigger reservations_channel_ari
  after insert or update of room_type_id, check_in, check_out, status or delete on public.reservations
  for each row execute function public.channel_on_reservation();

create function public.channel_on_room() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.channel_settings where enabled) then return null; end if;
  if tg_op = 'UPDATE' and old.active = new.active and old.room_type_id = new.room_type_id
     and (old.status = 'out_of_order') = (new.status = 'out_of_order') then
    return null;
  end if;
  if tg_op <> 'INSERT' then perform public.channel_enqueue(old.room_type_id, current_date, current_date + 500); end if;
  if tg_op <> 'DELETE' then perform public.channel_enqueue(new.room_type_id, current_date, current_date + 500); end if;
  return null;
end $$;
create trigger rooms_channel_ari
  after insert or update or delete on public.rooms
  for each row execute function public.channel_on_room();

-- Διαθέσιμα δωμάτια ενός τύπου ανά νύχτα [p_from, p_to).
create function public.channel_type_availability(p_type bigint, p_from date, p_to date)
returns table (day date, available int)
language sql stable security definer set search_path = '' as $$
  select d::date,
    greatest(0,
      (select count(*) from public.rooms r where r.room_type_id = p_type and r.active and r.status <> 'out_of_order')::int
      - (select count(*) from public.reservations x where x.room_type_id = p_type
           and x.status not in ('cancelled','no_show') and x.check_in <= d::date and x.check_out > d::date)::int)
  from generate_series(p_from, p_to - 1, interval '1 day') d
$$;

-- Παίρνει τις εκκρεμείς αλλαγές και τις επιστρέφει ως εύρη (date_to συμπεριλαμβάνεται) για τον channel manager.
create function public.channel_take_ari() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v jsonb;
begin
  with q as (
    update public.channel_ari_queue set pending = false where pending
    returning room_type_id, greatest(date_from, current_date) as f, least(date_to, current_date + 730) as t
  ), days as (
    select q.room_type_id, a.day, a.available
    from q cross join lateral public.channel_type_availability(q.room_type_id, q.f, q.t) a
    where q.t > q.f
  ), grp as (
    select room_type_id, day, available,
           day - (row_number() over (partition by room_type_id, available order by day))::int as g
    from days
  ), ranges as (
    select room_type_id, min(day) as date_from, max(day) as date_to, available
    from grp group by room_type_id, available, g
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'room_type_id', m.external_room_type_id, 'date_from', r.date_from, 'date_to', r.date_to, 'availability', r.available)
           order by m.external_room_type_id, r.date_from), '[]'::jsonb)
  into v
  from ranges r join public.channel_room_map m on m.room_type_id = r.room_type_id;
  return v;
end $$;

-- Εισαγωγή μιας «έκδοσης» κράτησης από το Channex (νέα / αλλαγή / ακύρωση).
-- Κάθε δωμάτιο της κράτησης γίνεται ξεχωριστή κράτηση με external_id = booking_id:αύξων.
create function public.channel_import_revision(p_rev jsonb) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  a jsonb := coalesce(p_rev->'attributes', p_rev);
  c jsonb := coalesce(a->'customer', '{}'::jsonb);
  v_booking text := coalesce(a->>'booking_id', p_rev->>'booking_id');
  v_status text := coalesce(a->>'status', 'new');
  v_code text := coalesce(a->>'ota_reservation_code', a->>'unique_id');
  v_ota text := coalesce(a->>'ota_name', '');
  v_source text;
  v_guest bigint;
  v_email text := nullif(lower(trim(coalesce(c->>'mail', c->>'email', ''))), '');
  v_room jsonb;
  i int := 0;
  v_type bigint;
  v_ext text;
  v_ex record;
  v_ci date; v_co date; v_adults int; v_children int; v_amount numeric;
  v_n int;
begin
  if v_booking is null then raise exception 'Λείπει το booking_id'; end if;
  v_source := case when v_ota ilike '%booking%' then 'booking' when v_ota ilike '%airbnb%' then 'airbnb'
                   when v_ota ilike '%expedia%' then 'expedia' else 'other' end;

  if v_status = 'cancelled' then
    update public.reservations set status = 'cancelled'
    where channel = 'channex' and split_part(external_id, ':', 1) = v_booking and status in ('pending','confirmed');
    get diagnostics v_n = row_count;
    return format('Ακύρωση %s %s (%s κρατήσεις)', v_ota, coalesce(v_code, v_booking), v_n);
  end if;

  -- Πελάτης: όποιος είναι ήδη συνδεδεμένος με την κράτηση, αλλιώς με το ίδιο email, αλλιώς νέος.
  select guest_id into v_guest from public.reservations
  where channel = 'channex' and split_part(external_id, ':', 1) = v_booking limit 1;
  if v_guest is null and v_email is not null then
    select id into v_guest from public.guests where lower(email) = v_email order by id desc limit 1;
  end if;
  if v_guest is null then
    insert into public.guests (first_name, last_name, email, phone, country, city, address)
    values (coalesce(nullif(trim(c->>'name'), ''), '—'), coalesce(nullif(trim(c->>'surname'), ''), coalesce(v_code, 'Channel')),
            v_email, nullif(c->>'phone', ''), nullif(c->>'country', ''), nullif(c->>'city', ''), nullif(c->>'address', ''))
    returning id into v_guest;
  else
    update public.guests set
      phone = coalesce(phone, nullif(c->>'phone', '')), email = coalesce(email, v_email), country = coalesce(country, nullif(c->>'country', ''))
    where id = v_guest;
  end if;

  for v_room in select value from jsonb_array_elements(coalesce(a->'rooms', '[]'::jsonb)) loop
    select room_type_id into v_type from public.channel_room_map where external_room_type_id = v_room->>'room_type_id';
    if v_type is null then
      raise exception 'Ο τύπος δωματίου % του channel manager δεν έχει αντιστοιχιστεί', coalesce(v_room->>'room_type_id', '(κενό)');
    end if;
    v_ext := v_booking || ':' || i;
    v_ci := coalesce(nullif(v_room->>'checkin_date', ''), a->>'arrival_date')::date;
    v_co := coalesce(nullif(v_room->>'checkout_date', ''), a->>'departure_date')::date;
    v_adults := greatest(1, coalesce((v_room->'occupancy'->>'adults')::int, 1));
    v_children := coalesce((v_room->'occupancy'->>'children')::int, 0) + coalesce((v_room->'occupancy'->>'infants')::int, 0);
    v_amount := coalesce(nullif(v_room->>'amount', '')::numeric, 0);

    select id, status, room_type_id into v_ex from public.reservations where channel = 'channex' and external_id = v_ext;
    if found then
      begin
        update public.reservations set
          check_in = v_ci, check_out = v_co, adults = v_adults, children = v_children, total_price = v_amount,
          room_type_id = case when status in ('checked_in','checked_out') then room_type_id else v_type end,
          room_id = case when v_ex.room_type_id = v_type or status in ('checked_in','checked_out') then room_id end,
          status = case when status in ('pending','cancelled') then 'confirmed' else status end,
          ota_code = v_code
        where id = v_ex.id;
      exception when exclusion_violation then
        -- Οι νέες ημερομηνίες συγκρούονται στο δωμάτιο που είχε ανατεθεί: η κράτηση μένει χωρίς δωμάτιο.
        if v_ex.status in ('checked_in','checked_out') then raise; end if;
        update public.reservations set
          check_in = v_ci, check_out = v_co, adults = v_adults, children = v_children, total_price = v_amount,
          room_type_id = v_type, room_id = null,
          status = case when status in ('pending','cancelled') then 'confirmed' else status end, ota_code = v_code
        where id = v_ex.id;
      end;
    else
      insert into public.reservations (guest_id, room_type_id, check_in, check_out, adults, children, status, source,
                                       total_price, notes, channel, external_id, ota_code, created_by)
      values (v_guest, v_type, v_ci, v_co, v_adults, v_children, 'confirmed', v_source, v_amount,
              nullif(trim(coalesce(a->>'notes', '')), ''), 'channex', v_ext, v_code, null);
    end if;
    i := i + 1;
  end loop;
  if i = 0 then raise exception 'Η κράτηση δεν περιέχει δωμάτια'; end if;

  -- Δωμάτια που αφαιρέθηκαν από την κράτηση με αλλαγή.
  update public.reservations set status = 'cancelled'
  where channel = 'channex' and split_part(external_id, ':', 1) = v_booking
    and split_part(external_id, ':', 2)::int >= i and status in ('pending','confirmed');

  return format('%s %s %s (%s δωμάτια, %s → %s)',
    case v_status when 'new' then 'Νέα κράτηση' else 'Αλλαγή κράτησης' end, v_ota, coalesce(v_code, v_booking), i,
    a->>'arrival_date', a->>'departure_date');
end $$;

-- ---------- Ρυθμίσεις από την εφαρμογή (διαχειριστής) ----------
create function public.channel_get_settings() returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  return (select json_build_object('provider', provider, 'environment', environment, 'property_id', property_id,
            'enabled', enabled, 'has_key', api_key is not null, 'key_hint', right(api_key, 4),
            'webhook_token', webhook_token, 'last_sync_at', last_sync_at, 'last_error', last_error,
            'pending', (select count(*) from public.channel_ari_queue where pending))
          from public.channel_settings where id = 1);
end $$;

create function public.channel_save_settings(p_environment text, p_api_key text, p_property_id text, p_enabled boolean, p_function_url text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_was boolean;
begin
  if not public.is_admin() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  select enabled into v_was from public.channel_settings where id = 1;
  update public.channel_settings set
    environment = p_environment,
    api_key = coalesce(nullif(trim(p_api_key), ''), api_key),
    property_id = nullif(trim(p_property_id), ''),
    enabled = p_enabled,
    function_url = coalesce(nullif(trim(p_function_url), ''), function_url)
  where id = 1;
  if p_enabled and not v_was then perform public.channel_enqueue_full(); end if;
end $$;

create function public.channel_new_token() returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  update public.channel_settings set webhook_token = encode(extensions.gen_random_bytes(24), 'hex') where id = 1;
end $$;

-- ---------- Δικαιώματα ----------
revoke execute on function public.channel_enqueue(bigint, date, date), public.channel_enqueue_full(int),
  public.channel_on_reservation(), public.channel_on_room(), public.channel_type_availability(bigint, date, date),
  public.channel_take_ari(), public.channel_import_revision(jsonb), public.channel_get_settings(),
  public.channel_save_settings(text, text, text, boolean, text), public.channel_new_token()
  from public, anon, authenticated;
grant execute on function public.channel_enqueue_full(int), public.channel_take_ari(), public.channel_import_revision(jsonb),
  public.channel_type_availability(bigint, date, date), public.channel_enqueue(bigint, date, date) to service_role;
grant execute on function public.channel_get_settings(), public.channel_save_settings(text, text, text, boolean, text),
  public.channel_new_token() to authenticated;

-- ---------- Αυτόματος συγχρονισμός κάθε 2 λεπτά ----------
select cron.schedule('channel-sync', '*/2 * * * *', $cron$
  select net.http_post(
    url := s.function_url || '?token=' || s.webhook_token,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "sync", "source": "cron"}'::jsonb)
  from public.channel_settings s
  where s.enabled and s.api_key is not null and s.property_id is not null and s.function_url is not null
$cron$);
