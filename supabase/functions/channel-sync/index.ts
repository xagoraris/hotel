// Συγχρονισμός με channel manager: WebHotelier (rest.reserve-online.net) ή Channex.io.
// Καλείται: από το pg_cron κάθε 5', από το webhook του παρόχου (με ?token=…) και από την εφαρμογή (διαχειριστής).
// Ενέργειες: sync (λήψη κρατήσεων + αποστολή διαθεσιμότητας), test (έλεγχος σύνδεσης), full_push (πλήρης διαθεσιμότητα).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type Settings = {
  provider: "channex" | "webhotelier"; environment: string; api_key: string; api_username: string | null;
  property_id: string; enabled: boolean; webhook_token: string; last_pull_at: string | null;
};
type Result = { imported: number; failed: number; skipped?: boolean };

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

// Μία καταγραφή ανά ώρα για την ίδια αποτυχημένη κράτηση (ξαναδοκιμάζεται σε κάθε συγχρονισμό).
async function logFailOnce(id: string, message: string, payload: unknown) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { data: recent } = await db.from("channel_log").select("id").eq("ok", false)
    .eq("payload->>id", id).gte("created_at", since).limit(1);
  if (!recent?.length) await log("in", false, message, payload);
}

function httpError(prefix: string, status: number, json: any) {
  const detail = json?.error_msg || json?.error_code || json?.errors || json || "";
  const err = new Error(`${prefix}: HTTP ${status} ${(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)}`);
  (err as any).status = status;
  (err as any).code = json?.error_code;
  return err;
}

async function readJson(res: Response) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return { raw: text.slice(0, 300) }; }
}

// ======================================================================
// WebHotelier
// ======================================================================
const WH_BASE = "https://rest.reserve-online.net";

function basicAuth(user: string, pass: string) {
  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return "Basic " + btoa(bin);
}

async function wh(s: Settings, method: string, path: string, body?: unknown) {
  const res = await fetch(WH_BASE + path, {
    method,
    headers: {
      Authorization: basicAuth(s.api_username ?? "", s.api_key),
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await readJson(res);
  if (!res.ok || (json?.error_code && json.error_code !== "OK")) {
    throw httpError(`WebHotelier ${method} ${path}`, res.status, json);
  }
  return json;
}

const num = (x: unknown) => {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(String(x).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const txt = (x: unknown) => (x === null || x === undefined ? "" : typeof x === "string" ? x : JSON.stringify(x)).trim();

// Κράτηση WebHotelier → μορφή που δέχεται η channel_import_revision (ίδια με του Channex).
function whToRevision(b: any, kind: "new" | "modified" | "cancelled") {
  const rs = b?.roomStay ?? {};
  const ci = b?.clientInfo ?? {};
  const code = b?.statusCode ? String(b.statusCode).toUpperCase() : "";
  const cancelled = kind === "cancelled" || code === "CANCELLED" || code === "PURGED" ||
    (!code && (b?.status === 0 || b?.status === false || b?.status === "0"));
  const src = txt(b?.bookInfo?.source);
  const otaName = (b?.channelstream || b?.offline) && src ? src : `WebHotelier${src ? ` (${src})` : ""}`;
  const list: any[] = Array.isArray(b?.rooms) && b.rooms.length
    ? b.rooms
    : Array.from({ length: Math.max(1, Number(rs.rooms) || 1) }, () => ({}));
  const total = num(b?.pricing?.price);
  const notes = [txt(b?.special_requests), txt(b?.channel_notes), txt(ci.remarks)].filter(Boolean).join(" · ");
  return {
    attributes: {
      booking_id: String(b?.id),
      status: cancelled ? "cancelled" : kind === "new" ? "new" : "modified",
      ota_reservation_code: txt(b?.external_id) || String(b?.id),
      ota_name: otaName,
      arrival_date: rs.from,
      departure_date: rs.to,
      notes,
      customer: {
        name: txt(ci.firstName), surname: txt(ci.lastName), mail: txt(ci.email), phone: txt(ci.tel),
        country: txt(ci.country), city: txt(ci.location), address: txt(ci.address),
      },
      rooms: list.map(r => ({
        room_type_id: rs.roomType,
        checkin_date: rs.from,
        checkout_date: rs.to,
        occupancy: { adults: Number(r.adults) || 1, children: Number(r.children) || 0, infants: Number(r.infants) || 0 },
        amount: num(r.price_with_tax) ?? num(r.price) ?? (total !== null ? Math.round(total / list.length * 100) / 100 : 0),
      })),
    },
  };
}

async function whImport(b: any, kind: "new" | "modified" | "cancelled") {
  const rev = whToRevision(b, kind);
  const { data, error } = await db.rpc("channel_import_revision", { p_rev: rev });
  if (error) throw new Error(error.message);
  return String(data);
}

async function whMarkSynced(s: Settings, id: string) {
  try {
    await wh(s, "POST", `/reservation/sync/${encodeURIComponent(id)}`);
  } catch (e) {
    if ((e as any).code === "INVALID_METHOD" || (e as any).status === 405) await wh(s, "GET", `/reservation/sync/${encodeURIComponent(id)}`);
    else throw e;
  }
}

// Λήψη εκκρεμών κρατήσεων (νέες / αλλαγές / ακυρώσεις). Η WebHotelier επιτρέπει την κλήση το πολύ κάθε 5'.
async function whPull(s: Settings): Promise<Result> {
  if (s.last_pull_at && Date.now() - new Date(s.last_pull_at).getTime() < 290_000) return { imported: 0, failed: 0, skipped: true };
  await db.from("channel_settings").update({ last_pull_at: new Date().toISOString() }).eq("id", 1);
  const pending = await wh(s, "GET", "/reservation/new");
  const items: any[] = pending?.data?.reservations ?? [];
  let imported = 0, failed = 0;
  for (const it of items) {
    const id = String(it.id);
    try {
      const full = await wh(s, "GET", `/reservation/${encodeURIComponent(id)}`);
      const kind = it.syncType === "CL" ? "cancelled" : it.syncType === "NEW" ? "new" : "modified";
      const msg = await whImport(full?.data ?? full, kind);
      await whMarkSynced(s, id);
      await log("in", true, msg, { id, syncType: it.syncType });
      imported++;
    } catch (e) {
      failed++;
      await logFailOnce(id, e instanceof Error ? e.message : String(e), { id, syncType: it.syncType });
    }
  }
  return { imported, failed };
}

// Αποστολή διαθεσιμότητας: όλοι οι τύποι σε ένα αίτημα (η WebHotelier το εφαρμόζει όλο ή τίποτα).
async function whPushValues(s: Settings, values: any[]) {
  const body: Record<string, { from: string; to: string; allot: number }[]> = {};
  for (const v of values) (body[v.room_type_id] ??= []).push({ from: v.date_from, to: v.date_to, allot: v.availability });
  await wh(s, "POST", "/manage/availability", body);
}

async function whTest(s: Settings) {
  const code = encodeURIComponent(s.property_id);
  const rooms = await wh(s, "GET", `/room/${code}`);
  let title: string | null = null;
  try { const p = await wh(s, "GET", `/property/${code}`); title = p?.data?.name ?? null; } catch { /* προαιρετικό */ }
  return {
    property: title ?? s.property_id,
    room_types: (rooms?.data?.rooms ?? []).map((r: any) => ({ id: String(r.code), title: `${r.name ?? r.code} (${r.code})` })),
  };
}

// PUSH από τη WebHotelier: { id, type: new|update|cancel|restore|transaction, data }.
// Μόνο το 200 σημαίνει «παραλήφθηκε». Σε σφάλμα απαντάμε 500 και η κράτηση έρχεται με τον επόμενο συγχρονισμό.
async function whOnPush(body: any) {
  const id = String(body?.id ?? body?.data?.id ?? "");
  const type = String(body?.type ?? "").toLowerCase();
  if (!id || type === "transaction") return reply({ ok: true, skipped: type || "empty" });
  try {
    const kind = type === "cancel" ? "cancelled" : type === "new" ? "new" : "modified";
    const msg = await whImport(body.data ?? {}, kind);
    await log("in", true, msg, { id, type, via: "push" });
    return reply({ ok: true });
  } catch (e) {
    await logFailOnce(id, e instanceof Error ? e.message : String(e), { id, type, via: "push" });
    return reply({ ok: false }, 500);
  }
}

// ======================================================================
// Channex.io
// ======================================================================
const CX_BASE: Record<string, string> = {
  staging: "https://staging.channex.io/api/v1",
  production: "https://app.channex.io/api/v1",
};

async function cx(s: Settings, method: string, path: string, body?: unknown) {
  const res = await fetch(CX_BASE[s.environment] + path, {
    method,
    headers: { "user-api-key": s.api_key, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await readJson(res);
  if (!res.ok) throw httpError(`Channex ${method} ${path.split("?")[0]}`, res.status, json?.errors ?? json);
  return json;
}

async function cxAck(s: Settings, id: string) {
  try {
    await cx(s, "POST", `/booking_revisions/${id}/ack`);
  } catch (e) {
    if ((e as any).status === 404 || (e as any).status === 405) await cx(s, "PUT", `/booking_revisions/${id}/ack`);
    else throw e;
  }
}

// Το ack γίνεται μόνο αφού αποθηκευτεί η κράτηση.
async function cxPull(s: Settings): Promise<Result> {
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
      if (error) { failed++; await logFailOnce(rev.id, error.message, rev); continue; }
      await cxAck(s, rev.id);
      await log("in", true, String(data), { id: rev.id, booking_id: rev?.attributes?.booking_id });
      imported++;
    }
  }
  return { imported, failed };
}

async function cxPushValues(s: Settings, values: any[]) {
  const withProp = values.map(v => ({ property_id: s.property_id, ...v }));
  for (let i = 0; i < withProp.length; i += 200) await cx(s, "POST", "/availability", { values: withProp.slice(i, i + 200) });
}

async function cxTest(s: Settings) {
  const prop = await cx(s, "GET", `/properties/${encodeURIComponent(s.property_id)}`);
  const rt = await cx(s, "GET", `/room_types?filter[property_id]=${encodeURIComponent(s.property_id)}&pagination[limit]=100`);
  return {
    property: prop?.data?.attributes?.title ?? s.property_id,
    room_types: (rt?.data ?? []).map((r: any) => ({ id: r.id, title: r.attributes?.title })),
  };
}

// ======================================================================
// Κοινά
// ======================================================================
const isWH = (s: Settings) => s.provider === "webhotelier";
const providerName = (s: Settings) => (isWH(s) ? "WebHotelier" : "Channex");

// Αποστολή διαθεσιμότητας για ό,τι άλλαξε. Σε αποτυχία ξαναμπαίνουν όλα στην ουρά.
async function pushAvailability(s: Settings) {
  const { data, error } = await db.rpc("channel_take_ari");
  if (error) throw error;
  const values = data as any[];
  if (!values.length) return 0;
  try {
    if (isWH(s)) await whPushValues(s, values); else await cxPushValues(s, values);
  } catch (e) {
    await db.rpc("channel_enqueue_full", { p_days: 500 });
    throw e;
  }
  await log("out", true, `Διαθεσιμότητα: ${values.length} ${values.length === 1 ? "εύρος" : "εύρη"} ημερομηνιών`, { values: values.slice(0, 50) });
  return values.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const { data: s, error: sErr } = await db.from("channel_settings").select("*").eq("id", 1).single();
  if (sErr || !s) return reply({ error: "settings missing" }, 500);
  const st = s as Settings;

  // Πρόσβαση: είτε μυστικό token (cron / webhook) είτε συνδεδεμένος διαχειριστής.
  const token = new URL(req.url).searchParams.get("token");
  const byToken = !!(token && sameSecret(token, st.webhook_token));
  let isAdmin = false;
  if (!byToken) {
    const auth = req.headers.get("Authorization");
    if (!auth) return reply({ error: "unauthorized" }, 401);
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: admin } = await asUser.rpc("is_admin");
    if (admin !== true) return reply({ error: "forbidden" }, 403);
    isAdmin = true;
  }

  // Ειδοποίηση PING (GET) της WebHotelier: απαντάμε αμέσως· οι κρατήσεις έρχονται με τον προγραμματισμένο συγχρονισμό.
  if (req.method === "GET") return byToken ? reply({ ok: true }) : reply({ error: "method not allowed" }, 405);
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

  let body: any = {};
  try { body = await req.json(); } catch { /* webhook χωρίς σώμα */ }

  if (byToken && isWH(st) && body && body.data && (body.id || body.data.id)) {
    if (!st.enabled) return reply({ ok: false, skipped: "disabled" }, 503);
    return await whOnPush(body);
  }

  const action = isAdmin ? (body.action ?? "sync") : "sync";
  if (!st.api_key || !st.property_id || (isWH(st) && !st.api_username)) {
    return reply({ ok: false, error: isWH(st) ? "Συμπλήρωσε όνομα χρήστη, κωδικό και κωδικό καταλύματος." : "Συμπλήρωσε κλειδί API και Property ID." }, 400);
  }
  if (!st.enabled && !isAdmin) return reply({ ok: true, skipped: "disabled" });

  try {
    if (action === "test") {
      const r = isWH(st) ? await whTest(st) : await cxTest(st);
      await log("info", true, `Επιτυχής σύνδεση ${providerName(st)} με «${r.property}»`);
      return reply({ ok: true, ...r });
    }
    if (action === "full_push") {
      await db.rpc("channel_enqueue_full", { p_days: 500 });
      const pushed = await pushAvailability(st);
      await db.from("channel_settings").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", 1);
      return reply({ ok: true, pushed });
    }
    const r = isWH(st) ? await whPull(st) : await cxPull(st);
    const pushed = await pushAvailability(st);
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
