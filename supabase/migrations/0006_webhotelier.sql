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
