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
