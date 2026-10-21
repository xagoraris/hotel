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
