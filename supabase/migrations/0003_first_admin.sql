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
