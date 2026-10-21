// Συγχρονισμός με channel manager (Channex.io).
// Καλείται: από το pg_cron κάθε 2', από το webhook του Channex (με ?token=…) και από την εφαρμογή (διαχειριστής).
// Ενέργειες: sync (λήψη κρατήσεων + αποστολή διαθεσιμότητας), test (έλεγχος σύνδεσης), full_push (πλήρης διαθεσιμότητα).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const BASE: Record<string, string> = {
  staging: "https://staging.channex.io/api/v1",
  production: "https://app.channex.io/api/v1",
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Settings = { environment: string; api_key: string; property_id: string; enabled: boolean; webhook_token: string };

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function log(direction: "in" | "out" | "info", ok: boolean, message: string, payload: unknown = null) {
  await db.from("channel_log").insert({ direction, ok, message, payload });
}

async function cx(s: Settings, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE[s.environment] + path, {
    method,
    headers: { "user-api-key": s.api_key, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const err = new Error(`Channex ${method} ${path.split("?")[0]}: HTTP ${res.status} ${JSON.stringify(json?.errors ?? json ?? "").slice(0, 300)}`);
    (err as any).status = res.status;
    throw err;
  }
  return json;
}

async function ack(s: Settings, id: string) {
  try {
    await cx(s, "POST", `/booking_revisions/${id}/ack`);
  } catch (e) {
    if ((e as any).status === 404 || (e as any).status === 405) await cx(s, "PUT", `/booking_revisions/${id}/ack`);
    else throw e;
  }
}

// Λήψη νέων / αλλαγμένων / ακυρωμένων κρατήσεων. Το ack γίνεται μόνο αφού αποθηκευτεί η κράτηση.
async function pullBookings(s: Settings) {
  let imported = 0, failed = 0;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const feed = await cx(s, "GET", `/booking_revisions/feed?filter[property_id]=${encodeURIComponent(s.property_id)}&order[inserted_at]=asc`);
    const items: any[] = (feed?.data ?? []).filter((r: any) => !seen.has(r.id));
    if (!items.length) break;
    for (const rev of items) {
      seen.add(rev.id);
      const prop = rev?.attributes?.property_id;
      if (prop && prop !== s.property_id) continue;
      const { data, error } = await db.rpc("channel_import_revision", { p_rev: rev });
      if (error) {
        failed++;
        // Μία καταγραφή ανά ώρα για την ίδια αποτυχημένη κράτηση (ξαναδοκιμάζεται σε κάθε συγχρονισμό).
        const since = new Date(Date.now() - 3600_000).toISOString();
        const { data: recent } = await db.from("channel_log").select("id").eq("ok", false)
          .eq("payload->>id", rev.id).gte("created_at", since).limit(1);
        if (!recent?.length) await log("in", false, error.message, rev);
        continue;
      }
      await ack(s, rev.id);
      await log("in", true, String(data), { id: rev.id, booking_id: rev?.attributes?.booking_id });
      imported++;
    }
  }
  return { imported, failed };
}

// Αποστολή διαθεσιμότητας για ό,τι άλλαξε. Σε αποτυχία ξαναμπαίνουν όλα στην ουρά.
async function pushAvailability(s: Settings) {
  const { data, error } = await db.rpc("channel_take_ari");
  if (error) throw error;
  const values = (data as any[]).map(v => ({ property_id: s.property_id, ...v }));
  if (!values.length) return 0;
  try {
    for (let i = 0; i < values.length; i += 200) {
      await cx(s, "POST", "/availability", { values: values.slice(i, i + 200) });
    }
  } catch (e) {
    await db.rpc("channel_enqueue_full", { p_days: 500 });
    throw e;
  }
  await log("out", true, `Διαθεσιμότητα: ${values.length} ${values.length === 1 ? "εύρος" : "εύρη"} ημερομηνιών`, { values: values.slice(0, 50) });
  return values.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

  const { data: s, error: sErr } = await db.from("channel_settings").select("*").eq("id", 1).single();
  if (sErr || !s) return reply({ error: "settings missing" }, 500);

  // Πρόσβαση: είτε μυστικό token (cron / webhook) είτε συνδεδεμένος διαχειριστής.
  const token = new URL(req.url).searchParams.get("token");
  let isAdmin = false;
  if (!(token && sameSecret(token, s.webhook_token))) {
    const auth = req.headers.get("Authorization");
    if (!auth) return reply({ error: "unauthorized" }, 401);
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: admin } = await asUser.rpc("is_admin");
    if (admin !== true) return reply({ error: "forbidden" }, 403);
    isAdmin = true;
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* webhook χωρίς σώμα */ }
  const action = isAdmin ? (body.action ?? "sync") : "sync";

  if (!s.api_key || !s.property_id) return reply({ ok: false, error: "Συμπλήρωσε κλειδί API και Property ID." }, 400);
  if (!s.enabled && !isAdmin) return reply({ ok: true, skipped: "disabled" });

  try {
    if (action === "test") {
      const prop = await cx(s, "GET", `/properties/${encodeURIComponent(s.property_id)}`);
      const rt = await cx(s, "GET", `/room_types?filter[property_id]=${encodeURIComponent(s.property_id)}&pagination[limit]=100`);
      await log("info", true, `Επιτυχής σύνδεση με «${prop?.data?.attributes?.title ?? s.property_id}»`);
      return reply({
        ok: true,
        property: prop?.data?.attributes?.title ?? null,
        room_types: (rt?.data ?? []).map((r: any) => ({ id: r.id, title: r.attributes?.title })),
      });
    }
    if (action === "full_push") {
      await db.rpc("channel_enqueue_full", { p_days: 500 });
      const pushed = await pushAvailability(s);
      await db.from("channel_settings").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", 1);
      return reply({ ok: true, pushed });
    }
    const r = await pullBookings(s);
    const pushed = await pushAvailability(s);
    await db.from("channel_settings").update({
      last_sync_at: new Date().toISOString(),
      last_error: r.failed ? `${r.failed} κρατήσεις δεν εισήχθησαν (δες το ιστορικό)` : null,
    }).eq("id", 1);
    return reply({ ok: true, ...r, pushed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("channel_settings").update({ last_error: msg }).eq("id", 1);
    await log("info", false, msg);
    return reply({ ok: false, error: msg }, 502);
  }
});
