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
