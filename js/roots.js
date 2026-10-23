// Splendour Roots: ψηφιακός πολιτιστικός οδηγός (δημόσιος, χωρίς σύνδεση).
// Διαδρομές, σημεία, χάρτης (Leaflet + OpenStreetMap), «κοντά μου», πρόταση διαδρομής, αφήγηση (ηχητικό ή ανάγνωση από τη συσκευή).

const LANG_KEY = "hotel_tablet_lang";
const FROM_ROOM = new URLSearchParams(location.search).get("from") === "room";
let lang = (() => {
  try { const v = localStorage.getItem(LANG_KEY); if (v) return v; } catch {}
  return /^el\b/i.test(navigator.language || "") ? "el" : "en";
})();

const T = {
  el: {
    tagline: "Ανακαλύψτε τη Σαντορίνη: ιστορία, πολιτισμός και φύση",
    intro: "Έξι θεματικές διαδρομές για να γνωρίσετε το νησί πέρα από τις καρτ-ποστάλ: από το ηφαίστειο και τους προϊστορικούς οικισμούς ως τα καστέλια, τα αμπέλια και τα μονοπάτια της καλντέρας.",
    routes: "Θεματικές διαδρομές", map: "Χάρτης", near: "Κοντά μου", plan: "Πρότεινέ μου διαδρομή", stops: n => `${n} στάσεις`,
    start: "Πλοήγηση στη διαδρομή", directions: "Οδηγίες", listen: "Ακούστε την αφήγηση", stop: "Διακοπή", inRoutes: "Σε διαδρομές",
    hours: "Πληροφορίες επίσκεψης", access: { walk: "Με τα πόδια", car: "Με αυτοκίνητο", boat: "Με καραβάκι" },
    accessIcon: { walk: "🚶", car: "🚗", boat: "⛴️" },
    fromYou: "από εσάς", fromHotel: "από το ξενοδοχείο", walkMin: m => `~${m}′ με τα πόδια`, driveMin: m => `~${m}′ με αυτοκίνητο`,
    locating: "Εντοπισμός θέσης…", noLocation: "Δεν ήταν δυνατός ο εντοπισμός της θέσης σας. Οι αποστάσεις υπολογίζονται από το ξενοδοχείο.",
    planTitle: "Πρόταση διαδρομής", interests: "Τι σας ενδιαφέρει;", time: "Πόσο χρόνο έχετε;", moving: "Πώς θα κινηθείτε;",
    times: { 2: "2 ώρες", 4: "Μισή ημέρα", 8: "Όλη την ημέρα" }, modes: { walk: "Με τα πόδια", car: "Με αυτοκίνητο" },
    suggest: "Πρόταση", total: m => `Συνολικά περίπου ${String(Math.round(m / 30) / 2).replace(".", ",")} ώρες με τις επισκέψεις`, noPlan: "Δεν βρέθηκαν σημεία για αυτές τις επιλογές. Δοκιμάστε περισσότερο χρόνο ή αυτοκίνητο.",
    note: "Τα κείμενα είναι ενημερωτικά. Ωράρια και πρόσβαση μπορεί να αλλάζουν: ελέγξτε πριν την επίσκεψη.",
    backRoom: "Πίσω στο δωμάτιο", seeAlso: "Δείτε επίσης", ttsNo: "Η συσκευή σας δεν υποστηρίζει ανάγνωση κειμένου.",
    cat: { start: "Αφετηρία", archaeology: "Αρχαιολογικός χώρος", museum: "Μουσείο", church: "Εκκλησία", castle: "Κάστρο", village: "Χωριό", architecture: "Αρχιτεκτονική", culture: "Πολιτισμός", nature: "Φύση" }
  },
  en: {
    tagline: "Discover Santorini: history, culture and nature",
    intro: "Six themed routes to get to know the island beyond the postcards: from the volcano and prehistoric settlements to fortified villages, vineyards and the caldera footpaths.",
    routes: "Themed routes", map: "Map", near: "Near me", plan: "Plan my day", stops: n => `${n} stops`,
    start: "Navigate this route", directions: "Directions", listen: "Listen to the story", stop: "Stop", inRoutes: "On routes",
    hours: "Visiting information", access: { walk: "On foot", car: "By car", boat: "By boat" },
    accessIcon: { walk: "🚶", car: "🚗", boat: "⛴️" },
    fromYou: "from you", fromHotel: "from the hotel", walkMin: m => `~${m}′ walk`, driveMin: m => `~${m}′ drive`,
    locating: "Finding your location…", noLocation: "We couldn't get your location. Distances are measured from the hotel.",
    planTitle: "Plan my day", interests: "What interests you?", time: "How much time do you have?", moving: "How will you get around?",
    times: { 2: "2 hours", 4: "Half a day", 8: "A full day" }, modes: { walk: "On foot", car: "By car" },
    suggest: "Suggest", total: m => `About ${Math.round(m / 30) / 2} hours in total, including visits`, noPlan: "No places match these choices. Try more time or a car.",
    note: "Texts are for information. Opening hours and access may change: please check before visiting.",
    backRoom: "Back to my room", seeAlso: "See also", ttsNo: "Your device does not support text-to-speech.",
    cat: { start: "Starting point", archaeology: "Archaeological site", museum: "Museum", church: "Church", castle: "Castle", village: "Village", architecture: "Architecture", culture: "Culture", nature: "Nature" }
  }
};
const t = () => T[lang];
const L = (o, base) => (lang === "en" && o[base + "_en"]) || o[base + "_el"] || "";
const CAT_ICON = { start: "⭐", archaeology: "🏺", museum: "🏛️", church: "⛪", castle: "🏰", village: "🏘️", architecture: "🏠", culture: "🍇", nature: "🌿" };
const VISIT_MIN = { start: 0, archaeology: 90, museum: 75, church: 15, castle: 45, village: 60, architecture: 20, culture: 45, nature: 40 };
const safeUrl = u => (typeof u === "string" && /^https:\/\//i.test(u.trim())) ? u.trim() : null;

let D0 = null;          // { settings, routes, pois, stops }
let here = null;        // { lat, lng } της συσκευής, αν δόθηκε άδεια
let map = null;

// ---------------- Δεδομένα ----------------
async function loadData() {
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const [settings, routes, pois, stops] = await Promise.all([
    sb.from("settings").select("hotel_name, brand_color, accent_color, logo_url, hotel_lat, hotel_lng, roots_title").eq("id", 1).single().then(must),
    sb.from("roots_routes").select("*").eq("active", true).order("sort").order("id").then(must),
    sb.from("roots_pois").select("*").eq("active", true).order("sort").order("id").then(must),
    sb.from("roots_route_stops").select("*").order("route_id").order("seq").then(must)
  ]);
  D0 = { settings, routes, pois, stops };
}
const poiById = id => D0.pois.find(p => p.id === id);
const routeById = id => D0.routes.find(r => r.id === id);
const routeStops = r => D0.stops.filter(s => s.route_id === r.id).sort((a, b) => a.seq - b.seq).map(s => ({ ...s, poi: poiById(s.poi_id) })).filter(s => s.poi);
const routesOf = p => D0.routes.filter(r => D0.stops.some(s => s.route_id === r.id && s.poi_id === p.id));
const hotelPos = () => {
  const s = D0.settings;
  if (s.hotel_lat != null && s.hotel_lng != null) return { lat: s.hotel_lat, lng: s.hotel_lng };
  const h = D0.pois.find(p => p.category === "start");
  return h ? { lat: h.lat, lng: h.lng } : { lat: 36.4245, lng: 25.427 };
};

function track(event, ref) { try { sb.rpc("track_roots", { p_event: event, p_ref: ref || 0 }).then(() => {}, () => {}); } catch {} }

// ---------------- Γεωγραφία ----------------
function km(a, b) {
  const R = 6371, r = x => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtDist = d => d < 1 ? `${Math.round(d * 100) * 10} m` : `${d.toFixed(d < 10 ? 1 : 0).replace(".", lang === "el" ? "," : ".")} km`;
const walkMin = d => Math.max(1, Math.round(d * 1.3 / 4.5 * 60));     // 4,5 km/h, +30% για τα μονοπάτια
const driveMin = d => Math.max(2, Math.round(d * 1.4 / 35 * 60));     // ~35 km/h, +40% για τους δρόμους
function travelText(d) { return d < 2.5 ? t().walkMin(walkMin(d)) : t().driveMin(driveMin(d)); }
function locate() {
  return new Promise(ok => {
    if (here) return ok(here);
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(p => { here = { lat: p.coords.latitude, lng: p.coords.longitude }; ok(here); }, () => ok(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}
function gmapsDir(points, mode) {
  const f = p => `${p.lat},${p.lng}`;
  const o = points[0], d = points[points.length - 1], w = points.slice(1, -1).slice(0, 9);
  return `https://www.google.com/maps/dir/?api=1&origin=${f(o)}&destination=${f(d)}${w.length ? `&waypoints=${encodeURIComponent(w.map(f).join("|"))}` : ""}&travelmode=${mode === "walk" ? "walking" : "driving"}`;
}

// ---------------- Χάρτης ----------------
function drawMap(el, items, opts = {}) {
  if (map) { map.remove(); map = null; }
  if (!window.L || !el) { if (el) el.style.display = "none"; return; }
  map = window.L.map(el, { scrollWheelZoom: false, tap: true });
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  const pts = [];
  if (opts.line && items.length > 1) {
    const ll = items.map(i => [i.poi.lat, i.poi.lng]);
    window.L.polyline(ll, { color: "#fff", weight: 7, opacity: .9 }).addTo(map);
    window.L.polyline(ll, { color: opts.color || "#2a78d6", weight: 4, dashArray: opts.dashed ? "8 8" : null }).addTo(map);
  }
  items.forEach((i, n) => {
    const p = i.poi;
    const html = opts.line
      ? `<div class="rt-pin" style="background:${opts.color || "#2a78d6"}">${n + 1}</div>`
      : `<div class="rt-pin icon">${CAT_ICON[p.category] || "📍"}</div>`;
    const m = window.L.marker([p.lat, p.lng], { icon: window.L.divIcon({ className: "", html, iconSize: [30, 30], iconAnchor: [15, 15] }), title: L(p, "name") }).addTo(map);
    m.bindPopup(`<b>${esc(L(p, "name"))}</b><br><a href="#/poi/${p.id}">${lang === "el" ? "Περισσότερα" : "More"} →</a>`);
    pts.push([p.lat, p.lng]);
  });
  if (here) { window.L.circleMarker([here.lat, here.lng], { radius: 7, color: "#fff", weight: 3, fillColor: "#2a78d6", fillOpacity: 1 }).addTo(map); if (opts.withHere) pts.push([here.lat, here.lng]); }
  if (pts.length === 1) map.setView(pts[0], 14); else if (pts.length) map.fitBounds(pts, { padding: [28, 28] });
}

// ---------------- Αφήγηση ----------------
let speaking = false;
function stopSpeech() { try { speechSynthesis.cancel(); } catch {} speaking = false; }
function speak(text, btn) {
  if (!("speechSynthesis" in window)) return toast(t().ttsNo, "err");
  if (speaking) { stopSpeech(); btn.textContent = "🔊 " + t().listen; return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === "el" ? "el-GR" : "en-GB";
  const v = speechSynthesis.getVoices().find(x => x.lang && x.lang.toLowerCase().startsWith(lang === "el" ? "el" : "en-gb")) || speechSynthesis.getVoices().find(x => x.lang && x.lang.toLowerCase().startsWith(lang));
  if (v) u.voice = v;
  u.rate = 0.95;
  u.onend = u.onerror = () => { speaking = false; btn.textContent = "🔊 " + t().listen; };
  speechSynthesis.speak(u); speaking = true; btn.textContent = "⏹ " + t().stop;
}

// ---------------- Προβολές ----------------
const view = () => $("#view");
function header(title, sub, back) {
  $("#title").textContent = title;
  $("#sub").textContent = sub || "";
  $("#back").classList.toggle("hidden", !back);
}
function routeCard(r) {
  const n = routeStops(r).length;
  return `<a class="rt-card" href="#/route/${r.id}" style="--rc:${esc(r.color || "#2a78d6")}">
    <div class="ic">${esc(r.icon || "🧭")}</div>
    <div class="tx"><b>${esc(L(r, "title"))}</b><p>${esc(L(r, "intro"))}</p>
      <span class="small muted">${esc(t().stops(n))}${L(r, "duration") ? ` · ${esc(L(r, "duration"))}` : ""}</span></div></a>`;
}

function renderHome() {
  const title = D0.settings.roots_title || "Roots";
  header(title, D0.settings.hotel_name, false);
  view().innerHTML = `
  <section class="rt-hero"><h1>${esc(title)}</h1><p>${esc(t().tagline)}</p></section>
  <p class="rt-intro">${esc(t().intro)}</p>
  <div class="rt-actions">
    <a class="btn" href="#/map">🗺️ ${t().map}</a><a class="btn" href="#/near">📍 ${t().near}</a><a class="btn primary" href="#/plan">✨ ${t().plan}</a>
  </div>
  <h2 class="rt-h">${t().routes}</h2>
  <div class="rt-cards">${D0.routes.map(routeCard).join("")}</div>
  ${FROM_ROOM ? `<p style="text-align:center;margin-top:1.5rem"><a class="btn" href="#" id="toRoom">↩ ${t().backRoom}</a></p>` : ""}
  <p class="small muted rt-note">${esc(t().note)}</p>`;
  const tr = $("#toRoom"); if (tr) tr.onclick = ev => { ev.preventDefault(); goRoom(); };
}
function goRoom() {
  const back = document.referrer && /\/(tablet|room)\.html/.test(document.referrer) ? document.referrer : null;
  if (back) location.href = back; else history.back();
}

async function renderRoute(id) {
  const r = routeById(id); if (!r) return go("/");
  track("route", r.id);
  const st = routeStops(r);
  header(L(r, "title"), t().stops(st.length), true);
  let prev = null;
  view().innerHTML = `
  <section class="rt-hero small" style="--rc:${esc(r.color || "#2a78d6")}"><div class="rt-hero-ic">${esc(r.icon || "🧭")}</div><h1>${esc(L(r, "title"))}</h1>
    <p>${esc(L(r, "duration"))}</p></section>
  <p class="rt-intro">${esc(L(r, "intro"))}</p>
  <div id="map" class="rt-map"></div>
  <div class="rt-actions"><a class="btn primary" target="_blank" rel="noopener" href="${esc(gmapsDir(st.map(s => s.poi), r.mode === "walk" ? "walk" : "car"))}">🧭 ${t().start}</a></div>
  <ol class="rt-stops">${st.map((s, n) => {
    const p = s.poi; const d = prev ? km(prev, p) : null; prev = p;
    return `<li style="--rc:${esc(r.color || "#2a78d6")}">
      ${d != null ? `<div class="rt-leg small muted">${t().accessIcon[p.access] || ""} ${fmtDist(d)} · ${esc(p.access === "boat" ? t().access.boat : travelText(d))}</div>` : ""}
      <a class="rt-stop" href="#/poi/${p.id}"><span class="num">${n + 1}</span>
        <span class="tx"><b>${esc(L(p, "name"))}</b><span class="small muted">${CAT_ICON[p.category] || ""} ${esc(t().cat[p.category] || "")}</span>
        <span class="small">${esc(L(p, "short"))}</span>${L(s, "note") ? `<span class="small rt-noteline">${esc(L(s, "note"))}</span>` : ""}</span></a></li>`; }).join("")}</ol>`;
  drawMap($("#map"), st, { line: true, color: r.color, dashed: r.mode !== "walk" });
}

async function renderPoi(id) {
  const p = poiById(id); if (!p) return go("/");
  track("poi", p.id);
  header(L(p, "name"), t().cat[p.category] || "", true);
  const rs = routesOf(p);
  const audio = safeUrl(lang === "en" ? (p.audio_en_url || p.audio_el_url) : (p.audio_el_url || p.audio_en_url));
  const imgs = [p.image_url, ...(p.gallery || [])].filter(safeUrl);
  const origin = here || hotelPos(), d = km(origin, p);
  view().innerHTML = `
  ${imgs.length ? `<div class="rt-gallery">${imgs.map((u, n) => `<div class="g" data-g="${n}"></div>`).join("")}</div>` : ""}
  <h1 class="rt-ptitle">${CAT_ICON[p.category] || ""} ${esc(L(p, "name"))}</h1>
  <p class="rt-lead">${esc(L(p, "short"))}</p>
  <p class="small muted">${t().accessIcon[p.access]} ${esc(t().access[p.access])} · ${fmtDist(d)} ${here ? t().fromYou : t().fromHotel}${p.access === "boat" ? "" : ` · ${esc(travelText(d))}`}</p>
  <div class="rt-actions">
    ${audio ? `<audio controls preload="none" src="${esc(audio)}" id="aud"></audio>` : `<button class="btn" id="tts">🔊 ${t().listen}</button>`}
    <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">🧭 ${t().directions}</a>
  </div>
  <div class="rt-body">${esc(L(p, "body")).split(/\n+/).map(x => `<p>${x}</p>`).join("")}</div>
  ${L(p, "hours") ? `<div class="alert info small"><b>${t().hours}:</b> ${esc(L(p, "hours"))}</div>` : ""}
  <div id="map" class="rt-map small"></div>
  ${rs.length ? `<h2 class="rt-h">${t().inRoutes}</h2><div class="rt-chips">${rs.map(r => `<a class="rt-chip" href="#/route/${r.id}" style="--rc:${esc(r.color)}">${esc(r.icon || "")} ${esc(L(r, "title"))}</a>`).join("")}</div>` : ""}
  <p class="small muted rt-note">${esc(t().note)}</p>`;
  imgs.forEach((u, n) => { const el = $(`[data-g="${n}"]`); if (el) el.style.backgroundImage = `url(${JSON.stringify(u)})`; });
  const tb = $("#tts");
  if (tb) tb.onclick = () => { if (!speaking) track("audio", p.id); speak(`${L(p, "name")}. ${L(p, "body")}`, tb); };
  const au = $("#aud"); if (au) au.addEventListener("play", () => track("audio", p.id), { once: true });
  drawMap($("#map"), [{ poi: p }], {});
}

function renderMap() {
  header(t().map, D0.settings.roots_title || "Roots", true);
  view().innerHTML = `<div id="map" class="rt-map tall"></div>
  <div class="rt-legend small">${Object.entries(CAT_ICON).filter(([k]) => D0.pois.some(p => p.category === k)).map(([k, v]) => `<span>${v} ${esc(t().cat[k])}</span>`).join("")}</div>`;
  drawMap($("#map"), D0.pois.map(poi => ({ poi })), {});
}

async function renderNear() {
  header(t().near, "", true);
  view().innerHTML = `<p class="muted">${t().locating}</p>`;
  const pos = await locate();
  const origin = pos || hotelPos();
  const list = D0.pois.filter(p => p.category !== "start").map(p => ({ poi: p, d: km(origin, p) })).sort((a, b) => a.d - b.d);
  view().innerHTML = `
  ${pos ? "" : `<div class="alert info small">${esc(t().noLocation)}</div>`}
  <div id="map" class="rt-map"></div>
  <ul class="rt-near">${list.map(x => `<li><a href="#/poi/${x.poi.id}"><span class="ic">${CAT_ICON[x.poi.category] || "📍"}</span>
    <span class="tx"><b>${esc(L(x.poi, "name"))}</b><span class="small muted">${esc(L(x.poi, "short"))}</span></span>
    <span class="d"><b>${fmtDist(x.d)}</b><span class="small muted">${x.poi.access === "boat" ? t().accessIcon.boat : esc(travelText(x.d))}</span></span></a></li>`).join("")}</ul>`;
  drawMap($("#map"), list.slice(0, 8), { withHere: true });
}

// Πρόταση διαδρομής: επιλέγει σημεία από τις θεματικές που ενδιαφέρουν, με βάση τον χρόνο και τον τρόπο μετακίνησης,
// και τα βάζει σε σειρά από το πιο κοντινό (απλός «πλησιέστερος γείτονας»).
let planState = { routes: [], hours: 4, mode: "walk" };
function buildPlan(start) {
  const sel = planState.routes.length ? planState.routes : D0.routes.map(r => r.id);
  const wanted = new Set(D0.stops.filter(s => sel.includes(s.route_id)).map(s => s.poi_id));
  let pool = D0.pois.filter(p => wanted.has(p.id) && p.category !== "start" && p.access !== "boat" && (planState.mode === "car" || p.access === "walk"));
  const budget = planState.hours * 60;
  const out = []; let cur = start, used = 0;
  while (pool.length) {
    pool.sort((a, b) => km(cur, a) - km(cur, b));
    const p = pool[0], d = km(cur, p);
    const move = planState.mode === "walk" || d < 1.5 ? walkMin(d) : driveMin(d) + 10;   // +10′ στάθμευση
    if (planState.mode === "walk" && d > 4) break;
    const cost = move + (VISIT_MIN[p.category] || 30);
    if (used + cost > budget) { pool.shift(); continue; }
    out.push({ poi: p, move, d }); used += cost; cur = p; pool.shift();
  }
  return { out, used };
}
async function renderPlan(run) {
  header(t().planTitle, "", true);
  const chip = (on, attr, label) => `<button type="button" class="rt-chip${on ? " on" : ""}" ${attr}>${label}</button>`;
  view().innerHTML = `
  <h2 class="rt-h" style="margin-top:0">${t().interests}</h2>
  <div class="rt-chips">${D0.routes.map(r => chip(planState.routes.includes(r.id), `data-r="${r.id}" style="--rc:${esc(r.color)}"`, `${esc(r.icon || "")} ${esc(L(r, "title"))}`)).join("")}</div>
  <h2 class="rt-h">${t().time}</h2>
  <div class="rt-chips">${Object.entries(t().times).map(([h, l]) => chip(Number(h) === planState.hours, `data-h="${h}"`, esc(l))).join("")}</div>
  <h2 class="rt-h">${t().moving}</h2>
  <div class="rt-chips">${Object.entries(t().modes).map(([m, l]) => chip(m === planState.mode, `data-m="${m}"`, `${t().accessIcon[m]} ${esc(l)}`)).join("")}</div>
  <div class="rt-actions"><button class="btn primary" id="go">✨ ${t().suggest}</button></div>
  <div id="res"></div>`;
  $$("[data-r]").forEach(b => b.onclick = () => { const id = Number(b.dataset.r); planState.routes = planState.routes.includes(id) ? planState.routes.filter(x => x !== id) : [...planState.routes, id]; b.classList.toggle("on"); });
  $$("[data-h]").forEach(b => b.onclick = () => { planState.hours = Number(b.dataset.h); $$("[data-h]").forEach(x => x.classList.toggle("on", x === b)); });
  $$("[data-m]").forEach(b => b.onclick = () => { planState.mode = b.dataset.m; $$("[data-m]").forEach(x => x.classList.toggle("on", x === b)); });
  $("#go").onclick = async () => {
    $("#res").innerHTML = `<p class="muted">${t().locating}</p>`;
    const pos = await locate();
    const start = pos || hotelPos();
    const { out, used } = buildPlan(start);
    if (!out.length) { $("#res").innerHTML = `<div class="alert info">${esc(t().noPlan)}</div>`; return; }
    $("#res").innerHTML = `
      ${pos ? "" : `<div class="alert info small">${esc(t().noLocation)}</div>`}
      <p><b>${esc(t().total(used))}</b></p>
      <div id="map" class="rt-map"></div>
      <div class="rt-actions"><a class="btn primary" target="_blank" rel="noopener" href="${esc(gmapsDir([start, ...out.map(x => x.poi)], planState.mode))}">🧭 ${t().start}</a></div>
      <ol class="rt-stops">${out.map((x, n) => `<li style="--rc:#2a78d6"><div class="rt-leg small muted">${fmtDist(x.d)} · ~${x.move}′</div>
        <a class="rt-stop" href="#/poi/${x.poi.id}"><span class="num">${n + 1}</span><span class="tx"><b>${esc(L(x.poi, "name"))}</b>
        <span class="small">${esc(L(x.poi, "short"))}</span></span></a></li>`).join("")}</ol>`;
    drawMap($("#map"), out, { line: true, color: "#2a78d6", dashed: planState.mode !== "walk" });
    $("#res").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (run) $("#go").click();
}

// ---------------- Πλοήγηση ----------------
function go(path) { location.hash = "#" + path; }
function route() {
  stopSpeech();
  if (!D0) return;
  const h = location.hash.replace(/^#/, "") || "/";
  const [, a, b] = h.split("/");
  document.documentElement.lang = lang;
  $$(".rt-lang button").forEach(x => x.classList.toggle("on", x.dataset.lang === lang));
  if (a === "route") renderRoute(Number(b));
  else if (a === "poi") renderPoi(Number(b));
  else if (a === "map") renderMap();
  else if (a === "near") renderNear();
  else if (a === "plan") renderPlan();
  else renderHome();
  scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
$("#back").onclick = () => { if (history.length > 1) history.back(); else go("/"); };
$$(".rt-lang button").forEach(b => b.onclick = () => { lang = b.dataset.lang; try { localStorage.setItem(LANG_KEY, lang); } catch {} route(); });

function applyBrand(s) {
  const st = document.body.style;
  if (s.brand_color) { st.setProperty("--rt-ink", s.brand_color); st.setProperty("--primary", s.brand_color); }
  if (s.accent_color) st.setProperty("--accent", s.accent_color);
  const u = safeUrl(s.logo_url); if (u) { const l = $("#logo"); l.src = u; l.classList.remove("hidden"); }
  document.title = s.roots_title || "Roots";
}

(async () => {
  try {
    await loadData();
    applyBrand(D0.settings);
    track("roots");
    route();
  } catch (e) {
    console.error(e);
    view().innerHTML = `<div class="alert err">${lang === "el" ? "Πρόβλημα σύνδεσης. Δοκιμάστε ξανά." : "Connection problem. Please try again."}</div>`;
  }
})();

// Από το tablet του δωματίου: επιστροφή στην οθόνη δωματίου μετά από 3' αδράνειας (όπως το ίδιο το tablet).
if (FROM_ROOM && /\/tablet\.html/.test(document.referrer || "")) {
  let idle;
  const reset = () => { clearTimeout(idle); idle = setTimeout(() => { stopSpeech(); location.href = document.referrer; }, 180000); };
  ["pointerdown", "keydown", "scroll"].forEach(ev => document.addEventListener(ev, reset, { passive: true }));
  reset();
}
