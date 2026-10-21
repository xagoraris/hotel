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
