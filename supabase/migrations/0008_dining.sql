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
