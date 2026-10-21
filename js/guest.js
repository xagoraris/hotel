// Πύλη πελατών: αίτημα κράτησης, προβολή κράτησης, online check-in. Ελληνικά & αγγλικά.

const T = {
  el: {
    tabBook: "Κράτηση", tabMine: "Η κράτησή μου",
    checkIn: "Άφιξη", checkOut: "Αναχώρηση", adults: "Ενήλικες", children: "Παιδιά", search: "Αναζήτηση διαθεσιμότητας",
    nights: n => `${n} ${n === 1 ? "νύχτα" : "νύχτες"}`, upTo: n => `έως ${n} άτομα`, left: n => n <= 2 ? `Απομένουν ${n}` : "Διαθέσιμο",
    total: "σύνολο", select: "Επιλογή", noRooms: "Δεν υπάρχει διαθεσιμότητα για αυτές τις ημερομηνίες και τόσα άτομα. Δοκίμασε άλλες ημερομηνίες.",
    yourDetails: "Τα στοιχεία σου", firstName: "Όνομα", lastName: "Επώνυμο", email: "Email", phone: "Τηλέφωνο (με κωδικό χώρας)",
    notes: "Μήνυμα / ειδικά αιτήματα (προαιρετικό)", send: "Αποστολή αιτήματος κράτησης", back: "Πίσω",
    sentTitle: "Λάβαμε το αίτημά σου!", sentText: "Θα επικοινωνήσουμε σύντομα για να επιβεβαιώσουμε την κράτηση. Κράτησε τον κωδικό σου:",
    sentHint: "Με τον κωδικό και το email σου μπορείς να δεις την κράτηση και να κάνεις online check-in από την καρτέλα «Η κράτησή μου».",
    goMine: "Η κράτησή μου", code: "Κωδικός κράτησης", find: "Εμφάνιση κράτησης", notFound: "Δεν βρέθηκε κράτηση με αυτόν τον κωδικό και email.",
    status: { pending: "Αναμένει επιβεβαίωση", confirmed: "Επιβεβαιωμένη", checked_in: "Είστε στο ξενοδοχείο", checked_out: "Ολοκληρώθηκε", cancelled: "Ακυρώθηκε", no_show: "Ακυρώθηκε" },
    guest: "Επισκέπτης", room: "Δωμάτιο", stay: "Διαμονή", persons: "Άτομα", price: "Τιμή", paid: "Πληρωμένα", arrivalFrom: t => `Check-in από ${t}`, departureBy: t => `Check-out έως ${t}`,
    pcTitle: "Online check-in", pcText: "Συμπλήρωσε τα στοιχεία σου πριν φτάσεις για γρηγορότερη υποδοχή.",
    pcDone: "✓ Το online check-in ολοκληρώθηκε. Τα λέμε σύντομα!", birth: "Ημερομηνία γέννησης", nationality: "Υπηκοότητα",
    idType: "Έγγραφο", idTypes: { id_card: "Ταυτότητα", passport: "Διαβατήριο", other: "Άλλο" }, idNumber: "Αριθμός εγγράφου",
    address: "Διεύθυνση", city: "Πόλη", country: "Χώρα", submitPc: "Ολοκλήρωση check-in", closed: "Οι online κρατήσεις δεν είναι διαθέσιμες αυτή τη στιγμή. Επικοινώνησε μαζί μας.",
    contact: "Επικοινωνία", privacy: "Τα στοιχεία χρησιμοποιούνται μόνο για την κράτησή σου και την υποχρεωτική καταγραφή επισκεπτών.",
    errors: {
      ERR_DATES: "Μη έγκυρες ημερομηνίες.", ERR_MAX_NIGHTS: "Η μέγιστη διάρκεια είναι 60 νύχτες.", ERR_CLOSED: "Οι online κρατήσεις είναι κλειστές.",
      ERR_NAME: "Συμπλήρωσε όνομα και επώνυμο.", ERR_EMAIL: "Μη έγκυρο email.", ERR_PHONE: "Μη έγκυρο τηλέφωνο.", ERR_NOTES: "Το μήνυμα είναι πολύ μεγάλο.",
      ERR_PERSONS: "Μη έγκυρος αριθμός ατόμων.", ERR_TYPE: "Το δωμάτιο δεν βρέθηκε.", ERR_SOLD_OUT: "Μόλις κλείστηκε το τελευταίο διαθέσιμο. Δοκίμασε άλλο δωμάτιο ή ημερομηνίες.",
      ERR_CAPACITY: "Το δωμάτιο δεν χωράει τόσα άτομα.", ERR_NOT_FOUND: "Δεν βρέθηκε η κράτηση.", ERR_PRECHECKIN_CLOSED: "Το online check-in δεν είναι πλέον διαθέσιμο.",
      ERR_ID_TYPE: "Διάλεξε έγγραφο.", ERR_ID_NUMBER: "Μη έγκυρος αριθμός εγγράφου.", ERR_BIRTH: "Μη έγκυρη ημερομηνία γέννησης.",
      net: "Πρόβλημα σύνδεσης. Δοκίμασε ξανά.", generic: "Κάτι πήγε στραβά. Δοκίμασε ξανά."
    }
  },
  en: {
    tabBook: "Book", tabMine: "My booking",
    checkIn: "Check-in", checkOut: "Check-out", adults: "Adults", children: "Children", search: "Check availability",
    nights: n => `${n} ${n === 1 ? "night" : "nights"}`, upTo: n => `up to ${n} guests`, left: n => n <= 2 ? `Only ${n} left` : "Available",
    total: "total", select: "Select", noRooms: "No availability for these dates and number of guests. Please try other dates.",
    yourDetails: "Your details", firstName: "First name", lastName: "Last name", email: "Email", phone: "Phone (with country code)",
    notes: "Message / special requests (optional)", send: "Send booking request", back: "Back",
    sentTitle: "We received your request!", sentText: "We will contact you shortly to confirm your booking. Keep your booking code:",
    sentHint: "With your code and email you can view your booking and complete online check-in in “My booking”.",
    goMine: "My booking", code: "Booking code", find: "Show booking", notFound: "No booking found with this code and email.",
    status: { pending: "Awaiting confirmation", confirmed: "Confirmed", checked_in: "Checked in", checked_out: "Completed", cancelled: "Cancelled", no_show: "Cancelled" },
    guest: "Guest", room: "Room", stay: "Stay", persons: "Guests", price: "Price", paid: "Paid", arrivalFrom: t => `Check-in from ${t}`, departureBy: t => `Check-out by ${t}`,
    pcTitle: "Online check-in", pcText: "Fill in your details before you arrive for a faster welcome.",
    pcDone: "✓ Online check-in completed. See you soon!", birth: "Date of birth", nationality: "Nationality",
    idType: "Document", idTypes: { id_card: "ID card", passport: "Passport", other: "Other" }, idNumber: "Document number",
    address: "Address", city: "City", country: "Country", submitPc: "Complete check-in", closed: "Online booking is not available at the moment. Please contact us.",
    contact: "Contact", privacy: "Your details are used only for your booking and the mandatory guest registration.",
    errors: {
      ERR_DATES: "Invalid dates.", ERR_MAX_NIGHTS: "Maximum stay is 60 nights.", ERR_CLOSED: "Online booking is closed.",
      ERR_NAME: "Please enter your first and last name.", ERR_EMAIL: "Invalid email.", ERR_PHONE: "Invalid phone number.", ERR_NOTES: "Message is too long.",
      ERR_PERSONS: "Invalid number of guests.", ERR_TYPE: "Room not found.", ERR_SOLD_OUT: "The last available room was just booked. Please try another room or dates.",
      ERR_CAPACITY: "This room does not fit that many guests.", ERR_NOT_FOUND: "Booking not found.", ERR_PRECHECKIN_CLOSED: "Online check-in is no longer available.",
      ERR_ID_TYPE: "Please choose a document.", ERR_ID_NUMBER: "Invalid document number.", ERR_BIRTH: "Invalid date of birth.",
      net: "Connection problem. Please try again.", generic: "Something went wrong. Please try again."
    }
  }
};

let lang = (() => {
  try { const s = localStorage.getItem("hotel_lang"); if (s) return s; } catch {}
  return (navigator.language || "en").toLowerCase().startsWith("el") ? "el" : "en";
})();
const t = () => T[lang];
let tab = "book";
let settings = {};
const st = { search: { ci: D.add(D.today(), 1), co: D.add(D.today(), 3), adults: 2, children: 0 }, offers: null, chosen: null, mine: null, mineAuth: null };

function gErr(e) {
  const m = (e && e.message) || "";
  if (t().errors[m]) return t().errors[m];
  if (m.includes("Failed to fetch")) return t().errors.net;
  console.error(e);
  return t().errors.generic;
}
const must = ({ data, error }) => { if (error) throw error; return data; };
const showErr = (where, e) => {
  const old = $(".alert.err", where); if (old) old.remove();
  where.insertAdjacentHTML("afterbegin", `<div class="alert err">${esc(typeof e === "string" ? e : gErr(e))}</div>`);
};

async function init() {
  try { settings = must(await sb.from("settings").select("*").eq("id", 1).single()); } catch (e) { settings = {}; }
  const params = new URLSearchParams(location.search);
  if (params.get("code")) { tab = "mine"; st.prefillCode = params.get("code"); }
  render();
}

function render() {
  document.documentElement.lang = lang;
  $("#hotelName").textContent = settings.hotel_name || "";
  $("#hotelLine").textContent = [settings.address, settings.phone].filter(Boolean).join(" · ") || " ";
  document.title = `${settings.hotel_name || ""} · ${t().tabBook}`;
  $$("[data-lang]").forEach(b => { b.classList.toggle("on", b.dataset.lang === lang); b.onclick = () => { lang = b.dataset.lang; try { localStorage.setItem("hotel_lang", lang); } catch {} render(); }; });
  $$("[data-tab]").forEach(b => { b.textContent = b.dataset.tab === "book" ? t().tabBook : t().tabMine; b.classList.toggle("on", b.dataset.tab === tab); b.onclick = () => { tab = b.dataset.tab; render(); }; });
  if (tab === "book") renderBook(); else renderMine();
}

const fmtD = s => D.fmt(s, lang, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const eur = n => new Intl.NumberFormat(lang === "el" ? "el-GR" : "en-GB", { style: "currency", currency: "EUR" }).format(Number(n || 0));

// ---------------- Κράτηση ----------------
function renderBook() {
  const v = $("#view");
  if (settings.online_booking === false) {
    v.innerHTML = `<div class="card"><p>${esc(t().closed)}</p>${contactHtml()}</div>`;
    return;
  }
  if (st.done) return renderDone();
  if (st.chosen) return renderDetails();
  const s = st.search;
  v.innerHTML = `
  <form class="card" id="sf">
    <div class="grid">
      <div class="field"><label>${t().checkIn}</label><input type="date" name="ci" value="${s.ci}" min="${D.today()}" required></div>
      <div class="field"><label>${t().checkOut}</label><input type="date" name="co" value="${s.co}" min="${D.add(D.today(), 1)}" required></div>
      <div class="field"><label>${t().adults}</label><input type="number" name="adults" min="1" max="20" value="${s.adults}"></div>
      <div class="field"><label>${t().children}</label><input type="number" name="children" min="0" max="20" value="${s.children}"></div>
    </div>
    <button class="btn primary" style="width:100%">${t().search}</button>
  </form>
  <div id="offers"></div>`;
  const form = $("#sf");
  form.elements.ci.onchange = () => { if (form.elements.co.value <= form.elements.ci.value) form.elements.co.value = D.add(form.elements.ci.value, 1); };
  form.onsubmit = async ev => {
    ev.preventDefault();
    const f = formData(form);
    st.search = { ci: f.ci, co: f.co, adults: Math.max(1, Number(f.adults || 1)), children: Math.max(0, Number(f.children || 0)) };
    await busy($("button", form), async () => {
      try {
        if (!f.ci || !f.co || f.co <= f.ci) throw new Error("ERR_DATES");
        st.offers = must(await sb.rpc("availability", { p_in: f.ci, p_out: f.co }));
        drawOffers();
      } catch (e) { $("#offers").innerHTML = ""; showErr(form, e); }
    });
  };
  if (st.offers) drawOffers();
}

function drawOffers() {
  const s = st.search, persons = s.adults + s.children;
  const list = st.offers.filter(o => o.available > 0 && o.capacity >= persons);
  const n = D.diff(s.ci, s.co);
  $("#offers").innerHTML = !list.length ? `<div class="card"><p>${esc(t().noRooms)}</p></div>` :
    list.map(o => `<div class="card offer">
      <div class="info"><h2>${esc(o.name)}</h2><p class="muted" style="margin:.2rem 0">${esc(o.description || "")}</p>
        <span class="small muted">${esc(t().upTo(o.capacity))} · <b>${esc(t().left(o.available))}</b></span></div>
      <div class="price"><b>${eur(o.total)}</b><span class="small muted">${esc(t().nights(n))} · ${t().total}</span><br>
        <button class="btn primary" data-pick="${o.room_type_id}" style="margin-top:.4rem">${t().select}</button></div>
    </div>`).join("");
  $$("[data-pick]").forEach(b => b.onclick = () => { st.chosen = list.find(o => o.room_type_id === Number(b.dataset.pick)); render(); scrollTo(0, 0); });
}

function renderDetails() {
  const o = st.chosen, s = st.search;
  $("#view").innerHTML = `
  <div class="card"><div class="row"><div><h2 style="margin:0">${esc(o.name)}</h2>
    <span class="muted">${fmtD(s.ci)} → ${fmtD(s.co)} · ${esc(t().nights(o.nights))} · ${s.adults + s.children} ${esc(t().persons.toLowerCase())}</span></div>
    <span class="spacer"></span><b style="font-size:1.2rem">${eur(o.total)}</b></div></div>
  <form class="card" id="df">
    <h2>${t().yourDetails}</h2>
    <div class="grid">
      <div class="field"><label>${t().firstName} *</label><input name="first" required autocomplete="given-name" maxlength="80"></div>
      <div class="field"><label>${t().lastName} *</label><input name="last" required autocomplete="family-name" maxlength="80"></div>
      <div class="field"><label>${t().email} *</label><input name="email" type="email" required autocomplete="email" maxlength="200"></div>
      <div class="field"><label>${t().phone} *</label><input name="phone" type="tel" required autocomplete="tel" maxlength="40"></div>
    </div>
    <div class="field"><label>${t().notes}</label><textarea name="notes" maxlength="1000"></textarea></div>
    <p class="small muted">${esc(t().privacy)}</p>
    <div class="row"><button type="button" class="btn" id="back">${t().back}</button><span class="spacer"></span><button class="btn primary">${t().send}</button></div>
  </form>`;
  $("#back").onclick = () => { st.chosen = null; render(); };
  $("#df").onsubmit = async ev => {
    ev.preventDefault();
    const f = formData(ev.target);
    await busy($("button.primary", ev.target), async () => {
      try {
        const code = must(await sb.rpc("request_booking", {
          p_room_type: o.room_type_id, p_in: s.ci, p_out: s.co, p_adults: s.adults, p_children: s.children,
          p_first_name: f.first, p_last_name: f.last, p_email: f.email, p_phone: f.phone, p_notes: f.notes || null
        }));
        st.done = { code, email: f.email };
        st.chosen = null; st.offers = null;
        render(); scrollTo(0, 0);
      } catch (e) { showErr(ev.target, e); }
    });
  };
}

function renderDone() {
  $("#view").innerHTML = `<div class="card" style="text-align:center">
    <h2>${t().sentTitle}</h2><p>${esc(t().sentText)}</p>
    <div class="code-box mono">${esc(st.done.code)}</div>
    <p class="small muted">${esc(t().sentHint)}</p>
    <button class="btn primary" id="goMine">${t().goMine}</button></div>`;
  $("#goMine").onclick = () => { st.mineAuth = { ...st.done }; st.done = null; tab = "mine"; loadMine(); };
}

// ---------------- Η κράτησή μου ----------------
function contactHtml() {
  const c = [settings.phone && `<a href="tel:${esc(settings.phone.replace(/\s/g, ""))}">${esc(settings.phone)}</a>`,
             settings.email && `<a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a>`].filter(Boolean);
  return c.length ? `<p class="small">${t().contact}: ${c.join(" · ")}</p>` : "";
}

async function loadMine() {
  try {
    st.mine = must(await sb.rpc("find_booking", { p_code: st.mineAuth.code, p_email: st.mineAuth.email }));
  } catch (e) { st.mine = null; st.mineErr = gErr(e); }
  if (!st.mine && !st.mineErr) st.mineErr = t().notFound;
  render();
}

function renderMine() {
  const v = $("#view");
  if (!st.mine) {
    v.innerHTML = `<form class="card" id="mf">
      ${st.mineErr ? `<div class="alert err">${esc(st.mineErr)}</div>` : ""}
      <div class="grid">
        <div class="field"><label>${t().code}</label><input name="code" class="mono" required value="${esc(st.prefillCode || (st.mineAuth && st.mineAuth.code) || "")}" autocapitalize="characters" maxlength="12"></div>
        <div class="field"><label>${t().email}</label><input name="email" type="email" required value="${esc(st.mineAuth && st.mineAuth.email || "")}"></div>
      </div>
      <button class="btn primary" style="width:100%">${t().find}</button></form>`;
    $("#mf").onsubmit = async ev => {
      ev.preventDefault();
      const f = formData(ev.target);
      st.mineAuth = { code: f.code, email: f.email }; st.mineErr = null;
      await busy($("button", ev.target), loadMine);
    };
    return;
  }
  const b = st.mine;
  const statusCls = { pending: "pending", confirmed: "confirmed", checked_in: "checked_in", checked_out: "checked_out", cancelled: "cancelled", no_show: "cancelled" }[b.status];
  const canPc = ["pending", "confirmed"].includes(b.status);
  v.innerHTML = `
  <div class="card">
    <div class="row"><h2 style="margin:0" class="mono">${esc(b.code)}</h2><span class="spacer"></span><span class="badge b-${statusCls}">${esc(t().status[b.status])}</span></div>
    <dl class="kv" style="margin-top:.8rem">
      <dt>${t().guest}</dt><dd>${esc(b.first_name)} ${esc(b.last_name)}</dd>
      <dt>${t().room}</dt><dd>${esc(b.room_type)}</dd>
      <dt>${t().stay}</dt><dd>${fmtD(b.check_in)} → ${fmtD(b.check_out)} <span class="muted">(${esc(t().nights(D.diff(b.check_in, b.check_out)))})</span></dd>
      <dt>${t().persons}</dt><dd>${b.adults}${b.children ? ` + ${b.children}` : ""}</dd>
      <dt>${t().price}</dt><dd>${eur(b.total_price)}${Number(b.paid) > 0 ? ` <span class="muted">(${t().paid}: ${eur(b.paid)})</span>` : ""}</dd>
    </dl>
    <p class="small muted" style="margin-top:.8rem">${esc(t().arrivalFrom(settings.check_in_time || "14:00"))} · ${esc(t().departureBy(settings.check_out_time || "11:00"))}</p>
    ${contactHtml()}
  </div>
  ${canPc ? (b.precheckin_done ? `<div class="card"><div class="alert ok" style="margin:0">${esc(t().pcDone)}</div></div>` : `
  <form class="card" id="pc">
    <h2>${t().pcTitle}</h2><p class="muted">${esc(t().pcText)}</p>
    <div class="grid">
      <div class="field"><label>${t().idType} *</label><select name="id_type" required><option value=""></option>${Object.entries(t().idTypes).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select></div>
      <div class="field"><label>${t().idNumber} *</label><input name="id_number" required maxlength="40"></div>
      <div class="field"><label>${t().birth} *</label><input name="birth" type="date" required max="${D.today()}"></div>
      <div class="field"><label>${t().nationality}</label><input name="nationality" maxlength="80"></div>
      <div class="field"><label>${t().address}</label><input name="address" autocomplete="street-address" maxlength="200"></div>
      <div class="field"><label>${t().city}</label><input name="city" autocomplete="address-level2" maxlength="80"></div>
      <div class="field"><label>${t().country}</label><input name="country" autocomplete="country-name" maxlength="80"></div>
      <div class="field"><label>${t().phone}</label><input name="phone" type="tel" maxlength="40"></div>
    </div>
    <p class="small muted">${esc(t().privacy)}</p>
    <button class="btn primary" style="width:100%">${t().submitPc}</button>
  </form>`) : ""}
  <p style="text-align:center"><button class="linkish" id="other">${lang === "el" ? "Άλλη κράτηση" : "Another booking"}</button></p>`;
  $("#other").onclick = () => { st.mine = null; st.mineAuth = null; st.prefillCode = null; render(); };
  const pc = $("#pc");
  if (pc) pc.onsubmit = async ev => {
    ev.preventDefault();
    const f = formData(pc);
    await busy($("button", pc), async () => {
      try {
        must(await sb.rpc("guest_precheckin", {
          p_code: st.mineAuth.code, p_email: st.mineAuth.email, p_birth_date: f.birth || null, p_nationality: f.nationality,
          p_id_type: f.id_type || null, p_id_number: f.id_number, p_address: f.address, p_city: f.city, p_country: f.country, p_phone: f.phone
        }));
        await loadMine(); scrollTo(0, 0);
      } catch (e) { showErr(pc, e); }
    });
  };
}

init();
