-- ---------------------------------------------------------------------
-- 0011_ar_pilot.sql
-- ---------------------------------------------------------------------
-- Πιλοτικό AR: σημεία που φαίνονται από την καλντέρα στο Φηροστεφάνι. ar_verified μένει false μέχρι τον έλεγχο επιτόπου.
update public.roots_pois set ar_enabled = true
where code in ('nea_kameni','palea_kameni','skaros','oia_castle','orthodox_cathedral','profitis_ilias','lighthouse') and not ar_enabled;
