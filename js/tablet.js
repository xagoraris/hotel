// Tablet δωματίου: πληροφορίες ξενοδοχείου και αιτήματα υπηρεσιών (transfer, yachting κ.λπ.).

const MOBILE = document.body.classList.contains("mobile");  // κινητό πελάτη μέσω QR δωματίου (room.html?r=…)
const QR = MOBILE ? (new URLSearchParams(location.search).get("r") || "").trim() : "";
const TOKEN_KEY = MOBILE ? "hotel_guest_token" : "hotel_tablet_token";
const QR_KEY = "hotel_guest_qr";
const LANG_KEY = "hotel_tablet_lang";
const TV = document.body.classList.contains("tv");   // έκδοση τηλεόρασης (tv.html): τηλεχειριστήριο αντί για αφή
const IDLE_MS = 120000;     // επιστροφή στην αρχική μετά από 2' αδράνειας
const REFRESH_MS = 60000;   // ανανέωση δεδομένων (π.χ. νέος πελάτης μετά από check-in)

const KINDS = {
  transfer:   { icon: "🚐", el: "Transfer", en: "Transfers" },
  yachting:   { icon: "⛵", el: "Yachting & κρουαζιέρες", en: "Yachting & cruises" },
  tour:       { icon: "🗺️", el: "Εκδρομές", en: "Tours" },
  spa:        { icon: "💆", el: "Spa & ευεξία", en: "Spa & wellness" },
  restaurant: { icon: "🍽️", el: "Εστιατόριο", en: "Restaurant" },
  other:      { icon: "✨", el: "Άλλες υπηρεσίες", en: "Other services" }
};

const TT = {
  el: {
    welcome: "Καλώς ήρθατε", welcomeName: n => `Καλώς ήρθατε, ${n}`, room: n => `Δωμάτιο ${n}`,
    wifi: "Wi‑Fi", network: "Δίκτυο", password: "Κωδικός", stay: "Η διαμονή σας", checkout: d => `Αναχώρηση: ${d}`,
    checkoutTime: t => `Check-out έως ${t}`, reception: "Ρεσεψιόν", info: "Πληροφορίες", services: "Υπηρεσίες",
    myRequests: "Τα αιτήματά μου", noRequests: "Δεν έχετε στείλει αιτήματα ακόμη.", tapToBook: "Πατήστε για κράτηση",
    onRequest: "Τιμή κατόπιν επικοινωνίας", perPerson: "/ άτομο", book: "Αίτημα κράτησης",
    date: "Ημερομηνία", time: "Ώρα", persons: "Άτομα", notes: "Σχόλια (προαιρετικό)", direction: "Διαδρομή",
    directions: { to_airport: "Προς αεροδρόμιο", from_airport: "Από αεροδρόμιο", to_port: "Προς λιμάνι", from_port: "Από λιμάνι", other: "Άλλη διαδρομή" },
    flight: "Αριθμός πτήσης / πλοίου", destination: "Προορισμός / σημείο παραλαβής", send: "Αποστολή αιτήματος", cancel: "Ακύρωση",
    sentTitle: "Το αίτημά σας στάλθηκε!", sentText: "Η ρεσεψιόν θα το επιβεβαιώσει σύντομα. Μπορείτε να δείτε την κατάσταση στα «Τα αιτήματά μου».",
    home: "Αρχική", status: { new: "Στάλθηκε", confirmed: "Επιβεβαιώθηκε", done: "Ολοκληρώθηκε", cancelled: "Ακυρώθηκε" },
    noGuest: "Οι κρατήσεις υπηρεσιών είναι διαθέσιμες μετά το check-in. Για οτιδήποτε, επικοινωνήστε με τη ρεσεψιόν.",
    confirmCancel: "Ακύρωση αυτού του αιτήματος;", estPrice: "Εκτιμώμενη τιμή",
    pairTitle: "Σύνδεση tablet", pairText: "Πληκτρολογήστε τον κωδικό σύνδεσης από την εφαρμογή διαχείρισης (Tablet → Συσκευές).", pair: "Σύνδεση",
    loginText: "Για την ασφάλειά σας, επιβεβαιώστε τη διαμονή σας με το επώνυμο της κράτησης (όπως στο διαβατήριο/ταυτότητα) ή τον κωδικό κράτησης.",
    surname: "Επώνυμο ή κωδικός κράτησης", enter: "Είσοδος", noQr: "Σκανάρετε το QR code που βρίσκεται στο δωμάτιό σας.",
    errors: { ERR_CODE: "Λάθος ή ληγμένος κωδικός.", ERR_LOGIN: "Τα στοιχεία δεν ταιριάζουν με τη διαμονή σε αυτό το δωμάτιο. Δοκιμάστε όπως είναι γραμμένο στην κράτηση ή ρωτήστε τη ρεσεψιόν.",
      ERR_LOCKED: "Πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγα λεπτά ή ρωτήστε τη ρεσεψιόν.", ERR_QR: "Μη έγκυρο QR code. Ρωτήστε τη ρεσεψιόν.", ERR_NO_GUEST: "Οι κρατήσεις υπηρεσιών είναι διαθέσιμες μετά το check-in.", ERR_SERVICE: "Η υπηρεσία δεν είναι διαθέσιμη.",
      ERR_PERSONS: "Μη έγκυρος αριθμός ατόμων.", ERR_DATE: "Μη έγκυρη ημερομηνία.", ERR_NOTES: "Τα σχόλια είναι πολύ μεγάλα.", ERR_DETAILS: "Μη έγκυρα στοιχεία.",
      ERR_TOO_MANY: "Έχετε ήδη πολλά αιτήματα σε αναμονή. Επικοινωνήστε με τη ρεσεψιόν.", ERR_CANNOT_CANCEL: "Το αίτημα δεν μπορεί πλέον να ακυρωθεί.",
      required: "Συμπληρώστε ημερομηνία και ώρα.", net: "Πρόβλημα σύνδεσης. Δοκιμάστε ξανά.", generic: "Κάτι πήγε στραβά. Δοκιμάστε ξανά." }
  },
  en: {
    welcome: "Welcome", welcomeName: n => `Welcome, ${n}`, room: n => `Room ${n}`,
    wifi: "Wi‑Fi", network: "Network", password: "Password", stay: "Your stay", checkout: d => `Departure: ${d}`,
    checkoutTime: t => `Check-out by ${t}`, reception: "Reception", info: "Information", services: "Services",
    myRequests: "My requests", noRequests: "You haven't sent any requests yet.", tapToBook: "Tap to book",
    onRequest: "Price on request", perPerson: "/ person", book: "Booking request",
    date: "Date", time: "Time", persons: "Guests", notes: "Comments (optional)", direction: "Route",
    directions: { to_airport: "To the airport", from_airport: "From the airport", to_port: "To the port", from_port: "From the port", other: "Other route" },
    flight: "Flight / ferry number", destination: "Destination / pick-up point", send: "Send request", cancel: "Cancel",
    sentTitle: "Your request has been sent!", sentText: "Our reception will confirm it shortly. You can check its status in “My requests”.",
    home: "Home", status: { new: "Sent", confirmed: "Confirmed", done: "Completed", cancelled: "Cancelled" },
    noGuest: "Service bookings are available after check-in. For anything you need, please contact the reception.",
    confirmCancel: "Cancel this request?", estPrice: "Estimated price",
    pairTitle: "Pair tablet", pairText: "Enter the pairing code from the management app (Tablet → Devices).", pair: "Pair",
    loginText: "For your security, please confirm your stay with the surname on the booking (as in your passport/ID) or your booking code.",
    surname: "Surname or booking code", enter: "Continue", noQr: "Please scan the QR code in your room.",
    errors: { ERR_CODE: "Wrong or expired code.", ERR_LOGIN: "These details don't match the current stay in this room. Try it exactly as on the booking or ask the reception.",
      ERR_LOCKED: "Too many attempts. Please try again in a few minutes or ask the reception.", ERR_QR: "Invalid QR code. Please ask the reception.", ERR_NO_GUEST: "Service bookings are available after check-in.", ERR_SERVICE: "This service is not available.",
      ERR_PERSONS: "Invalid number of guests.", ERR_DATE: "Invalid date.", ERR_NOTES: "Comments are too long.", ERR_DETAILS: "Invalid details.",
      ERR_TOO_MANY: "You already have many pending requests. Please contact the reception.", ERR_CANNOT_CANCEL: "This request can no longer be cancelled.",
      required: "Please choose a date and time.", net: "Connection problem. Please try again.", generic: "Something went wrong. Please try again." }
  }
};

let token = null;
try {
  token = localStorage.getItem(TOKEN_KEY);
  // Κινητό: άλλο QR (άλλο δωμάτιο/ξενοδοχείο) σημαίνει νέα επιβεβαίωση.
  if (MOBILE && QR && localStorage.getItem(QR_KEY) !== QR) { token = null; localStorage.removeItem(TOKEN_KEY); }
} catch {}
let lang = (() => {
  try { const v = localStorage.getItem(LANG_KEY); if (v) return v; } catch {}
  return MOBILE && /^el\b/i.test(navigator.language || "") ? "el" : "en";
})();
let data = null;
let view = { name: "home" };
const t = () => TT[lang];
const L = (o, base) => (lang === "en" && o[base + "_en"]) || o[base + "_el"] || "";
const must = ({ data, error }) => { if (error) throw error; return data; };

function errText(e) {
  const m = (e && e.message) || String(e || "");
  if (t().errors[m]) return t().errors[m];
  if (m.includes("Failed to fetch")) return t().errors.net;
  console.error(e);
  return t().errors.generic;
}
const safeUrl = u => (typeof u === "string" && /^https:\/\//i.test(u.trim())) ? u.trim() : null;
const bg = (el, url) => { const u = safeUrl(url); if (el && u) el.style.backgroundImage = `url(${JSON.stringify(u)})`; };
const fmtDate = s => D.fmt(s, lang, { weekday: "long", day: "numeric", month: "long" });
const eur = n => new Intl.NumberFormat(lang === "el" ? "el-GR" : "en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(Number(n || 0));
function priceLabel(s) {
  if (s.price_unit === "on_request" || s.price == null) return t().onRequest;
  return eur(s.price) + (s.price_unit === "per_person" ? " " + t().perPerson : "");
}

// ---------------- Φόρτωση & πλοήγηση ----------------
async function load() {
  if (!token) return renderPair();
  try {
    data = must(await sb.rpc("tablet_home", { p_token: token }));
  } catch (e) {
    if ((e.message || "") === "ERR_TABLET") {
      try { localStorage.removeItem(TOKEN_KEY); } catch {}
      token = null;
      return renderPair();
    }
    if (!data) { $("#view").innerHTML = `<div class="tb-big"><div class="ic">📶</div><p>${esc(errText(e))}</p></div>`; return; }
  }
  render();
}

function go(v) { view = v; render(); scrollTo(0, 0); }

function render() {
  document.documentElement.lang = lang;
  $$(".tb-lang button").forEach(b => b.classList.toggle("on", b.dataset.lang === lang));
  if (!token || !data) return;
  $("#hotel").textContent = data.hotel.name || "";
  $("#room").textContent = t().room(data.room);
  document.title = data.hotel.name || "Welcome";
  $("#back").classList.toggle("hidden", view.name === "home");
  const views = { home: renderHome, section: renderSection, category: renderCategory, service: renderService, sent: renderSent, requests: renderRequests };
  (views[view.name] || renderHome)();
}

// Πίσω: κουμπί στην μπάρα, ή Return/Back του τηλεχειριστηρίου (tv.js). Επιστρέφει false αν είμαστε ήδη στην αρχική.
function goBack() {
  if (!token || !data || view.name === "home") return false;
  if (view.name === "service") go(view.from || { name: "home" });
  else go({ name: "home" });
  return true;
}
window.tvBack = goBack;
$("#back").onclick = goBack;
$$(".tb-lang button").forEach(b => b.onclick = () => {
  lang = b.dataset.lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch {}
  if (!token) renderPair(); else render();
});

// ---------------- Κινητό: επιβεβαίωση διαμονής ----------------
let roomInfo = null;
async function renderLogin() {
  $("#back").classList.add("hidden");
  if (!QR) { $("#view").innerHTML = `<div class="tb-card tb-big"><div class="ic">📷</div><p>${esc(t().noQr)}</p></div>`; return; }
  if (!roomInfo) {
    try { roomInfo = must(await sb.rpc("guest_room_info", { p_qr: QR })); }
    catch (e) { $("#view").innerHTML = `<div class="tb-card tb-big"><div class="ic">⚠️</div><p>${esc(errText(e))}</p></div>`; return; }
  }
  $("#hotel").textContent = roomInfo.hotel || "";
  $("#room").textContent = t().room(roomInfo.room);
  document.title = roomInfo.hotel || "Welcome";
  $("#view").innerHTML = `
  <section class="tb-hero" id="hero"><div class="in"><h1>${esc(t().welcome)}</h1><p>${esc(t().room(roomInfo.room))}</p></div></section>
  <form class="tb-card tb-login" id="lf">
    <p class="muted">${esc(t().loginText)}</p>
    <div class="field"><label>${esc(t().surname)}</label><input name="secret" autocomplete="family-name" autocapitalize="words" required></div>
    <button class="btn primary" style="width:100%">${esc(t().enter)}</button>
  </form>`;
  bg($("#hero"), roomInfo.cover_image_url);
  $("#lf").onsubmit = async ev => {
    ev.preventDefault();
    await busy($("button", ev.target), async () => {
      const showErr = msg => { const o = $(".alert", ev.target); if (o) o.remove(); $("button", ev.target).insertAdjacentHTML("beforebegin", `<div class="alert err">${esc(msg)}</div>`); };
      try {
        const tk = must(await sb.rpc("guest_login", { p_qr: QR, p_secret: formData(ev.target).secret }));
        if (!tk) return showErr(t().errors.ERR_LOGIN);
        token = tk;
        try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(QR_KEY, QR); } catch {}
        view = { name: "home" };
        await load();
      } catch (e) { showErr(errText(e)); }
    });
  };
}

// ---------------- Σύνδεση συσκευής ----------------
function renderPair() {
  if (MOBILE) return renderLogin();
  $("#hotel").textContent = "";
  $("#room").textContent = "";
  $("#back").classList.add("hidden");
  $("#view").innerHTML = `
  <form class="tb-card tb-pair" id="pf">
    <div style="font-size:3rem">📲</div>
    <h2>${t().pairTitle}</h2>
    <p class="muted">${esc(t().pairText)}</p>
    <div class="field"><input name="code" maxlength="12" autocomplete="off" autocapitalize="characters" required></div>
    <button class="btn primary" style="width:100%">${t().pair}</button>
  </form>`;
  $("#pf").onsubmit = async ev => {
    ev.preventDefault();
    await busy($("button", ev.target), async () => {
      try {
        token = must(await sb.rpc("tablet_pair", { p_code: formData(ev.target).code }));
        try { localStorage.setItem(TOKEN_KEY, token); } catch {}
        view = { name: "home" };
        await load();
      } catch (e) {
        const old = $(".alert", ev.target); if (old) old.remove();
        $("button", ev.target).insertAdjacentHTML("beforebegin", `<div class="alert err">${esc(errText(e))}</div>`);
      }
    });
  };
}

// ---------------- Αρχική ----------------
function renderHome() {
  const h = data.hotel, g = data.guest;
  const kinds = Object.keys(KINDS).filter(k => data.services.some(s => s.kind === k));
  const welcome = lang === "en" ? (h.welcome_en || h.welcome_el) : (h.welcome_el || h.welcome_en);
  $("#view").innerHTML = `
  <section class="tb-hero" id="hero"><div class="in">
    <h1>${esc(g ? t().welcomeName(g.first_name) : t().welcome)}</h1>
    ${welcome ? `<p>${esc(welcome)}</p>` : ""}
  </div></section>
  <div class="tb-row">
    ${h.wifi_name ? `<div class="tb-card"><h2>📶 ${t().wifi}</h2><dl class="tb-wifi"><dt>${t().network}</dt><dd>${esc(h.wifi_name)}</dd>${h.wifi_password ? `<dt>${t().password}</dt><dd>${esc(h.wifi_password)}</dd>` : ""}</dl></div>` : ""}
    <div class="tb-card"><h2>🛎️ ${t().stay}</h2>
      ${g ? `<p style="margin:.2rem 0">${esc(t().checkout(fmtDate(g.check_out)))}</p>` : ""}
      <p style="margin:.2rem 0" class="muted">${esc(t().checkoutTime(h.check_out_time || "11:00"))}</p>
      ${h.phone ? `<p style="margin:.2rem 0">${t().reception}: <b>${esc(h.phone)}</b></p>` : ""}
    </div>
  </div>
  ${kinds.length ? `<h2 class="tb-h">${t().services}</h2>
  <div class="tb-tiles">
    ${kinds.map(k => `<button class="tb-tile feature" data-kind="${k}"><span class="ic">${KINDS[k].icon}</span><span><b>${esc(KINDS[k][lang])}</b><br><small>${t().tapToBook}</small></span></button>`).join("")}
    ${g ? `<button class="tb-tile" data-requests><span class="ic">📋</span><span><b>${t().myRequests}</b><br><small>${data.requests.filter(r => r.status !== "cancelled").length || ""}</small></span></button>` : ""}
  </div>` : ""}
  ${data.sections.length ? `<h2 class="tb-h">${t().info}</h2>
  <div class="tb-tiles">${data.sections.map(s => `<button class="tb-tile" data-section="${s.id}"><span class="ic">${esc(s.icon || "ℹ️")}</span><b>${esc(L(s, "title"))}</b></button>`).join("")}</div>` : ""}`;
  bg($("#hero"), h.cover_image_url);
  $$("[data-kind]").forEach(b => b.onclick = () => go({ name: "category", kind: b.dataset.kind }));
  $$("[data-section]").forEach(b => b.onclick = () => go({ name: "section", id: Number(b.dataset.section) }));
  const r = $("[data-requests]"); if (r) r.onclick = () => go({ name: "requests" });
}

function renderSection() {
  const s = data.sections.find(x => x.id === view.id);
  if (!s) return go({ name: "home" });
  $("#view").innerHTML = `<div class="tb-page"><h1>${esc(s.icon || "")} ${esc(L(s, "title"))}</h1>
    <div class="tb-card tb-body">${esc(L(s, "body"))}</div></div>`;
}

function renderCategory() {
  const list = data.services.filter(s => s.kind === view.kind);
  const k = KINDS[view.kind];
  $("#view").innerHTML = `<div class="tb-page"><h1>${k.icon} ${esc(k[lang])}</h1>
    ${data.guest ? "" : `<div class="tb-note">${esc(t().noGuest)}</div>`}
    <div class="tb-svc">${list.map(s => `
      <div class="tb-card" data-svc="${s.id}" tabindex="0" role="button">
        <div class="img" data-img="${s.id}">${safeUrl(s.image_url) ? "" : k.icon}</div>
        <div class="info"><h2 style="margin:0">${esc(L(s, "name"))}</h2><p>${esc(L(s, "description"))}</p></div>
        <div class="tb-price">${esc(priceLabel(s))}</div>
      </div>`).join("")}</div></div>`;
  list.forEach(s => bg($(`[data-img="${s.id}"]`), s.image_url));
  $$("[data-svc]").forEach(c => {
    c.onclick = () => go({ name: "service", id: Number(c.dataset.svc), from: { name: "category", kind: view.kind } });
    c.onkeydown = ev => { if (ev.key === "Enter") { ev.preventDefault(); c.click(); } };
  });
}

// ---------------- Φόρμα αιτήματος ----------------
function renderService() {
  const s = data.services.find(x => x.id === view.id);
  if (!s) return go({ name: "home" });
  const isTransfer = s.kind === "transfer";
  const timeRequired = s.kind !== "yachting";
  const tomorrow = D.add(D.today(), 1);
  const maxP = s.max_persons || 20;
  $("#view").innerHTML = `<div class="tb-page">
    <div class="tb-card" style="margin-bottom:1rem;display:flex;gap:1.2rem;align-items:center">
      <div class="tb-svc" style="flex:none"><div class="img" id="simg">${safeUrl(s.image_url) ? "" : KINDS[s.kind].icon}</div></div>
      <div style="flex:1"><h1 style="margin:0">${esc(L(s, "name"))}</h1><p class="muted" style="margin:.3rem 0 0">${esc(L(s, "description"))}</p></div>
      <div class="tb-price">${esc(priceLabel(s))}</div>
    </div>
    ${data.guest ? `
    <form class="tb-card tb-form" id="rf" novalidate>
      <h2>${t().book}</h2>
      <div class="grid">
        ${isTransfer ? `<div class="field"><label>${t().direction}</label><select name="direction">${Object.entries(t().directions).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></div>` : ""}
        <div class="field"><label>${t().date}</label>${TV
          ? `<select name="date">${Array.from({ length: 30 }, (_, i) => D.add(D.today(), i)).map(d => `<option value="${d}"${d === tomorrow ? " selected" : ""}>${esc(fmtDate(d))}</option>`).join("")}</select>`
          : `<input type="date" name="date" min="${D.today()}" value="${tomorrow}" required>`}</div>
        <div class="field"><label>${t().time}${timeRequired ? "" : lang === "el" ? " (προαιρετικό)" : " (optional)"}</label>${TV
          ? `<select name="time"><option value="">—</option>${Array.from({ length: 72 }, (_, i) => { const m = 360 + i * 15; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }).map(x => `<option>${x}</option>`).join("")}</select>`
          : `<input type="time" name="time" ${timeRequired ? "required" : ""}>`}</div>
        <div class="field"><label>${t().persons}</label><select name="persons">${Array.from({ length: maxP }, (_, i) => `<option${i === 1 ? " selected" : ""}>${i + 1}</option>`).join("")}</select></div>
        ${isTransfer ? `<div class="field"><label>${t().flight}</label><input name="flight" maxlength="40"></div>
          <div class="field"><label>${t().destination}</label><input name="destination" maxlength="120"></div>` : ""}
      </div>
      <div class="field"><label>${t().notes}</label><textarea name="notes" maxlength="1000"></textarea></div>
      ${s.price_unit !== "on_request" && s.price != null ? `<p>${t().estPrice}: <b id="est"></b></p>` : ""}
      <button class="btn primary" style="width:100%">${t().send}</button>
    </form>` : `<div class="tb-note">${esc(t().noGuest)}</div>`}
  </div>`;
  bg($("#simg"), s.image_url);
  const form = $("#rf");
  if (!form) return;
  const est = () => { const e = $("#est"); if (e) e.textContent = eur(s.price_unit === "per_person" ? s.price * Number(form.elements.persons.value) : s.price); };
  est();
  form.elements.persons.onchange = est;
  form.onsubmit = async ev => {
    ev.preventDefault();
    const f = formData(form);
    const showErr = msg => { const o = $(".alert", form); if (o) o.remove(); form.insertAdjacentHTML("afterbegin", `<div class="alert err">${esc(msg)}</div>`); };
    if (!f.date || (timeRequired && !f.time)) return showErr(t().errors.required);
    const details = {};
    if (isTransfer) { details.direction = f.direction; if (f.flight) details.flight = f.flight; if (f.destination) details.destination = f.destination; }
    await busy($("button.primary", form), async () => {
      try {
        must(await sb.rpc("tablet_request", {
          p_token: token, p_service: s.id, p_date: f.date, p_time: f.time || null,
          p_persons: Number(f.persons), p_details: details, p_notes: f.notes || null
        }));
        view = { name: "sent" };
        await load();
      } catch (e) { showErr(errText(e)); }
    });
  };
}

function renderSent() {
  $("#view").innerHTML = `<div class="tb-card tb-big"><div class="ic">✅</div><h1>${t().sentTitle}</h1><p class="muted">${esc(t().sentText)}</p>
    <div class="row" style="justify-content:center;margin-top:1.4rem"><button class="btn" id="toReq">${t().myRequests}</button><button class="btn primary" id="toHome">${t().home}</button></div></div>`;
  $("#toReq").onclick = () => go({ name: "requests" });
  $("#toHome").onclick = () => go({ name: "home" });
}

function renderRequests() {
  const cls = { new: "pending", confirmed: "confirmed", done: "checked_in", cancelled: "cancelled" };
  $("#view").innerHTML = `<div class="tb-page"><h1>📋 ${t().myRequests}</h1>
    <div class="tb-card">${!data.requests.length ? `<p class="muted">${t().noRequests}</p>` : data.requests.map(r => `
      <div class="tb-req">
        <div class="info"><b>${esc(lang === "en" ? (r.name_en || r.name_el) : r.name_el)}</b>
          <div class="muted small">${r.request_date ? esc(fmtDate(r.request_date)) : ""}${r.request_time ? ` · ${esc(r.request_time.slice(0, 5))}` : ""} · ${r.persons} ${esc(t().persons.toLowerCase())}${r.price != null ? ` · ${eur(r.price)}` : ""}</div></div>
        <span class="badge b-${cls[r.status]}">${esc(t().status[r.status])}</span>
        ${r.status === "new" ? `<button class="btn sm danger" data-cancel="${r.id}">${t().cancel}</button>` : ""}
      </div>`).join("")}</div></div>`;
  $$("[data-cancel]").forEach(b => b.onclick = () => {
    if (!confirm(t().confirmCancel)) return;
    busy(b, async () => {
      try { must(await sb.rpc("tablet_cancel", { p_token: token, p_request: Number(b.dataset.cancel) })); await load(); }
      catch (e) { toast(errText(e), "err"); }
    });
  });
}

// ---------------- Ρολόι, αδράνεια, ανανέωση ----------------
function tick() {
  $("#clock").textContent = new Date().toLocaleTimeString(lang === "el" ? "el-GR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
}
tick();
setInterval(tick, 10000);

let idleTimer;
function resetIdle() {
  if (MOBILE) return;   // στο κινητό του πελάτη δεν γυρνάμε αυτόματα στην αρχική
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    const d = $("dialog"); if (d) d.close();
    if (token && view.name !== "home") go({ name: "home" });
  }, IDLE_MS);
}
["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));
resetIdle();

setInterval(() => { if (token && ["home", "requests", "sent"].includes(view.name)) load(); }, REFRESH_MS);
document.addEventListener("visibilitychange", () => { if (!document.hidden && token) load(); });

load();
