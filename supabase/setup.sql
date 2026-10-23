-- =====================================================================
-- Πρόγραμμα ξενοδοχείου: πλήρης εγκατάσταση βάσης σε ΝΕΟ έργο Supabase.
-- Supabase → SQL Editor → New query → επικόλλησε ΟΛΟ το αρχείο → Run.
-- Τρέχει μία φορά, σε άδειο έργο.
-- Περιέχει με τη σειρά: supabase/migrations/0001 … 0011.
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


-- ---------------------------------------------------------------------
-- 0006_webhotelier.sql
-- ---------------------------------------------------------------------
-- Δεύτερος πάροχος channel manager: WebHotelier (rest.reserve-online.net).
-- Σύνδεση με Hotelier API account (όνομα χρήστη + κωδικός) και κωδικό καταλύματος.
-- Το Channex παραμένει διαθέσιμο ως επιλογή.

alter table public.channel_settings drop constraint if exists channel_settings_provider_check;
alter table public.channel_settings add constraint channel_settings_provider_check check (provider in ('channex','webhotelier'));
alter table public.channel_settings alter column provider set default 'webhotelier';
alter table public.channel_settings
  add column if not exists api_username text,
  add column if not exists last_pull_at timestamptz;  -- η WebHotelier δέχεται λήψη εκκρεμών κρατήσεων το πολύ κάθε 5'
update public.channel_settings set provider = 'webhotelier' where id = 1 and api_key is null;

-- Εισαγωγή κράτησης: ίδια λογική για όλους τους παρόχους. Ο πάροχος γράφεται στη στήλη channel.
-- Η κράτηση έρχεται στη μορφή του Channex (η Edge Function μετατρέπει τις κρατήσεις της WebHotelier).
create or replace function public.channel_import_revision(p_rev jsonb) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  a jsonb := coalesce(p_rev->'attributes', p_rev);
  c jsonb := coalesce(a->'customer', '{}'::jsonb);
  v_channel text := coalesce((select provider from public.channel_settings where id = 1), 'channex');
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
                   when v_ota ilike '%expedia%' then 'expedia' when v_ota ilike '%webhotelier%' then 'online' else 'other' end;

  if v_status = 'cancelled' then
    update public.reservations set status = 'cancelled'
    where channel = v_channel and split_part(external_id, ':', 1) = v_booking and status in ('pending','confirmed');
    get diagnostics v_n = row_count;
    return format('Ακύρωση %s %s (%s κρατήσεις)', v_ota, coalesce(v_code, v_booking), v_n);
  end if;

  -- Πελάτης: όποιος είναι ήδη συνδεδεμένος με την κράτηση, αλλιώς με το ίδιο email, αλλιώς νέος.
  select guest_id into v_guest from public.reservations
  where channel = v_channel and split_part(external_id, ':', 1) = v_booking limit 1;
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

    select id, status, room_type_id into v_ex from public.reservations where channel = v_channel and external_id = v_ext;
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
              nullif(trim(coalesce(a->>'notes', '')), ''), v_channel, v_ext, v_code, null);
    end if;
    i := i + 1;
  end loop;
  if i = 0 then raise exception 'Η κράτηση δεν περιέχει δωμάτια'; end if;

  -- Δωμάτια που αφαιρέθηκαν από την κράτηση με αλλαγή.
  update public.reservations set status = 'cancelled'
  where channel = v_channel and split_part(external_id, ':', 1) = v_booking
    and split_part(external_id, ':', 2)::int >= i and status in ('pending','confirmed');

  return format('%s %s %s (%s δωμάτια, %s → %s)',
    case v_status when 'new' then 'Νέα κράτηση' else 'Αλλαγή κράτησης' end, v_ota, coalesce(v_code, v_booking), i,
    a->>'arrival_date', a->>'departure_date');
end $$;

create or replace function public.channel_get_settings() returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  return (select json_build_object('provider', provider, 'environment', environment, 'property_id', property_id,
            'api_username', api_username,
            'enabled', enabled, 'has_key', api_key is not null, 'key_hint', right(api_key, 4),
            'webhook_token', webhook_token, 'last_sync_at', last_sync_at, 'last_error', last_error,
            'pending', (select count(*) from public.channel_ari_queue where pending))
          from public.channel_settings where id = 1);
end $$;

-- Νέα έκδοση με πάροχο και όνομα χρήστη (η παλιά μένει για συμβατότητα).
create or replace function public.channel_save_settings(p_provider text, p_username text, p_environment text, p_api_key text,
  p_property_id text, p_enabled boolean, p_function_url text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_was boolean; v_prov text;
begin
  if not public.is_admin() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  select enabled, provider into v_was, v_prov from public.channel_settings where id = 1;
  update public.channel_settings set
    provider = p_provider,
    api_username = nullif(trim(p_username), ''),
    environment = coalesce(nullif(p_environment, ''), environment),
    -- Αλλαγή παρόχου: το παλιό κλειδί/κωδικός δεν ισχύει.
    api_key = case when p_provider is distinct from v_prov then nullif(trim(p_api_key), '')
                   else coalesce(nullif(trim(p_api_key), ''), api_key) end,
    property_id = nullif(trim(p_property_id), ''),
    enabled = p_enabled,
    function_url = coalesce(nullif(trim(p_function_url), ''), function_url),
    last_pull_at = case when p_provider is distinct from v_prov then null else last_pull_at end
  where id = 1;
  if p_enabled and (not v_was or p_provider is distinct from v_prov) then perform public.channel_enqueue_full(); end if;
end $$;

revoke execute on function public.channel_save_settings(text, text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.channel_save_settings(text, text, text, text, text, boolean, text) to authenticated;

-- Συγχρονισμός κάθε 5 λεπτά (όριο της WebHotelier για τη λήψη εκκρεμών κρατήσεων).
-- Οι κρατήσεις έρχονται και αμέσως μέσω PUSH στο webhook.
select cron.schedule('channel-sync', '*/5 * * * *', $cron$
  select net.http_post(
    url := s.function_url || '?token=' || s.webhook_token,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"action": "sync", "source": "cron"}'::jsonb)
  from public.channel_settings s
  where s.enabled and s.api_key is not null and s.property_id is not null and s.function_url is not null
$cron$);


-- ---------------------------------------------------------------------
-- 0007_room_qr.sql
-- ---------------------------------------------------------------------
-- QR ανά δωμάτιο: ο πελάτης ανοίγει την οθόνη δωματίου στο δικό του κινητό (room.html?r=<κωδικός>),
-- επιβεβαιώνει τη διαμονή του με το επώνυμο ή τον κωδικό κράτησης, και η πρόσβαση ισχύει μόνο
-- όσο η διαμονή του είναι σε εξέλιξη (checked_in). Χωρίς εφαρμογή και χωρίς λογαριασμό.

create extension if not exists unaccent with schema extensions;

-- Μόνιμος κωδικός του τυπωμένου QR κάθε δωματίου (αλλάζει μόνο αν τον ανανεώσει ο διαχειριστής).
alter table public.rooms add column if not exists qr_code text;
update public.rooms set qr_code = public.random_code(10) where qr_code is null;
-- Η προεπιλογή εκτελείται με τα δικαιώματα του χρήστη που προσθέτει δωμάτιο, γι' αυτό όχι random_code (δεν επιτρέπεται σε authenticated).
alter table public.rooms alter column qr_code set default upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12));
alter table public.rooms alter column qr_code set not null;
create unique index if not exists rooms_qr_code on public.rooms(qr_code);

-- Συνεδρίες κινητών: κρατάμε μόνο το hash του κλειδιού, δεμένο με τη συγκεκριμένη διαμονή.
create table if not exists public.guest_sessions (
  token_hash text primary key,
  reservation_id bigint not null,   -- χωρίς ξένο κλειδί: η ισχύς ελέγχεται πάντα με join στις κρατήσεις
  room_id bigint not null,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists guest_sessions_reservation on public.guest_sessions(reservation_id);
create index if not exists guest_sessions_room on public.guest_sessions(room_id);
alter table public.guest_sessions enable row level security;

-- Αποτυχημένες προσπάθειες, για όριο ανά δωμάτιο.
create table if not exists public.guest_login_failures (
  id bigint generated always as identity primary key,
  room_id bigint not null,
  at timestamptz not null default now()
);
create index if not exists guest_login_failures_room on public.guest_login_failures(room_id, at);
alter table public.guest_login_failures enable row level security;

-- Κανονικοποίηση ονόματος: πεζά, χωρίς τόνους, ς = σ, χωρίς κενά/παύλες/αποστρόφους.
-- (ΠΑΠΑΔΟΠΟΥΛΟΣ = Παπαδόπουλος, O'Brien = obrien. Ελληνικά ≠ λατινικά: Papadopoulos ≠ Παπαδόπουλος.)
create or replace function public.norm_name(p text) returns text
language sql stable set search_path = '' as $$
  select regexp_replace(translate(lower(extensions.unaccent(coalesce(p, ''))), 'ς', 'σ'), '[\s\-''’.]', '', 'g')
$$;

-- Πληροφορίες για την οθόνη εισόδου (χωρίς στοιχεία πελάτη).
create or replace function public.guest_room_info(p_qr text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare v_room record;
begin
  select id, number into v_room from public.rooms where qr_code = upper(trim(coalesce(p_qr, ''))) and active;
  if not found then raise exception 'ERR_QR'; end if;
  return json_build_object('room', v_room.number,
    'hotel', (select hotel_name from public.settings where id = 1),
    'cover_image_url', (select cover_image_url from public.settings where id = 1));
end $$;

-- Επιβεβαίωση διαμονής: επώνυμο του πελάτη που έχει κάνει check-in στο δωμάτιο, ή κωδικός κράτησης.
create or replace function public.guest_login(p_qr text, p_secret text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_room bigint; v_res record; v_token text; v_secret text := trim(coalesce(p_secret, ''));
begin
  select id into v_room from public.rooms where qr_code = upper(trim(coalesce(p_qr, ''))) and active;
  if not found then raise exception 'ERR_QR'; end if;
  if (select count(*) from public.guest_login_failures where room_id = v_room and at > now() - interval '15 minutes') >= 8 then
    raise exception 'ERR_LOCKED';
  end if;
  select r.id, r.code, g.last_name into v_res
  from public.reservations r join public.guests g on g.id = r.guest_id
  where r.room_id = v_room and r.status = 'checked_in'
  order by r.check_in desc limit 1;
  if not found then raise exception 'ERR_NO_GUEST'; end if;
  if length(v_secret) < 2 or not (
       public.norm_name(v_secret) = public.norm_name(v_res.last_name)
       or upper(replace(v_secret, ' ', '')) = v_res.code) then
    -- Χωρίς raise: αλλιώς θα αναιρούνταν και η καταγραφή της αποτυχίας. Το κινητό δείχνει «λάθος στοιχεία».
    insert into public.guest_login_failures (room_id) values (v_room);
    return null;
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.guest_sessions (token_hash, reservation_id, room_id)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_res.id, v_room);
  return v_token;
end $$;

-- Κοινό για tablet και κινητό: από το κλειδί στο δωμάτιο. Για κινητό, μόνο όσο η ίδια διαμονή είναι σε εξέλιξη.
create or replace function public.tablet_room(p_token text) returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare v_room bigint; v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'); v_s record;
begin
  select room_id into v_room from public.tablets where token_hash = v_hash;
  if found then return v_room; end if;
  select s.room_id, s.reservation_id into v_s from public.guest_sessions s
  join public.reservations r on r.id = s.reservation_id
  where s.token_hash = v_hash and r.status = 'checked_in' and r.room_id = s.room_id;
  if not found then raise exception 'ERR_TABLET'; end if;
  update public.guest_sessions set last_seen = now() where token_hash = v_hash and last_seen < now() - interval '5 minutes';
  return v_s.room_id;
end $$;

-- Ίδιο με πριν, αλλά το «τελευταία επαφή» του tablet ενημερώνεται μόνο από το ίδιο το tablet.
create or replace function public.tablet_home(p_token text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare v_room bigint; v_res bigint;
begin
  v_room := public.tablet_room(p_token);
  update public.tablets set last_seen = now()
  where room_id = v_room and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
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

-- Αιτήματα από κινητό (QR): σημειώνονται για να φαίνεται από πού ήρθαν.
alter table public.service_requests add column if not exists via_qr boolean not null default false;

create or replace function public.tablet_request(
  p_token text, p_service bigint, p_date date, p_time time, p_persons int, p_details jsonb, p_notes text)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_room bigint; v_res bigint; v_svc record; v_guest text; v_id bigint; v_qr boolean;
begin
  v_room := public.tablet_room(p_token);
  v_qr := not exists (select 1 from public.tablets where room_id = v_room
                  and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'));
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
                                       persons, details, notes, price, source, via_qr)
  values (p_service, v_room, v_res, v_guest, p_date, p_time, p_persons, coalesce(p_details, '{}'::jsonb),
          nullif(trim(p_notes), ''),
          case v_svc.price_unit when 'per_booking' then v_svc.price when 'per_person' then v_svc.price * p_persons end,
          'tablet', v_qr)
  returning id into v_id;
  return v_id;
end $$;

-- Νέος κωδικός QR για ένα δωμάτιο (π.χ. αν διέρρευσε): το παλιό QR σταματά να λειτουργεί.
-- Όσοι έχουν ήδη συνδεθεί κρατούν την πρόσβαση μέχρι το check-out τους (είναι δεμένη με τη διαμονή).
create or replace function public.admin_room_new_qr(p_room bigint) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_code text;
begin
  if not public.is_admin() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  v_code := public.random_code(10);
  update public.rooms set qr_code = v_code where id = p_room;
  if not found then raise exception 'Το δωμάτιο δεν βρέθηκε'; end if;
  return v_code;
end $$;

revoke execute on function public.norm_name(text), public.guest_room_info(text), public.guest_login(text, text),
  public.admin_room_new_qr(bigint), public.tablet_room(text), public.tablet_home(text),
  public.tablet_request(text, bigint, date, time, int, jsonb, text) from public, anon, authenticated;
grant execute on function public.guest_room_info(text), public.guest_login(text, text), public.tablet_home(text),
  public.tablet_request(text, bigint, date, time, int, jsonb, text) to anon, authenticated;
grant execute on function public.admin_room_new_qr(bigint) to authenticated;


-- ---------------------------------------------------------------------
-- 0008_dining.sql
-- ---------------------------------------------------------------------
-- Smart Dining: δίγλωσσοι κατάλογοι (εστιατόριο, pool bar κ.λπ.) με αλλεργιογόνα, παραγγελίες από
-- tablet / TV / κινητό (QR) προς δωμάτιο ή πισίνα, και χρέωση στον λογαριασμό του δωματίου.

-- ---------- Χρεώσεις δωματίου (folio) ----------
-- Ξεχωριστά από την τιμή διαμονής (total_price), την οποία μπορεί να ενημερώνει ο channel manager.
alter table public.reservations add column if not exists extras numeric(10,2) not null default 0;

create table if not exists public.reservation_charges (
  id bigint generated always as identity primary key,
  reservation_id bigint not null references public.reservations(id),
  description text not null,
  amount numeric(10,2) not null,              -- αρνητικό ποσό = διόρθωση / έκπτωση
  order_id bigint,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists reservation_charges_res on public.reservation_charges(reservation_id);
create unique index if not exists reservation_charges_order on public.reservation_charges(order_id) where order_id is not null and amount > 0;
alter table public.reservation_charges enable row level security;
create policy "reservation_charges: front read" on public.reservation_charges for select to authenticated using ((select public.is_front()));
create policy "reservation_charges: front insert" on public.reservation_charges for insert to authenticated with check ((select public.is_front()));

create or replace function public.charges_sum() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.reservations set extras = (select coalesce(sum(amount), 0) from public.reservation_charges where reservation_id = new.reservation_id)
  where id = new.reservation_id;
  return null;
end $$;
create trigger reservation_charges_sum after insert or update on public.reservation_charges
  for each row execute function public.charges_sum();

-- ---------- Κατάλογοι ----------
create table if not exists public.menu_outlets (
  id bigint generated always as identity primary key,
  name_el text not null,
  name_en text,
  icon text,
  hours_el text,
  hours_en text,
  description_el text,
  description_en text,
  accepts_orders boolean not null default true,   -- προσωρινό κλείσιμο παραγγελιών (π.χ. εκτός ωραρίου)
  deliver_room boolean not null default true,
  deliver_pool boolean not null default false,
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists public.menu_categories (
  id bigint generated always as identity primary key,
  outlet_id bigint not null references public.menu_outlets(id),
  name_el text not null,
  name_en text,
  sort int not null default 0,
  active boolean not null default true
);
create index if not exists menu_categories_outlet on public.menu_categories(outlet_id);

-- Αλλεργιογόνα: τα 14 του Κανονισμού (ΕΕ) 1169/2011.
create table if not exists public.menu_items (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.menu_categories(id),
  name_el text not null,
  name_en text,
  description_el text,
  description_en text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  allergens text[] not null default '{}' check (allergens <@ array['gluten','crustaceans','eggs','fish','peanuts','soy','milk','nuts','celery','mustard','sesame','sulphites','lupin','molluscs']),
  tags text[] not null default '{}' check (tags <@ array['vegetarian','vegan','gluten_free','spicy','local','signature']),
  available boolean not null default true,        -- «τελείωσε» για σήμερα
  sort int not null default 0,
  active boolean not null default true
);
create index if not exists menu_items_category on public.menu_items(category_id);

alter table public.menu_outlets enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
create policy "menu_outlets: read" on public.menu_outlets for select to anon, authenticated using (true);
create policy "menu_outlets: admin" on public.menu_outlets for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "menu_categories: read" on public.menu_categories for select to anon, authenticated using (true);
create policy "menu_categories: admin" on public.menu_categories for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "menu_items: read" on public.menu_items for select to anon, authenticated using (true);
create policy "menu_items: admin" on public.menu_items for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
-- Η ρεσεψιόν μπορεί να σημειώσει ότι ένα πιάτο τελείωσε.
create policy "menu_items: front availability" on public.menu_items for update to authenticated
  using ((select public.is_front())) with check ((select public.is_front()));

-- ---------- Παραγγελίες ----------
create table if not exists public.orders (
  id bigint generated always as identity primary key,
  outlet_id bigint not null references public.menu_outlets(id),
  reservation_id bigint references public.reservations(id),
  room_id bigint references public.rooms(id),
  guest_name text,
  deliver_to text not null check (deliver_to in ('room','pool')),
  location text,                                   -- π.χ. αριθμός ξαπλώστρας
  notes text,
  charge_to_room boolean not null default true,
  total numeric(10,2) not null default 0,
  status text not null default 'new' check (status in ('new','preparing','delivered','cancelled')),
  via text not null default 'tablet' check (via in ('tablet','qr','staff')),
  staff_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_status on public.orders(status);
create index if not exists orders_reservation on public.orders(reservation_id);
create index if not exists orders_created on public.orders(created_at desc);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id),
  item_id bigint references public.menu_items(id),
  name_el text not null,
  name_en text,
  price numeric(10,2) not null,
  qty int not null check (qty between 1 and 20),
  notes text
);
create index if not exists order_items_order on public.order_items(order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
create policy "orders: front" on public.orders for select to authenticated using ((select public.is_front()));
create policy "orders: front update" on public.orders for update to authenticated using ((select public.is_front())) with check ((select public.is_front()));
create policy "order_items: front" on public.order_items for select to authenticated using ((select public.is_front()));

create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- Παράδοση με χρέωση δωματίου → χρέωση στην κράτηση. Ακύρωση μετά την παράδοση → αντιλογισμός.
create or replace function public.order_charge() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_desc text;
begin
  if new.reservation_id is null or not new.charge_to_room or new.status is not distinct from old.status then return null; end if;
  v_desc := format('%s · παραγγελία #%s', (select name_el from public.menu_outlets where id = new.outlet_id), new.id);
  if new.status = 'delivered' then
    insert into public.reservation_charges (reservation_id, description, amount, order_id, created_by)
    values (new.reservation_id, v_desc, new.total, new.id, null)
    on conflict do nothing;
  elsif old.status = 'delivered' and new.status = 'cancelled' then
    insert into public.reservation_charges (reservation_id, description, amount, order_id, created_by)
    values (new.reservation_id, 'Ακύρωση: ' || v_desc, -new.total, new.id, null);
  end if;
  return null;
end $$;
create trigger orders_charge after update of status on public.orders
  for each row execute function public.order_charge();

-- ---------- Οθόνη δωματίου (tablet / TV / κινητό) ----------
create or replace function public.tablet_home(p_token text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare v_room bigint; v_res bigint;
begin
  v_room := public.tablet_room(p_token);
  update public.tablets set last_seen = now()
  where room_id = v_room and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
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
               where v_res is not null and q.reservation_id = v_res) q), '[]'::json),
    'dining', coalesce((select json_agg(o order by o.sort, o.id) from (
              select mo.id, mo.name_el, mo.name_en, mo.icon, mo.hours_el, mo.hours_en, mo.description_el, mo.description_en,
                     mo.accepts_orders, mo.deliver_room, mo.deliver_pool, mo.sort,
                     coalesce((select json_agg(c order by c.sort, c.id) from (
                       select mc.id, mc.name_el, mc.name_en, mc.sort,
                              coalesce((select json_agg(i order by i.sort, i.id) from (
                                select mi.id, mi.name_el, mi.name_en, mi.description_el, mi.description_en, mi.price, mi.image_url,
                                       mi.allergens, mi.tags, mi.available, mi.sort
                                from public.menu_items mi where mi.category_id = mc.id and mi.active) i), '[]'::json) as items
                       from public.menu_categories mc where mc.outlet_id = mo.id and mc.active) c), '[]'::json) as categories
              from public.menu_outlets mo where mo.active) o), '[]'::json),
    'orders', coalesce((select json_agg(x order by x.created_at desc) from (
              select o.id, o.outlet_id, mo.name_el as outlet_el, mo.name_en as outlet_en, o.deliver_to, o.location, o.total,
                     o.charge_to_room, o.status, o.created_at,
                     (select json_agg(json_build_object('name_el', oi.name_el, 'name_en', oi.name_en, 'qty', oi.qty) order by oi.id)
                      from public.order_items oi where oi.order_id = o.id) as items
              from public.orders o join public.menu_outlets mo on mo.id = o.outlet_id
              where v_res is not null and o.reservation_id = v_res) x), '[]'::json)
  );
end $$;

-- Νέα παραγγελία. p_items: [{"id": 12, "qty": 2, "notes": "χωρίς κρεμμύδι"}, …]. Οι τιμές υπολογίζονται εδώ, όχι στη συσκευή.
create or replace function public.tablet_order(p_token text, p_outlet bigint, p_items jsonb, p_deliver_to text,
  p_location text, p_notes text, p_charge_room boolean)
returns bigint language plpgsql volatile security definer set search_path = '' as $$
declare v_room bigint; v_res bigint; v_out record; v_guest text; v_id bigint; v_qr boolean; v_it jsonb; v_mi record;
        v_qty int; v_total numeric := 0;
begin
  v_room := public.tablet_room(p_token);
  v_qr := not exists (select 1 from public.tablets where room_id = v_room
                  and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex'));
  v_res := public.tablet_reservation(v_room);
  if v_res is null then raise exception 'ERR_NO_GUEST'; end if;
  select * into v_out from public.menu_outlets where id = p_outlet and active;
  if not found then raise exception 'ERR_OUTLET'; end if;
  if not v_out.accepts_orders then raise exception 'ERR_CLOSED'; end if;
  if p_deliver_to not in ('room','pool') or (p_deliver_to = 'room' and not v_out.deliver_room)
     or (p_deliver_to = 'pool' and not v_out.deliver_pool) then raise exception 'ERR_DELIVERY'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then raise exception 'ERR_ITEMS'; end if;
  if length(p_notes) > 500 or length(p_location) > 40 then raise exception 'ERR_NOTES'; end if;
  if (select count(*) from public.orders where reservation_id = v_res and status in ('new','preparing')) >= 5 then raise exception 'ERR_TOO_MANY'; end if;

  select g.first_name || ' ' || g.last_name into v_guest
  from public.reservations r join public.guests g on g.id = r.guest_id where r.id = v_res;
  insert into public.orders (outlet_id, reservation_id, room_id, guest_name, deliver_to, location, notes, charge_to_room, via)
  values (p_outlet, v_res, v_room, v_guest, p_deliver_to, nullif(trim(p_location), ''), nullif(trim(p_notes), ''),
          coalesce(p_charge_room, true), case when v_qr then 'qr' else 'tablet' end)
  returning id into v_id;

  for v_it in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_it->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 20 or length(v_it->>'notes') > 200 then raise exception 'ERR_ITEMS'; end if;
    select mi.* into v_mi from public.menu_items mi join public.menu_categories mc on mc.id = mi.category_id
    where mi.id = (v_it->>'id')::bigint and mc.outlet_id = p_outlet and mi.active and mc.active;
    if not found then raise exception 'ERR_ITEMS'; end if;
    if not v_mi.available then raise exception 'ERR_UNAVAILABLE'; end if;
    insert into public.order_items (order_id, item_id, name_el, name_en, price, qty, notes)
    values (v_id, v_mi.id, v_mi.name_el, v_mi.name_en, v_mi.price, v_qty, nullif(trim(v_it->>'notes'), ''));
    v_total := v_total + v_mi.price * v_qty;
  end loop;
  update public.orders set total = v_total where id = v_id;
  return v_id;
end $$;

create or replace function public.tablet_order_cancel(p_token text, p_order bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_res bigint;
begin
  v_res := public.tablet_reservation(public.tablet_room(p_token));
  update public.orders set status = 'cancelled' where id = p_order and reservation_id = v_res and status = 'new';
  if not found then raise exception 'ERR_CANNOT_CANCEL'; end if;
end $$;

revoke execute on function public.charges_sum(), public.order_charge(), public.tablet_home(text),
  public.tablet_order(text, bigint, jsonb, text, text, text, boolean), public.tablet_order_cancel(text, bigint)
  from public, anon, authenticated;
grant execute on function public.tablet_home(text), public.tablet_order(text, bigint, jsonb, text, text, text, boolean),
  public.tablet_order_cancel(text, bigint) to anon, authenticated;

-- ---------- Αρχικός κατάλογος (παράδειγμα, επεξεργάσιμος από τον διαχειριστή· οι τιμές είναι ενδεικτικές) ----------
do $seed$
declare r bigint; p bigint; c bigint;
begin
  if exists (select 1 from public.menu_outlets) then return; end if;
  insert into public.menu_outlets (name_el, name_en, icon, hours_el, hours_en, description_el, description_en, deliver_room, deliver_pool, sort)
  values ('Εστιατόριο', 'Restaurant', '🍽️', 'Καθημερινά 13:00 – 23:00', 'Daily 13:00 – 23:00',
          'Μεσογειακή και σαντορινιά κουζίνα με τοπικά προϊόντα.', 'Mediterranean and Santorinian cuisine with local produce.', true, false, 1)
  returning id into r;
  insert into public.menu_outlets (name_el, name_en, icon, hours_el, hours_en, description_el, description_en, deliver_room, deliver_pool, sort)
  values ('Pool Bar', 'Pool Bar', '🍹', 'Καθημερινά 10:00 – 19:00', 'Daily 10:00 – 19:00',
          'Ποτά, cocktails και ελαφριά γεύματα.', 'Drinks, cocktails and light meals.', true, true, 2)
  returning id into p;

  insert into public.menu_categories (outlet_id, name_el, name_en, sort) values (r, 'Ορεκτικά', 'Starters', 1) returning id into c;
  insert into public.menu_items (category_id, name_el, name_en, description_el, description_en, price, allergens, tags, sort) values
    (c, 'Φάβα Σαντορίνης', 'Santorini fava', 'Με κάπαρη, κρεμμύδι και ελαιόλαδο.', 'With capers, onion and olive oil.', 9, '{}', '{vegan,local,gluten_free}', 1),
    (c, 'Ντοματοκεφτέδες', 'Tomato fritters', 'Με σαντορινιό ντοματάκι και δυόσμο.', 'With Santorini cherry tomatoes and mint.', 9, '{gluten}', '{vegetarian,local}', 2),
    (c, 'Λευκή μελιτζάνα ψητή', 'Grilled white aubergine', 'Με φέτα και μέλι.', 'With feta and honey.', 11, '{milk}', '{vegetarian,local}', 3);
  insert into public.menu_categories (outlet_id, name_el, name_en, sort) values (r, 'Κυρίως', 'Mains', 2) returning id into c;
  insert into public.menu_items (category_id, name_el, name_en, description_el, description_en, price, allergens, tags, sort) values
    (c, 'Ψάρι ημέρας', 'Catch of the day', 'Σχάρας, με χόρτα και λαδολέμονο.', 'Grilled, with greens and lemon-oil dressing.', 26, '{fish}', '{gluten_free}', 1),
    (c, 'Αρνάκι γιουβέτσι', 'Lamb giouvetsi', 'Σιγομαγειρεμένο με κριθαράκι.', 'Slow-cooked with orzo.', 22, '{gluten,celery}', '{signature}', 2);

  insert into public.menu_categories (outlet_id, name_el, name_en, sort) values (p, 'Cocktails', 'Cocktails', 1) returning id into c;
  insert into public.menu_items (category_id, name_el, name_en, description_el, description_en, price, allergens, tags, sort) values
    (c, 'Mojito', 'Mojito', 'Ρούμι, λάιμ, δυόσμος.', 'Rum, lime, mint.', 12, '{}', '{}', 1),
    (c, 'Santorini Spritz', 'Santorini Spritz', 'Με λευκό κρασί Ασύρτικο.', 'With Assyrtiko white wine.', 13, '{sulphites}', '{local,signature}', 2);
  insert into public.menu_categories (outlet_id, name_el, name_en, sort) values (p, 'Καφές & χυμοί', 'Coffee & juices', 2) returning id into c;
  insert into public.menu_items (category_id, name_el, name_en, description_el, description_en, price, allergens, tags, sort) values
    (c, 'Freddo espresso', 'Freddo espresso', null, null, 4.5, '{}', '{}', 1),
    (c, 'Φρέσκος χυμός πορτοκάλι', 'Fresh orange juice', null, null, 6, '{}', '{vegan}', 2);
  insert into public.menu_categories (outlet_id, name_el, name_en, sort) values (p, 'Ελαφριά γεύματα', 'Light meals', 3) returning id into c;
  insert into public.menu_items (category_id, name_el, name_en, description_el, description_en, price, allergens, tags, sort) values
    (c, 'Club sandwich', 'Club sandwich', 'Με πατάτες τηγανητές.', 'With french fries.', 14, '{gluten,eggs,milk,mustard}', '{}', 1),
    (c, 'Χωριάτικη σαλάτα', 'Greek salad', 'Με κάπαρη και κρίταμο.', 'With capers and rock samphire.', 12, '{milk}', '{vegetarian,gluten_free,local}', 2);
end $seed$;


-- ---------------------------------------------------------------------
-- 0009_stats_brand_services.sql
-- ---------------------------------------------------------------------
-- 1) Υπηρεσίες: ενοικίαση αυτοκινήτου / ATV, διάρκεια, συλλογή φωτογραφιών.
-- 2) Ταυτότητα ξενοδοχείου στις οθόνες πελάτη: χρώματα και λογότυπο.
-- 3) Στατιστικά χρήσης: μόνο συγκεντρωτικοί μετρητές ανά ημέρα, χωρίς προφίλ επισκεπτών.

-- ---------- 1. Υπηρεσίες ----------
alter table public.services drop constraint if exists services_kind_check;
alter table public.services add constraint services_kind_check
  check (kind in ('transfer','rental','yachting','tour','spa','restaurant','other'));
alter table public.services
  add column if not exists duration_el text,
  add column if not exists duration_en text,
  add column if not exists gallery text[] not null default '{}';

-- ---------- 2. Ταυτότητα ----------
alter table public.settings
  add column if not exists brand_color text check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists accent_color text check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists logo_url text check (logo_url ~* '^https://');

create or replace function public.guest_room_info(p_qr text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare v_room record;
begin
  select id, number into v_room from public.rooms where qr_code = upper(trim(coalesce(p_qr, ''))) and active;
  if not found then raise exception 'ERR_QR'; end if;
  return (select json_build_object('room', v_room.number, 'hotel', hotel_name, 'cover_image_url', cover_image_url,
            'brand_color', brand_color, 'accent_color', accent_color, 'logo_url', logo_url)
          from public.settings where id = 1);
end $$;

-- ---------- 3. Στατιστικά ----------
-- Μία γραμμή ανά ημέρα / γεγονός / αντικείμενο / συσκευή, με μετρητή. Δεν αποθηκεύεται δωμάτιο, κράτηση ή πελάτης.
create table if not exists public.usage_daily (
  day date not null default current_date,
  event text not null check (event in ('open','section','category','service','outlet')),
  ref bigint not null default 0,          -- id ενότητας / υπηρεσίας / σημείου εστίασης· για category: αύξων της κατηγορίας υπηρεσιών
  device text not null check (device in ('tablet','tv','qr')),
  count int not null default 0,
  primary key (day, event, ref, device)
);
alter table public.usage_daily enable row level security;
create policy "usage_daily: admin read" on public.usage_daily for select to authenticated using ((select public.is_admin()));

-- Καταγραφή από τις οθόνες δωματίου. Μετράει μόνο από έγκυρη συσκευή/διαμονή, χωρίς να κρατά ποια.
create or replace function public.track_event(p_token text, p_event text, p_ref bigint, p_device text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_room bigint; v_dev text;
begin
  v_room := public.tablet_room(p_token);
  v_dev := case
    when not exists (select 1 from public.tablets where room_id = v_room
                     and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')) then 'qr'
    when p_device = 'tv' then 'tv' else 'tablet' end;
  if p_event not in ('open','section','category','service','outlet') then return; end if;
  insert into public.usage_daily as u (day, event, ref, device, count)
  values (current_date, p_event, greatest(coalesce(p_ref, 0), 0), v_dev, 1)
  on conflict (day, event, ref, device) do update set count = u.count + 1;
end $$;

-- Συγκεντρωτικά για τη σελίδα «Στατιστικά» (μόνο διαχειριστής).
create or replace function public.admin_stats(p_from date, p_to date) returns json
language plpgsql stable security definer set search_path = '' as $$
declare v_kinds text[] := array['transfer','rental','yachting','tour','spa','restaurant','other'];
begin
  if not public.is_admin() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  return json_build_object(
    'opens', (select json_build_object(
                'tablet', coalesce(sum(count) filter (where device = 'tablet'), 0),
                'tv', coalesce(sum(count) filter (where device = 'tv'), 0),
                'qr', coalesce(sum(count) filter (where device = 'qr'), 0))
              from public.usage_daily where event = 'open' and day between p_from and p_to),
    'daily', coalesce((select json_agg(x order by x.day) from (
                select d::date as day,
                       coalesce((select sum(count) from public.usage_daily where event = 'open' and day = d::date), 0) as opens,
                       (select count(*) from public.orders where created_at::date = d::date and status <> 'cancelled') as orders,
                       (select count(*) from public.service_requests where created_at::date = d::date and status <> 'cancelled') as requests
                from generate_series(p_from, p_to, interval '1 day') d) x), '[]'::json),
    'qr_logins', (select count(*) from public.guest_sessions where created_at::date between p_from and p_to),
    'stays', (select count(*) from public.reservations where status in ('checked_in','checked_out')
                and check_in <= p_to and check_out > p_from),
    'sections', coalesce((select json_agg(x order by x.n desc) from (
                select s.title_el as name, sum(u.count) as n from public.usage_daily u join public.info_sections s on s.id = u.ref
                where u.event = 'section' and u.day between p_from and p_to group by s.title_el) x), '[]'::json),
    'categories', coalesce((select json_agg(x order by x.n desc) from (
                select v_kinds[u.ref] as kind, sum(u.count) as n from public.usage_daily u
                where u.event = 'category' and u.day between p_from and p_to and u.ref between 1 and array_length(v_kinds, 1) group by u.ref) x), '[]'::json),
    'outlets', coalesce((select json_agg(x order by x.n desc) from (
                select o.name_el as name, sum(u.count) as n from public.usage_daily u join public.menu_outlets o on o.id = u.ref
                where u.event = 'outlet' and u.day between p_from and p_to group by o.name_el) x), '[]'::json),
    'services', coalesce((select json_agg(x order by x.requests desc, x.views desc) from (
                select s.name_el as name, s.kind,
                       coalesce((select sum(count) from public.usage_daily u where u.event = 'service' and u.ref = s.id and u.day between p_from and p_to), 0) as views,
                       (select count(*) from public.service_requests q where q.service_id = s.id and q.created_at::date between p_from and p_to and q.status <> 'cancelled') as requests,
                       (select coalesce(sum(price), 0) from public.service_requests q where q.service_id = s.id and q.created_at::date between p_from and p_to and q.status in ('confirmed','done')) as value
                from public.services s) x where x.views > 0 or x.requests > 0), '[]'::json),
    'requests', (select json_build_object('total', count(*) filter (where status <> 'cancelled'),
                   'done', count(*) filter (where status = 'done'), 'cancelled', count(*) filter (where status = 'cancelled'),
                   'qr', count(*) filter (where via_qr and status <> 'cancelled'))
                 from public.service_requests where created_at::date between p_from and p_to),
    'orders', (select json_build_object('total', count(*) filter (where status <> 'cancelled'),
                 'delivered', count(*) filter (where status = 'delivered'),
                 'revenue', coalesce(sum(total) filter (where status = 'delivered'), 0),
                 'to_room', count(*) filter (where status = 'delivered' and charge_to_room),
                 'pool', count(*) filter (where status <> 'cancelled' and deliver_to = 'pool'),
                 'qr', count(*) filter (where status <> 'cancelled' and via = 'qr'),
                 'avg_minutes', round(avg(extract(epoch from (updated_at - created_at)) / 60) filter (where status = 'delivered')))
               from public.orders where created_at::date between p_from and p_to),
    'items', coalesce((select json_agg(x order by x.qty desc) from (
                select oi.name_el as name, sum(oi.qty) as qty, sum(oi.qty * oi.price) as value
                from public.order_items oi join public.orders o on o.id = oi.order_id
                where o.status = 'delivered' and o.created_at::date between p_from and p_to
                group by oi.name_el order by sum(oi.qty) desc limit 10) x), '[]'::json)
  );
end $$;

-- ---------- Οθόνη δωματίου: + ταυτότητα, διάρκεια/φωτογραφίες υπηρεσιών ----------
create or replace function public.tablet_home(p_token text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare v_room bigint; v_res bigint;
begin
  v_room := public.tablet_room(p_token);
  update public.tablets set last_seen = now()
  where room_id = v_room and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  v_res := public.tablet_reservation(v_room);
  return json_build_object(
    'room', (select number from public.rooms where id = v_room),
    'hotel', (select json_build_object('name', hotel_name, 'address', address, 'phone', phone, 'email', email,
               'check_in_time', check_in_time, 'check_out_time', check_out_time,
               'welcome_el', welcome_el, 'welcome_en', welcome_en, 'wifi_name', wifi_name, 'wifi_password', wifi_password,
               'cover_image_url', cover_image_url, 'brand_color', brand_color, 'accent_color', accent_color, 'logo_url', logo_url)
              from public.settings where id = 1),
    'guest', (select json_build_object('first_name', g.first_name, 'last_name', g.last_name, 'check_out', r.check_out)
              from public.reservations r join public.guests g on g.id = r.guest_id where r.id = v_res),
    'sections', coalesce((select json_agg(s order by s.sort, s.id) from
              (select id, icon, title_el, title_en, body_el, body_en, sort from public.info_sections where active) s), '[]'::json),
    'services', coalesce((select json_agg(s order by s.sort, s.id) from
              (select id, kind, name_el, name_en, description_el, description_en, image_url, gallery, duration_el, duration_en,
                      price, price_unit, max_persons, sort
               from public.services where active) s), '[]'::json),
    'requests', coalesce((select json_agg(q order by q.created_at desc) from
              (select q.id, q.service_id, s.name_el, s.name_en, q.request_date, q.request_time, q.persons, q.status, q.price, q.created_at
               from public.service_requests q join public.services s on s.id = q.service_id
               where v_res is not null and q.reservation_id = v_res) q), '[]'::json),
    'dining', coalesce((select json_agg(o order by o.sort, o.id) from (
              select mo.id, mo.name_el, mo.name_en, mo.icon, mo.hours_el, mo.hours_en, mo.description_el, mo.description_en,
                     mo.accepts_orders, mo.deliver_room, mo.deliver_pool, mo.sort,
                     coalesce((select json_agg(c order by c.sort, c.id) from (
                       select mc.id, mc.name_el, mc.name_en, mc.sort,
                              coalesce((select json_agg(i order by i.sort, i.id) from (
                                select mi.id, mi.name_el, mi.name_en, mi.description_el, mi.description_en, mi.price, mi.image_url,
                                       mi.allergens, mi.tags, mi.available, mi.sort
                                from public.menu_items mi where mi.category_id = mc.id and mi.active) i), '[]'::json) as items
                       from public.menu_categories mc where mc.outlet_id = mo.id and mc.active) c), '[]'::json) as categories
              from public.menu_outlets mo where mo.active) o), '[]'::json),
    'orders', coalesce((select json_agg(x order by x.created_at desc) from (
              select o.id, o.outlet_id, mo.name_el as outlet_el, mo.name_en as outlet_en, o.deliver_to, o.location, o.total,
                     o.charge_to_room, o.status, o.created_at,
                     (select json_agg(json_build_object('name_el', oi.name_el, 'name_en', oi.name_en, 'qty', oi.qty) order by oi.id)
                      from public.order_items oi where oi.order_id = o.id) as items
              from public.orders o join public.menu_outlets mo on mo.id = o.outlet_id
              where v_res is not null and o.reservation_id = v_res) x), '[]'::json)
  );
end $$;

revoke execute on function public.track_event(text, text, bigint, text), public.admin_stats(date, date),
  public.guest_room_info(text), public.tablet_home(text) from public, anon, authenticated;
grant execute on function public.track_event(text, text, bigint, text), public.guest_room_info(text), public.tablet_home(text) to anon, authenticated;
grant execute on function public.admin_stats(date, date) to authenticated;

-- Παράδειγμα υπηρεσιών ενοικίασης (επεξεργάσιμες από τον διαχειριστή).
insert into public.services (kind, name_el, name_en, description_el, description_en, duration_el, duration_en, price_unit, max_persons, sort)
select * from (values
  ('rental', 'Ενοικίαση αυτοκινήτου', 'Car rental', 'Παράδοση και παραλαβή στο ξενοδοχείο.', 'Delivery and pick-up at the hotel.', 'Ανά ημέρα', 'Per day', 'on_request', 5, 5),
  ('rental', 'Ενοικίαση ATV', 'ATV rental', 'Γουρούνα για να εξερευνήσετε το νησί. Απαιτείται δίπλωμα.', 'Quad bike to explore the island. Driving licence required.', 'Ανά ημέρα', 'Per day', 'on_request', 2, 6)
) v(kind, name_el, name_en, description_el, description_en, duration_el, duration_en, price_unit, max_persons, sort)
where not exists (select 1 from public.services where kind = 'rental');


-- ---------------------------------------------------------------------
-- 0010_roots.sql
-- ---------------------------------------------------------------------
-- Splendour Roots: ψηφιακός πολιτιστικός οδηγός. Σημεία ενδιαφέροντος, θεματικές διαδρομές,
-- κείμενα και ηχητικές αφηγήσεις (ελληνικά/αγγλικά), χάρτης. Δημόσιο περιεχόμενο (χωρίς σύνδεση),
-- επεξεργάσιμο από τον διαχειριστή. Τα πεδία ar_* προετοιμάζουν τη λειτουργία επαυξημένης πραγματικότητας.

create table if not exists public.roots_pois (
  id bigint generated always as identity primary key,
  code text unique,
  category text not null default 'culture'
    check (category in ('start','archaeology','museum','church','castle','village','architecture','culture','nature')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  name_el text not null,
  name_en text,
  short_el text,
  short_en text,
  body_el text,
  body_en text,
  hours_el text,
  hours_en text,
  access text not null default 'car' check (access in ('walk','car','boat')),
  image_url text check (image_url ~* '^https://'),
  gallery text[] not null default '{}',
  audio_el_url text check (audio_el_url ~* '^https://'),
  audio_en_url text check (audio_en_url ~* '^https://'),
  ar_enabled boolean not null default false,      -- εμφανίζεται ως ετικέτα στην κάμερα (AR)
  ar_verified boolean not null default false,     -- η θέση επαληθεύτηκε επιτόπου
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists public.roots_routes (
  id bigint generated always as identity primary key,
  code text unique,
  icon text,
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  title_el text not null,
  title_en text,
  intro_el text,
  intro_en text,
  duration_el text,
  duration_en text,
  mode text not null default 'car' check (mode in ('walk','car','mixed')),
  image_url text check (image_url ~* '^https://'),
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists public.roots_route_stops (
  route_id bigint not null references public.roots_routes(id),
  poi_id bigint not null references public.roots_pois(id),
  seq int not null,
  note_el text,
  note_en text,
  primary key (route_id, seq)
);
create index if not exists roots_route_stops_poi on public.roots_route_stops(poi_id);

alter table public.roots_pois enable row level security;
alter table public.roots_routes enable row level security;
alter table public.roots_route_stops enable row level security;
create policy "roots_pois: read" on public.roots_pois for select to anon, authenticated using (true);
create policy "roots_pois: admin" on public.roots_pois for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "roots_routes: read" on public.roots_routes for select to anon, authenticated using (true);
create policy "roots_routes: admin" on public.roots_routes for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "roots_route_stops: read" on public.roots_route_stops for select to anon, authenticated using (true);
create policy "roots_route_stops: admin" on public.roots_route_stops for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Αποθήκευση των στάσεων μιας διαδρομής σε μία κίνηση (διαχειριστής).
create or replace function public.admin_roots_set_stops(p_route bigint, p_pois bigint[]) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  if not exists (select 1 from public.roots_routes where id = p_route) then raise exception 'Η διαδρομή δεν βρέθηκε'; end if;
  -- προσωρινή μετακίνηση, για να μη συγκρουστούν οι αύξοντες αριθμοί
  update public.roots_route_stops set seq = -seq - 1000 where route_id = p_route;
  insert into public.roots_route_stops (route_id, poi_id, seq, note_el, note_en)
  select p_route, x.poi, x.n, s.note_el, s.note_en
  from unnest(p_pois) with ordinality as x(poi, n)
  left join lateral (select note_el, note_en from public.roots_route_stops o where o.route_id = p_route and o.poi_id = x.poi and o.seq < 0 limit 1) s on true;
  -- οι παλιές εγγραφές (αρνητικοί αριθμοί) αφαιρούνται
  delete from public.roots_route_stops where route_id = p_route and seq < 0;
end $$;

-- Θέση ξενοδοχείου (για «κοντά μου» και εκκίνηση διαδρομών όταν ο επισκέπτης δεν δίνει τοποθεσία).
alter table public.settings
  add column if not exists hotel_lat double precision check (hotel_lat between -90 and 90),
  add column if not exists hotel_lng double precision check (hotel_lng between -180 and 180),
  add column if not exists roots_title text;      -- π.χ. «Splendour Roots»

-- ---------- Στατιστικά: προβολές διαδρομών / σημείων από τον δημόσιο οδηγό ----------
alter table public.usage_daily drop constraint if exists usage_daily_event_check;
alter table public.usage_daily add constraint usage_daily_event_check
  check (event in ('open','section','category','service','outlet','roots','route','poi','audio','ar'));
alter table public.usage_daily drop constraint if exists usage_daily_device_check;
alter table public.usage_daily add constraint usage_daily_device_check check (device in ('tablet','tv','qr','web'));

-- Ο οδηγός είναι δημόσιος: μετράμε μόνο γεγονότα του Roots, χωρίς καμία ταυτότητα.
create or replace function public.track_roots(p_event text, p_ref bigint) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_event not in ('roots','route','poi','audio','ar') then return; end if;
  if p_event in ('route') and not exists (select 1 from public.roots_routes where id = p_ref) then return; end if;
  if p_event in ('poi','audio','ar') and not exists (select 1 from public.roots_pois where id = p_ref) then return; end if;
  insert into public.usage_daily as u (day, event, ref, device, count)
  values (current_date, p_event, case when p_event = 'roots' then 0 else p_ref end, 'web', 1)
  on conflict (day, event, ref, device) do update set count = u.count + 1;
end $$;

create or replace function public.admin_roots_stats(p_from date, p_to date) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Δεν έχεις πρόσβαση'; end if;
  return json_build_object(
    'opens', (select coalesce(sum(count), 0) from public.usage_daily where event = 'roots' and day between p_from and p_to),
    'routes', coalesce((select json_agg(x order by x.n desc) from (
       select r.title_el as name, sum(u.count) as n from public.usage_daily u join public.roots_routes r on r.id = u.ref
       where u.event = 'route' and u.day between p_from and p_to group by r.title_el) x), '[]'::json),
    'pois', coalesce((select json_agg(x order by x.n desc) from (
       select p.name_el as name, sum(u.count) filter (where u.event = 'poi') as n,
              coalesce(sum(u.count) filter (where u.event = 'audio'), 0) as audio, coalesce(sum(u.count) filter (where u.event = 'ar'), 0) as ar
       from public.usage_daily u join public.roots_pois p on p.id = u.ref
       where u.event in ('poi','audio','ar') and u.day between p_from and p_to group by p.name_el order by 2 desc nulls last limit 15) x), '[]'::json)
  );
end $$;

revoke execute on function public.admin_roots_set_stops(bigint, bigint[]), public.track_roots(text, bigint), public.admin_roots_stats(date, date)
  from public, anon, authenticated;
grant execute on function public.track_roots(text, bigint) to anon, authenticated;
grant execute on function public.admin_roots_set_stops(bigint, bigint[]), public.admin_roots_stats(date, date) to authenticated;

-- Αρχικό περιεχόμενο (πρώτη μορφή για έλεγχο· συντεταγμένες κατά προσέγγιση)
do $seed$
begin
  if exists (select 1 from public.roots_pois) then return; end if;
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('hotel', 'start', 36.4245, 25.427, 'Splendour · Φηροστεφάνι', 'Splendour · Firostefani', 'Το σημείο εκκίνησης των διαδρομών σας.', 'The starting point of your journeys.', 'Το Φηροστεφάνι («το στεφάνι των Φηρών») απλώνεται στο χείλος της καλντέρας, λίγα λεπτά με τα πόδια βόρεια από τα Φηρά. Από εδώ ξεκινά το μονοπάτι της καλντέρας προς το Ημεροβίγλι και την Οία.', 'Firostefani ("the crown of Fira") sits on the rim of the caldera, a short walk north of Fira. The caldera footpath to Imerovigli and Oia starts right here.', null, null, 'walk', 1);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('three_bells', 'church', 36.4203, 25.4309, 'Οι «Τρεις Καμπάνες»', 'The "Three Bells"', 'Η καθολική εκκλησία της Κοίμησης της Θεοτόκου με τους μπλε τρούλους.', 'The Catholic Church of the Dormition with its blue domes.', 'Μία από τις πιο φωτογραφημένες εικόνες της Σαντορίνης: η καθολική εκκλησία της Κοίμησης της Θεοτόκου, με τους γαλάζιους τρούλους και το καμπαναριό με τις τρεις καμπάνες, πάνω από την καλντέρα. Επισκεφθείτε την νωρίς το πρωί για ησυχία και μαλακό φως.', 'One of Santorini''s most photographed views: the Catholic Church of the Dormition, with its blue domes and three-bell tower above the caldera. Visit early in the morning for quiet and soft light.', null, null, 'walk', 2);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('agios_gerasimos', 'church', 36.4228, 25.4288, 'Άγιος Γεράσιμος', 'Agios Gerasimos', 'Λευκή εκκλησία με σκαλοπάτια προς την καλντέρα.', 'A white church with steps down towards the caldera.', 'Μικρή λευκή εκκλησία στο Φηροστεφάνι, με την αυλή της να κατεβαίνει κλιμακωτά προς την καλντέρα. Χαρακτηριστικό δείγμα της κυκλαδίτικης εκκλησιαστικής αρχιτεκτονικής που συναντάτε σε κάθε γωνιά του νησιού.', 'A small white church in Firostefani whose courtyard steps down towards the caldera, a typical example of the Cycladic church architecture found all over the island.', null, null, 'walk', 3);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('orthodox_cathedral', 'church', 36.416, 25.4318, 'Μητρόπολη Φηρών (Υπαπαντή)', 'Orthodox Cathedral of Fira', 'Ο μητροπολιτικός ναός της Υπαπαντής στο κέντρο των Φηρών.', 'The Metropolitan church of the Presentation of Christ in central Fira.', 'Ο ορθόδοξος μητροπολιτικός ναός των Φηρών είναι αφιερωμένος στην Υπαπαντή του Χριστού. Ξαναχτίστηκε μετά τον μεγάλο σεισμό του 1956 και στο εσωτερικό του θα δείτε τοιχογραφίες του Σαντορινιού ζωγράφου Χριστόφορου Ασίμη. Η πλατεία μπροστά του έχει θέα στην καλντέρα.', 'Fira''s Orthodox Metropolitan church is dedicated to the Presentation of Christ. It was rebuilt after the great earthquake of 1956, and inside you can see frescoes by the Santorinian painter Christoforos Asimis. Its square looks out over the caldera.', null, null, 'walk', 4);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('catholic_cathedral', 'church', 36.419, 25.4322, 'Καθολικός Καθεδρικός Αγ. Ιωάννη', 'Catholic Cathedral of St John', 'Στην καθολική συνοικία των Φηρών, με το χαρακτηριστικό καμπαναριό.', 'In Fira''s Catholic quarter, with its distinctive bell tower.', 'Η Σαντορίνη έχει από τον Μεσαίωνα καθολική κοινότητα, απόηχο της βενετικής περιόδου. Ο καθεδρικός ναός του Αγίου Ιωάννη του Βαπτιστή, στην καθολική συνοικία των Φηρών, ξαναχτίστηκε μετά τον σεισμό του 1956 και ξεχωρίζει για το ροδαλό του καμπαναριό.', 'Santorini has had a Catholic community since the Middle Ages, an echo of the Venetian period. The Cathedral of St John the Baptist, in Fira''s Catholic quarter, was rebuilt after the 1956 earthquake and stands out for its pastel bell tower.', null, null, 'walk', 5);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('museum_prehistoric', 'museum', 36.417, 25.431, 'Μουσείο Προϊστορικής Θήρας', 'Museum of Prehistoric Thera', 'Τα ευρήματα του Ακρωτηρίου: τοιχογραφίες, αγγεία, το χρυσό αιγαγρό.', 'The finds of Akrotiri: wall paintings, pottery, the golden ibex.', 'Το μουσείο παρουσιάζει την προϊστορία του νησιού και κυρίως τα ευρήματα του Ακρωτηρίου: τοιχογραφίες, έπιπλα που αποτυπώθηκαν στην ηφαιστειακή τέφρα, αγγεία και το μοναδικό χρυσό ειδώλιο αιγάγρου. Ιδανική στάση πριν ή μετά την επίσκεψη στον αρχαιολογικό χώρο.', 'The museum tells the island''s prehistory, above all through the finds from Akrotiri: wall paintings, furniture preserved as casts in the volcanic ash, pottery and the unique golden ibex figurine. An ideal stop before or after visiting the site.', 'Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.', 'Please check current opening hours before visiting.', 'walk', 6);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('museum_archaeological', 'museum', 36.4187, 25.4317, 'Αρχαιολογικό Μουσείο Θήρας', 'Archaeological Museum of Thera', 'Ευρήματα από την Αρχαία Θήρα, από τη γεωμετρική ως τη ρωμαϊκή εποχή.', 'Finds from Ancient Thera, from the Geometric to the Roman period.', 'Κοντά στον σταθμό του τελεφερίκ, το μουσείο φιλοξενεί γλυπτά, επιγραφές και αγγεία κυρίως από την Αρχαία Θήρα και τα νεκροταφεία της, που καλύπτουν πάνω από χίλια χρόνια ιστορίας μετά την προϊστορική εποχή.', 'Near the cable car station, the museum holds sculpture, inscriptions and vases mainly from Ancient Thera and its cemeteries, spanning more than a thousand years of history after the prehistoric era.', 'Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.', 'Please check current opening hours before visiting.', 'walk', 7);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('akrotiri', 'archaeology', 36.3515, 25.4035, 'Προϊστορικός οικισμός Ακρωτηρίου', 'Prehistoric Akrotiri', 'Η «Πομπηία του Αιγαίου», θαμμένη από την έκρηξη της Εποχής του Χαλκού.', 'The "Pompeii of the Aegean", buried by the Bronze Age eruption.', 'Μια ακμάζουσα πόλη της Εποχής του Χαλκού, με διώροφα και τριώροφα σπίτια, αποχετεύσεις και εντυπωσιακές τοιχογραφίες, σκεπάστηκε από την ηφαιστειακή τέφρα της μεγάλης έκρηξης του 17ου αιώνα π.Χ. Οι ανασκαφές ξεκίνησαν το 1967 από τον Σπυρίδωνα Μαρινάτο. Δεν έχουν βρεθεί ανθρώπινα λείψανα ούτε πολύτιμα αντικείμενα, γεγονός που δείχνει ότι οι κάτοικοι πρόλαβαν να φύγουν. Σήμερα ο χώρος προστατεύεται από στέγαστρο και η περιήγηση γίνεται σε διαδρόμους πάνω από τους δρόμους της αρχαίας πόλης.', 'A thriving Bronze Age town, with two- and three-storey houses, drainage systems and remarkable wall paintings, was buried by volcanic ash in the great eruption of the 17th century BC. Excavations began in 1967 under Spyridon Marinatos. No human remains or valuables have been found, which suggests the inhabitants managed to leave in time. Today the site is protected by a roof and you walk on walkways above the streets of the ancient town.', 'Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.', 'Please check current opening hours before visiting.', 'car', 8);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('ancient_thera', 'archaeology', 36.3627, 25.4776, 'Αρχαία Θήρα', 'Ancient Thera', 'Αρχαία πόλη στην κορυφή του Μέσα Βουνού, ανάμεσα σε Καμάρι και Περίσσα.', 'An ancient city on the summit of Mesa Vouno, between Kamari and Perissa.', 'Χτισμένη σε κορυφογραμμή περίπου 360 μέτρων, η Αρχαία Θήρα ιδρύθηκε από Δωριείς αποίκους και κατοικήθηκε για αιώνες, ως τη ρωμαϊκή και την πρώιμη βυζαντινή εποχή. Θα δείτε την αγορά, ιερά, το θέατρο και σπίτια, με θέα και στις δύο πλευρές του νησιού. Η άνοδος γίνεται με αυτοκίνητο από το Καμάρι και λίγο περπάτημα.', 'Built on a ridge about 360 metres high, Ancient Thera was founded by Dorian settlers and was inhabited for centuries, into Roman and early Byzantine times. You will see the agora, sanctuaries, the theatre and houses, with views over both sides of the island. Drive up from Kamari and finish on foot.', 'Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.', 'Please check current opening hours before visiting.', 'car', 9);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('caldera_view', 'nature', 36.4255, 25.4255, 'Θέα στην καλντέρα', 'Caldera viewpoint', 'Η μεγαλύτερη «βουλιαγμένη» ηφαιστειακή λεκάνη του Αιγαίου.', 'The great sunken volcanic basin of the Aegean.', 'Μπροστά σας απλώνεται η καλντέρα: μια τεράστια λεκάνη που σχηματίστηκε όταν, μετά από διαδοχικές εκρήξεις, κατέρρευσε το κέντρο του ηφαιστείου και την πλημμύρισε η θάλασσα. Τα στρώματα στον γκρεμό κάτω από τα πόδια σας (κόκκινα, μαύρα, λευκά) είναι λάβες και τέφρες από διαφορετικές εκρήξεις, σαν σελίδες της γεωλογικής ιστορίας του νησιού.', 'Before you lies the caldera: a huge basin formed when, after successive eruptions, the centre of the volcano collapsed and the sea flooded in. The bands in the cliff below you (red, black, white) are lavas and ashes from different eruptions, like pages of the island''s geological history.', null, null, 'walk', 10);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('nea_kameni', 'nature', 36.4045, 25.3965, 'Νέα Καμένη (ηφαίστειο)', 'Nea Kameni (the volcano)', 'Το νεότερο νησί του Αιγαίου, με ενεργούς κρατήρες.', 'The youngest island in the Aegean, with active craters.', 'Η Νέα Καμένη αναδύθηκε από τη θάλασσα στις αρχές του 18ου αιώνα και μεγάλωσε με διαδοχικές εκρήξεις ως το 1950. Ένα μονοπάτι μέσα από μαύρες λάβες οδηγεί στους κρατήρες, όπου σε ορισμένα σημεία βγαίνουν ακόμη θερμά αέρια. Φτάνετε με καραβάκι από το παλιό λιμάνι των Φηρών. Φορέστε κλειστά παπούτσια και πάρτε νερό.', 'Nea Kameni rose from the sea in the early 18th century and grew through successive eruptions until 1950. A path across black lava leads to the craters, where warm gases still escape in places. Reach it by boat from Fira''s old port. Wear closed shoes and bring water.', null, null, 'boat', 11);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('palea_kameni', 'nature', 36.399, 25.38, 'Θερμές πηγές Παλαιάς Καμένης', 'Palea Kameni hot springs', 'Κολύμπι στα ζεστά, πλούσια σε σίδηρο νερά.', 'A swim in warm, iron-rich waters.', 'Η Παλαιά Καμένη σχηματίστηκε από έκρηξη στα ρωμαϊκά χρόνια. Στον μικρό της κόλπο, θερμά νερά πλούσια σε σίδηρο χρωματίζουν τη θάλασσα πορτοκαλί. Τα περισσότερα καραβάκια για το ηφαίστειο κάνουν στάση εδώ για κολύμπι.', 'Palea Kameni was formed by an eruption in Roman times. In its small bay, warm iron-rich water turns the sea orange. Most volcano boat trips stop here for a swim.', null, null, 'boat', 12);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('red_beach', 'nature', 36.3487, 25.3945, 'Κόκκινη Παραλία', 'Red Beach', 'Κόκκινοι και μαύροι ηφαιστειακοί βράχοι κοντά στο Ακρωτήρι.', 'Red and black volcanic cliffs near Akrotiri.', 'Οι κόκκινοι γκρεμοί της παραλίας είναι ηφαιστειακά πετρώματα πλούσια σε οξείδια του σιδήρου. Θαυμάστε την από το σημείο θέας: λόγω κινδύνου κατολισθήσεων, τηρείτε πάντα τις πινακίδες και μην κάθεστε κάτω από τα βράχια.', 'The red cliffs are volcanic rock rich in iron oxides. Admire the beach from the viewpoint: because of the risk of rockfalls, always follow the signs and do not sit beneath the cliffs.', null, null, 'car', 13);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('vlychada', 'nature', 36.3378, 25.4245, 'Βλυχάδα: τα «φεγγαρένια» βράχια', 'Vlychada''s "moonscape" cliffs', 'Λευκοί γκρεμοί από ελαφρόπετρα, σμιλεμένοι από τον αέρα.', 'White pumice cliffs sculpted by the wind.', 'Στη νότια ακτή, ο άνεμος έχει σκαλίσει τα στρώματα ελαφρόπετρας και τέφρας σε παράξενα σχήματα που θυμίζουν σεληνιακό τοπίο. Είναι από τα πιο καθαρά σημεία για να δείτε το πάχος της τέφρας που άφησε η μεγάλη έκρηξη της Εποχής του Χαλκού.', 'On the south coast, the wind has carved the layers of pumice and ash into strange shapes that look like a lunar landscape. It is one of the clearest places to see how thick a blanket of ash the great Bronze Age eruption left behind.', null, null, 'car', 14);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('perissa', 'nature', 36.3555, 25.477, 'Μαύρη παραλία Περίσσας', 'Perissa black beach', 'Μαύρη ηφαιστειακή άμμος κάτω από το Μέσα Βουνό.', 'Black volcanic sand beneath Mesa Vouno.', 'Η μεγάλη παραλία με τη μαύρη ηφαιστειακή άμμο απλώνεται στους πρόποδες του Μέσα Βουνού, του βράχου που δεν είναι ηφαιστειακός αλλά πολύ παλαιότερος ασβεστόλιθος, ένα κομμάτι της αρχικής στεριάς πριν το ηφαίστειο. Η άμμος ζεσταίνεται πολύ το μεσημέρι.', 'The long black-sand beach stretches beneath Mesa Vouno, a rock that is not volcanic but much older limestone, part of the original land before the volcano. The sand gets very hot at midday.', null, null, 'car', 15);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('skaros', 'castle', 36.4325, 25.4175, 'Βράχος Σκάρος (Ημεροβίγλι)', 'Skaros Rock (Imerovigli)', 'Τα ερείπια του μεσαιωνικού κάστρου πάνω από την καλντέρα.', 'The ruins of the medieval castle above the caldera.', 'Πάνω στον βράχο Σκάρο υπήρχε από τον Μεσαίωνα ο κύριος οχυρωμένος οικισμός του νησιού, με το κάστρο, σπίτια και εκκλησίες. Σεισμοί και η διάβρωση οδήγησαν στην εγκατάλειψή του τον 18ο αιώνα και σήμερα σώζονται λίγα ερείπια. Ένα μονοπάτι κατεβαίνει από το Ημεροβίγλι και κάνει τον γύρο του βράχου, ως το εκκλησάκι της Θεοσκέπαστης. Προσοχή στον αέρα και στα σκαλιά.', 'From the Middle Ages, Skaros Rock held the island''s main fortified settlement, with a castle, houses and churches. Earthquakes and erosion led to its abandonment in the 18th century, and only a few ruins survive. A footpath goes down from Imerovigli and around the rock to the chapel of Theoskepasti. Mind the wind and the steps.', null, null, 'walk', 16);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('caldera_trail', 'nature', 36.433, 25.421, 'Μονοπάτι καλντέρας Φηρά–Οία', 'Fira–Oia caldera trail', 'Περίπου 10 χλμ. στο χείλος της καλντέρας.', 'About 10 km along the caldera rim.', 'Το πιο διάσημο μονοπάτι του νησιού ενώνει τα Φηρά με την Οία μέσα από Φηροστεφάνι και Ημεροβίγλι. Μετά το Ημεροβίγλι γίνεται πιο ανηφορικό και άγριο. Υπολογίστε 3–5 ώρες, ξεκινήστε νωρίς το πρωί, φορέστε κατάλληλα παπούτσια και πάρτε νερό και καπέλο. Μπορείτε να επιστρέψετε με λεωφορείο ή ταξί από την Οία.', 'The island''s most famous footpath links Fira to Oia via Firostefani and Imerovigli. After Imerovigli it becomes steeper and wilder. Allow 3–5 hours, start early in the morning, wear proper shoes and bring water and a hat. You can return from Oia by bus or taxi.', null, null, 'walk', 17);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('oia_castle', 'castle', 36.4612, 25.3727, 'Κάστρο της Οίας (Αγ. Νικόλαος)', 'Oia castle (Agios Nikolaos)', 'Ερείπια βενετικού κάστρου και το πιο γνωστό σημείο για το ηλιοβασίλεμα.', 'Ruins of a Venetian castle and the island''s best-known sunset spot.', 'Στην άκρη της Οίας σώζονται τα ερείπια του κάστρου του Αγίου Νικολάου, ενός από τα μεσαιωνικά «καστέλια» του νησιού. Σήμερα είναι το πιο δημοφιλές σημείο για το ηλιοβασίλεμα: για θέση, πηγαίνετε τουλάχιστον μία ώρα νωρίτερα, ή απολαύστε το από πιο ήσυχο σημείο του μονοπατιού.', 'At the tip of Oia stand the ruins of the castle of Agios Nikolaos, one of the island''s medieval "kastelia". Today it is the most popular sunset spot: arrive at least an hour early for a place, or enjoy the sunset from a quieter point along the path.', null, null, 'car', 18);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('oia_captains', 'architecture', 36.4618, 25.3776, 'Καπετανόσπιτα & Ναυτικό Μουσείο Οίας', 'Captains'' houses & Maritime Museum of Oia', 'Η ναυτική ιστορία της Οίας.', 'The seafaring history of Oia.', 'Τον 19ο αιώνα η Οία ήταν πλούσιο ναυτικό κέντρο. Οι καπετάνιοι έχτισαν αρχοντικά «καπετανόσπιτα» στο πάνω μέρος του χωριού, ενώ οι ναυτικοί ζούσαν σε υπόσκαφα στην πλαγιά. Το Ναυτικό Μουσείο, σε ένα τέτοιο αρχοντικό, παρουσιάζει αυτή την ιστορία με ομοιώματα πλοίων, όργανα και αρχεία.', 'In the 19th century Oia was a wealthy seafaring centre. Captains built grand mansions at the top of the village, while sailors lived in cave houses on the slope. The Maritime Museum, in one of these mansions, tells the story through ship models, instruments and archives.', 'Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.', 'Please check current opening hours before visiting.', 'car', 19);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('ammoudi', 'nature', 36.46, 25.3718, 'Λιμανάκι Αμμούδι', 'Ammoudi Bay', 'Ψαροταβέρνες στη βάση των κόκκινων βράχων της Οίας.', 'Fish tavernas at the foot of Oia''s red cliffs.', 'Κάτω από την Οία, ένα σκαλοπάτι με περίπου 300 σκαλιά κατεβαίνει στο Αμμούδι, ένα μικρό λιμάνι με ψαροταβέρνες ανάμεσα σε κόκκινα ηφαιστειακά βράχια. Η ανάβαση είναι κουραστική τις ζεστές ώρες.', 'Below Oia, a stairway of around 300 steps leads down to Ammoudi, a small harbour with fish tavernas among red volcanic rocks. The climb back is tiring in the heat of the day.', null, null, 'car', 20);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('yposkafa', 'architecture', 36.425, 25.4262, 'Υπόσκαφα σπίτια', 'Cave houses (yposkafa)', 'Σπίτια σκαμμένα μέσα στο ηφαιστειακό έδαφος.', 'Houses dug into the volcanic ground.', 'Τα υπόσκαφα είναι σπίτια σκαμμένα στα μαλακά στρώματα της ηφαιστειακής τέφρας (θηραϊκή γη). Με ελάχιστη ξυλεία στο νησί, η λύση αυτή ήταν οικονομική και δροσερή το καλοκαίρι, ζεστή τον χειμώνα. Πολλά από τα σημερινά καταλύματα της καλντέρας, όπως στο Φηροστεφάνι, είναι αναπαλαιωμένα υπόσκαφα.', 'Yposkafa are houses dug into the soft layers of volcanic ash ("Theran earth"). With hardly any timber on the island, this was an economical solution, cool in summer and warm in winter. Many of today''s caldera hotels, as in Firostefani, are restored cave houses.', null, null, 'walk', 21);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('pyrgos', 'village', 36.3833, 25.4495, 'Πύργος Καλλίστης', 'Pyrgos Kallistis', 'Μεσαιωνικό χωριό-καστέλι στην κορυφή λόφου.', 'A medieval hilltop village built as a fortified "kasteli".', 'Ο Πύργος ήταν ένα από τα οχυρωμένα «καστέλια» του νησιού: τα σπίτια χτίζονταν το ένα κολλητά στο άλλο, σχηματίζοντας τείχος, με στενά δαιδαλώδη σοκάκια που ανεβαίνουν στην κορυφή. Από εκεί η θέα αγκαλιάζει όλο το νησί. Αξίζει μια βραδινή βόλτα.', 'Pyrgos was one of the island''s fortified "kastelia": houses were built wall to wall to form a defensive ring, with narrow winding lanes climbing to the top, from where the view takes in the whole island. Lovely for an evening stroll.', null, null, 'car', 22);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('megalochori', 'village', 36.3747, 25.4265, 'Μεγαλοχώρι', 'Megalochori', 'Παραδοσιακό χωριό με καμπαναριά-αψίδες και παλιά οινοποιεία.', 'A traditional village with arched bell towers and old wineries.', 'Το Μεγαλοχώρι διατηρεί τον χαρακτήρα του παλιού αγροτικού χωριού: αρχοντικά, οινοποιεία (κάναβες) και τα χαρακτηριστικά καμπαναριά που περνούν πάνω από τον δρόμο σαν αψίδες. Η κεντρική πλατεία με τα δέντρα είναι ιδανική για καφέ.', 'Megalochori keeps the character of an old farming village: mansions, traditional wineries ("kanaves") and the distinctive bell towers that arch over the lanes. The tree-shaded main square is perfect for a coffee.', null, null, 'car', 23);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('emporio', 'village', 36.3573, 25.4445, 'Εμπορείο & Καστέλι', 'Emporio & its Kasteli', 'Το μεγαλύτερο χωριό, με μεσαιωνικό οχυρωμένο πυρήνα.', 'The largest village, with a medieval fortified core.', 'Στο Εμπορείο, το καστέλι (ο οχυρωμένος μεσαιωνικός πυρήνας) σώζεται σε πολύ καλή κατάσταση: στενά περάσματα, σπίτια-τείχος και ο πύργος «Γουλάς». Είναι από τα πιο αυθεντικά μέρη για να καταλάβετε πώς προστατεύονταν οι κάτοικοι από τους πειρατές.', 'In Emporio the kasteli (the fortified medieval core) survives in very good condition: narrow passages, houses forming a wall and the "Goulas" tower. It is one of the most authentic places to understand how islanders protected themselves from pirates.', null, null, 'car', 24);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('episkopi', 'church', 36.3878, 25.47, 'Παναγία Επισκοπή (Μέσα Γωνιά)', 'Panagia Episkopi (Mesa Gonia)', 'Βυζαντινός ναός του 11ου αιώνα.', 'An 11th-century Byzantine church.', 'Ένα από τα σημαντικότερα βυζαντινά μνημεία των Κυκλάδων. Ο ναός χτίστηκε τον 11ο αιώνα και συνδέεται με τον αυτοκράτορα Αλέξιο Α΄ Κομνηνό. Διατηρεί βυζαντινές τοιχογραφίες και φορητές εικόνες, και στις 15 Αυγούστου γιορτάζει με μεγάλο πανηγύρι.', 'One of the most important Byzantine monuments in the Cyclades. The church was built in the 11th century and is associated with Emperor Alexios I Komnenos. It preserves Byzantine frescoes and icons, and on 15 August it hosts a large feast-day celebration.', null, null, 'car', 25);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('vineyards', 'culture', 36.388, 25.444, 'Αμπελώνες & «κουλούρα»', 'Vineyards & the "kouloura"', 'Τα αμπέλια που πλέκονται σε καλάθι για να αντέχουν τον αέρα.', 'Vines woven into baskets to withstand the wind.', 'Η Σαντορίνη έχει μία από τις παλαιότερες συνεχείς αμπελουργικές παραδόσεις της Ευρώπης. Επειδή φυσάει δυνατά και βρέχει ελάχιστα, τα κλήματα πλέκονται χαμηλά σε σχήμα καλαθιού, την «κουλούρα», που προστατεύει τα σταφύλια και κρατά την υγρασία της νύχτας. Το ηφαιστειακό έδαφος προστάτεψε τα αμπέλια από τη φυλλοξήρα. Δοκιμάστε Ασύρτικο και το γλυκό Vinsanto.', 'Santorini has one of Europe''s oldest continuous winemaking traditions. Because of strong winds and very little rain, the vines are trained low into a basket shape, the "kouloura", which shelters the grapes and holds the night-time moisture. The volcanic soil protected the vineyards from phylloxera. Taste Assyrtiko and the sweet Vinsanto.', null, null, 'car', 26);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('wine_museum', 'museum', 36.394, 25.4435, 'Μουσείο Οίνου (Βόθωνας)', 'Wine Museum (Vothonas)', 'Υπόγειο μουσείο για την ιστορία του κρασιού στο νησί.', 'An underground museum on the island''s wine history.', 'Σε υπόγειες στοές, το μουσείο αφηγείται την ιστορία του σαντορινιού κρασιού από τον 17ο αιώνα ως σήμερα, με παλιά εργαλεία, πατητήρια και ομοιώματα. Η επίσκεψη συνήθως ολοκληρώνεται με γευσιγνωσία.', 'In underground galleries, the museum tells the story of Santorini wine from the 17th century to today, with old tools, wine presses and models. Visits usually end with a tasting.', 'Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.', 'Please check current opening hours before visiting.', 'car', 27);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('tomato_museum', 'museum', 36.343, 25.4225, 'Βιομηχανικό Μουσείο Τομάτας', 'Tomato Industrial Museum', 'Παλιό εργοστάσιο τοματοπολτού στη Βλυχάδα.', 'A former tomato-paste factory in Vlychada.', 'Η μικρή σαντορινιά ντοματίνα, που μεγαλώνει σχεδόν χωρίς νερό, ήταν για δεκαετίες βασικό προϊόν του νησιού και τροφοδοτούσε εργοστάσια τοματοπολτού. Το μουσείο, σε ένα από αυτά τα παλιά εργοστάσια, δείχνει τα μηχανήματα και τη ζωή των εργατών.', 'The small Santorini cherry tomato, grown with almost no water, was for decades a key island product supplying tomato-paste factories. The museum, in one of these old factories, shows the machinery and the workers'' lives.', 'Ελέγξτε το τρέχον ωράριο πριν την επίσκεψη.', 'Please check current opening hours before visiting.', 'car', 28);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('profitis_ilias', 'nature', 36.37, 25.4598, 'Προφήτης Ηλίας', 'Profitis Ilias', 'Το ψηλότερο σημείο του νησιού, με το μοναστήρι του 18ου αιώνα.', 'The island''s highest point, with its 18th-century monastery.', 'Στα περίπου 560 μέτρα, η κορυφή του Προφήτη Ηλία είναι το ψηλότερο σημείο του νησιού, από ασβεστόλιθο παλαιότερο από το ηφαίστειο. Το μοναστήρι ιδρύθηκε τον 18ο αιώνα. Με καθαρό ουρανό βλέπετε όλη τη Σαντορίνη και τα γύρω νησιά.', 'At around 560 metres, the summit of Profitis Ilias is the island''s highest point, made of limestone older than the volcano. The monastery was founded in the 18th century. On a clear day you can see all of Santorini and the surrounding islands.', null, null, 'car', 29);
  insert into public.roots_pois (code, category, lat, lng, name_el, name_en, short_el, short_en, body_el, body_en, hours_el, hours_en, access, sort) values ('lighthouse', 'nature', 36.357, 25.3568, 'Φάρος Ακρωτηρίου', 'Akrotiri lighthouse', 'Το νοτιοδυτικό άκρο του νησιού, για ήσυχο ηλιοβασίλεμα.', 'The island''s south-western tip, for a quieter sunset.', 'Ο πέτρινος φάρος του Ακρωτηρίου, του 19ου αιώνα, στέκεται στην άκρη της καλντέρας. Είναι εναλλακτικό, πιο ήσυχο σημείο για το ηλιοβασίλεμα, με θέα σε όλο το τόξο του νησιού.', 'The 19th-century stone lighthouse of Akrotiri stands at the end of the caldera. It is a quieter alternative sunset spot, with views along the whole arc of the island.', null, null, 'car', 30);
  insert into public.roots_routes (code, icon, color, title_el, title_en, intro_el, intro_en, duration_el, duration_en, mode, sort) values ('volcanic', '🌋', '#eb6834', 'Volcanic Roots', 'Volcanic Roots', 'Το ηφαίστειο που έφτιαξε το νησί: η καλντέρα, οι νεαρές λάβες της Νέας Καμένης, τα ζεστά νερά, και οι ακτές με τα κόκκινα, μαύρα και λευκά πετρώματα.', 'The volcano that made the island: the caldera, the young lavas of Nea Kameni, the warm springs and the shores of red, black and white rock.', '1 ημέρα (καραβάκι + αυτοκίνητο)', '1 day (boat + car)', 'mixed', 1);
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 1 from public.roots_routes r, public.roots_pois p where r.code = 'volcanic' and p.code = 'caldera_view';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 2 from public.roots_routes r, public.roots_pois p where r.code = 'volcanic' and p.code = 'nea_kameni';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 3 from public.roots_routes r, public.roots_pois p where r.code = 'volcanic' and p.code = 'palea_kameni';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 4 from public.roots_routes r, public.roots_pois p where r.code = 'volcanic' and p.code = 'red_beach';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 5 from public.roots_routes r, public.roots_pois p where r.code = 'volcanic' and p.code = 'vlychada';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 6 from public.roots_routes r, public.roots_pois p where r.code = 'volcanic' and p.code = 'perissa';
  insert into public.roots_routes (code, icon, color, title_el, title_en, intro_el, intro_en, duration_el, duration_en, mode, sort) values ('ancient', '🏺', '#2a78d6', 'Ancient Roots', 'Ancient Roots', 'Από την πόλη της Εποχής του Χαλκού που έθαψε η τέφρα ως την αρχαία πόλη στην κορυφή του βουνού: δύο μουσεία και δύο αρχαιολογικοί χώροι.', 'From the Bronze Age town buried by ash to the ancient city on the mountaintop: two museums and two archaeological sites.', '1 ημέρα', '1 day', 'car', 2);
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 1 from public.roots_routes r, public.roots_pois p where r.code = 'ancient' and p.code = 'museum_prehistoric';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 2 from public.roots_routes r, public.roots_pois p where r.code = 'ancient' and p.code = 'akrotiri';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 3 from public.roots_routes r, public.roots_pois p where r.code = 'ancient' and p.code = 'museum_archaeological';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 4 from public.roots_routes r, public.roots_pois p where r.code = 'ancient' and p.code = 'ancient_thera';
  insert into public.roots_routes (code, icon, color, title_el, title_en, intro_el, intro_en, duration_el, duration_en, mode, sort) values ('architectural', '🏛️', '#1baf7a', 'Architectural Roots', 'Architectural Roots', 'Υπόσκαφα, μεσαιωνικά καστέλια, καπετανόσπιτα και καμπαναριά: πώς έχτισαν οι Σαντορινιοί για να ζήσουν με τον αέρα, τους σεισμούς και τους πειρατές.', 'Cave houses, medieval fortified villages, captains'' mansions and bell towers: how islanders built to live with the wind, earthquakes and pirates.', '1 ημέρα', '1 day', 'car', 3);
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 1 from public.roots_routes r, public.roots_pois p where r.code = 'architectural' and p.code = 'yposkafa';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 2 from public.roots_routes r, public.roots_pois p where r.code = 'architectural' and p.code = 'skaros';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 3 from public.roots_routes r, public.roots_pois p where r.code = 'architectural' and p.code = 'oia_captains';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 4 from public.roots_routes r, public.roots_pois p where r.code = 'architectural' and p.code = 'oia_castle';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 5 from public.roots_routes r, public.roots_pois p where r.code = 'architectural' and p.code = 'pyrgos';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 6 from public.roots_routes r, public.roots_pois p where r.code = 'architectural' and p.code = 'megalochori';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 7 from public.roots_routes r, public.roots_pois p where r.code = 'architectural' and p.code = 'emporio';
  insert into public.roots_routes (code, icon, color, title_el, title_en, intro_el, intro_en, duration_el, duration_en, mode, sort) values ('cultural', '🍇', '#eda100', 'Cultural Roots', 'Cultural Roots', 'Πίστη, κρασί και ντομάτα: εκκλησίες με ιστορία αιώνων, τα αμπέλια-καλάθια, και τα προϊόντα που γέννησε η ξερή ηφαιστειακή γη.', 'Faith, wine and tomatoes: centuries-old churches, the basket-woven vines and the produce of the dry volcanic soil.', '1 ημέρα', '1 day', 'car', 4);
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 1 from public.roots_routes r, public.roots_pois p where r.code = 'cultural' and p.code = 'orthodox_cathedral';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 2 from public.roots_routes r, public.roots_pois p where r.code = 'cultural' and p.code = 'catholic_cathedral';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 3 from public.roots_routes r, public.roots_pois p where r.code = 'cultural' and p.code = 'episkopi';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 4 from public.roots_routes r, public.roots_pois p where r.code = 'cultural' and p.code = 'vineyards';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 5 from public.roots_routes r, public.roots_pois p where r.code = 'cultural' and p.code = 'wine_museum';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 6 from public.roots_routes r, public.roots_pois p where r.code = 'cultural' and p.code = 'tomato_museum';
  insert into public.roots_routes (code, icon, color, title_el, title_en, intro_el, intro_en, duration_el, duration_en, mode, sort) values ('natural', '🌿', '#e87ba4', 'Natural Roots', 'Natural Roots', 'Μονοπάτια, κορυφές και ακρογιαλιές: το μονοπάτι της καλντέρας, ο βράχος του Σκάρου, η ψηλότερη κορυφή και ο φάρος στην άκρη του νησιού.', 'Paths, peaks and shores: the caldera trail, Skaros Rock, the highest summit and the lighthouse at the island''s tip.', '1–2 ημέρες', '1–2 days', 'mixed', 5);
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 1 from public.roots_routes r, public.roots_pois p where r.code = 'natural' and p.code = 'caldera_trail';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 2 from public.roots_routes r, public.roots_pois p where r.code = 'natural' and p.code = 'skaros';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 3 from public.roots_routes r, public.roots_pois p where r.code = 'natural' and p.code = 'ammoudi';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 4 from public.roots_routes r, public.roots_pois p where r.code = 'natural' and p.code = 'profitis_ilias';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 5 from public.roots_routes r, public.roots_pois p where r.code = 'natural' and p.code = 'lighthouse';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 6 from public.roots_routes r, public.roots_pois p where r.code = 'natural' and p.code = 'vlychada';
  insert into public.roots_routes (code, icon, color, title_el, title_en, intro_el, intro_en, duration_el, duration_en, mode, sort) values ('splendour', '✨', '#008300', 'Splendour Journey', 'Splendour Journey', 'Μια περιπατητική διαδρομή που ξεκινά από την πόρτα του ξενοδοχείου: οι «Τρεις Καμπάνες», το μονοπάτι της καλντέρας ως τα Φηρά με τις εκκλησίες και τα μουσεία τους, και επιστροφή μέσω Φηροστεφανιού ως τον βράχο του Σκάρου.', 'A walking route that starts at the hotel door: the "Three Bells", the caldera path to Fira with its churches and museums, and back through Firostefani to Skaros Rock.', 'Μισή ημέρα με τα πόδια', 'Half a day on foot', 'walk', 6);
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 1 from public.roots_routes r, public.roots_pois p where r.code = 'splendour' and p.code = 'hotel';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 2 from public.roots_routes r, public.roots_pois p where r.code = 'splendour' and p.code = 'agios_gerasimos';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 3 from public.roots_routes r, public.roots_pois p where r.code = 'splendour' and p.code = 'three_bells';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 4 from public.roots_routes r, public.roots_pois p where r.code = 'splendour' and p.code = 'orthodox_cathedral';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 5 from public.roots_routes r, public.roots_pois p where r.code = 'splendour' and p.code = 'museum_prehistoric';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 6 from public.roots_routes r, public.roots_pois p where r.code = 'splendour' and p.code = 'museum_archaeological';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 7 from public.roots_routes r, public.roots_pois p where r.code = 'splendour' and p.code = 'yposkafa';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 8 from public.roots_routes r, public.roots_pois p where r.code = 'splendour' and p.code = 'caldera_view';
  insert into public.roots_route_stops (route_id, poi_id, seq) select r.id, p.id, 9 from public.roots_routes r, public.roots_pois p where r.code = 'splendour' and p.code = 'skaros';
end $seed$;


-- ---------------------------------------------------------------------
-- 0011_ar_pilot.sql
-- ---------------------------------------------------------------------
-- Πιλοτικό AR: σημεία που φαίνονται από την καλντέρα στο Φηροστεφάνι. ar_verified μένει false μέχρι τον έλεγχο επιτόπου.
update public.roots_pois set ar_enabled = true
where code in ('nea_kameni','palea_kameni','skaros','oia_castle','orthodox_cathedral','profitis_ilias','lighthouse') and not ar_enabled;
