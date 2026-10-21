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
