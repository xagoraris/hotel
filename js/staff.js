// Εφαρμογή προσωπικού: ρεσεψιόν, διοίκηση, καθαριότητα.

const LBL = {
  status: { pending: "Εκκρεμεί", confirmed: "Επιβεβαιωμένη", checked_in: "Στο ξενοδοχείο", checked_out: "Αναχώρησε", cancelled: "Ακυρώθηκε", no_show: "Δεν ήρθε" },
  source: { direct: "Απευθείας", phone: "Τηλέφωνο", email: "Email", online: "Online (ιστοσελίδα)", booking: "Booking.com", airbnb: "Airbnb", expedia: "Expedia", other: "Άλλο" },
  room: { clean: "Καθαρό", dirty: "Βρώμικο", inspect: "Για έλεγχο", out_of_order: "Εκτός λειτουργίας" },
  role: { admin: "Διαχειριστής", reception: "Ρεσεψιόν", housekeeping: "Καθαριότητα" },
  idType: { id_card: "Ταυτότητα", passport: "Διαβατήριο", other: "Άλλο" },
  req: { new: "Νέο", confirmed: "Επιβεβαιωμένο", done: "Ολοκληρώθηκε", cancelled: "Ακυρώθηκε" },
  kind: { transfer: "Transfer", yachting: "Yachting / κρουαζιέρα", tour: "Εκδρομή", spa: "Spa", restaurant: "Εστιατόριο", other: "Άλλο" },
  priceUnit: { per_booking: "Ανά κράτηση", per_person: "Ανά άτομο", on_request: "Κατόπιν επικοινωνίας" },
  direction: { to_airport: "Προς αεροδρόμιο", from_airport: "Από αεροδρόμιο", to_port: "Προς λιμάνι", from_port: "Από λιμάνι", other: "Άλλη διαδρομή" }
};
const REQ_CLS = { new: "pending", confirmed: "confirmed", done: "checked_in", cancelled: "cancelled" };
const badge = (kind, key) => `<span class="badge b-${esc(kind === "req" ? REQ_CLS[key] : key)}">${esc(LBL[kind][key] || key)}</span>`;
const options = (map, sel, empty) =>
  (empty !== undefined ? `<option value="">${esc(empty)}</option>` : "") +
  Object.entries(map).map(([k, v]) => `<option value="${esc(k)}"${k === sel ? " selected" : ""}>${esc(v)}</option>`).join("");

const ERR = {
  ERR_DATES: "Μη έγκυρες ημερομηνίες.",
  ERR_MAX_NIGHTS: "Μέγιστη διάρκεια 60 νύχτες.",
  ERR_SOLD_OUT: "Δεν υπάρχει διαθεσιμότητα.",
  ERR_CAPACITY: "Ο τύπος δωματίου δεν χωράει τόσα άτομα."
};
function errMsg(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (ERR[m]) return ERR[m];
  if (m.includes("reservations_no_overlap")) return "Το δωμάτιο είναι ήδη κρατημένο σε αυτές τις ημερομηνίες.";
  if (m.includes("reservations_check1")) return "Για check-in πρέπει πρώτα να οριστεί δωμάτιο.";
  if (m.includes("reservations_check")) return "Η αναχώρηση πρέπει να είναι μετά την άφιξη.";
  if (m.includes("rooms_number_key")) return "Υπάρχει ήδη δωμάτιο με αυτόν τον αριθμό.";
  if (m.includes("foreign key")) return "Δεν μπορεί να διαγραφεί επειδή χρησιμοποιείται. Απενεργοποίησέ το αντί να το διαγράψεις.";
  if (m.includes("Invalid login credentials")) return "Λάθος email ή κωδικός.";
  if (m.includes("Email not confirmed")) return "Επιβεβαίωσε πρώτα το email σου από τον σύνδεσμο που σου στείλαμε.";
  if (m.includes("User already registered")) return "Υπάρχει ήδη λογαριασμός με αυτό το email.";
  if (m.includes("Password should be")) return "Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες.";
  if (m.includes("Failed to fetch")) return "Δεν υπάρχει σύνδεση στο Internet.";
  return m;
}
const fail = e => { console.error(e); toast(errMsg(e), "err"); };
// Επιστρέφει τα δεδομένα μιας κλήσης Supabase ή πετάει το σφάλμα της.
const must = ({ data, error }) => { if (error) throw error; return data; };

const S = { session: null, profile: null, settings: {}, types: [], rooms: [] };
const role = () => S.profile && S.profile.role;
const FRONT = ["admin", "reception"];

const ROUTES = {
  today:        { title: "Σήμερα",       roles: FRONT,                       render: viewToday },
  calendar:     { title: "Ημερολόγιο",   roles: FRONT,                       render: viewCalendar },
  reservations: { title: "Κρατήσεις",    roles: FRONT,                       render: viewReservations },
  requests:     { title: "Αιτήματα",     roles: FRONT,                       render: viewRequests },
  guests:       { title: "Πελάτες",      roles: FRONT,                       render: viewGuests },
  housekeeping: { title: "Καθαριότητα",  roles: [...FRONT, "housekeeping"],  render: viewHousekeeping },
  rooms:        { title: "Δωμάτια",      roles: ["admin"],                   render: viewRooms },
  tablet:       { title: "Tablet",       roles: ["admin"],                   render: viewTablet },
  channels:     { title: "Κανάλια",      roles: ["admin"],                   render: viewChannels },
  users:        { title: "Χρήστες",      roles: ["admin"],                   render: viewUsers },
  settings:     { title: "Ρυθμίσεις",    roles: ["admin"],                   render: viewSettings }
};

// ======================================================================
// Σύνδεση
// ======================================================================
sb.auth.onAuthStateChange((event, session) => {
  // Οι κλήσεις στη βάση γίνονται εκτός του callback (σύσταση του supabase-js).
  setTimeout(() => {
    if (event === "PASSWORD_RECOVERY") return renderNewPassword();
    if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
      if ((session && session.user.id) === (S.session && S.session.user.id) && event === "SIGNED_IN" && S.profile) return;
      boot(session);
    }
  }, 0);
});

async function boot(session) {
  S.session = session;
  if (!session) return renderAuth();
  try {
    S.profile = must(await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle());
    if (!S.profile || !S.profile.role) return renderPending();
    await loadBase();
    renderShell();
    route();
  } catch (e) { fail(e); renderAuth(); }
}

async function loadBase() {
  const [settings, types, rooms] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("room_types").select("*").order("sort").order("name"),
    sb.from("rooms").select("*").order("number")
  ]);
  S.settings = must(settings);
  S.types = must(types);
  S.rooms = must(rooms).sort((a, b) => a.number.localeCompare(b.number, "el", { numeric: true }));
  document.title = `${S.settings.hotel_name} · Διαχείριση`;
}

function renderAuth(mode = "login", message = "") {
  const app = $("#app");
  const titles = { login: "Σύνδεση προσωπικού", signup: "Νέος λογαριασμός", forgot: "Επαναφορά κωδικού" };
  app.innerHTML = `
  <div class="auth"><div class="card">
    <div class="brand"><img src="icons/icon.svg" alt=""><span>Διαχείριση ξενοδοχείου</span></div>
    <h2>${titles[mode]}</h2>
    ${message}
    <form id="authForm" novalidate>
      ${mode === "signup" ? `<div class="field"><label>Ονοματεπώνυμο</label><input name="full_name" required autocomplete="name"></div>` : ""}
      <div class="field"><label>Email</label><input name="email" type="email" required autocomplete="email"></div>
      ${mode !== "forgot" ? `<div class="field"><label>Κωδικός</label><input name="password" type="password" required minlength="6" autocomplete="${mode === "signup" ? "new-password" : "current-password"}"></div>` : ""}
      <button class="btn primary" style="width:100%">${{ login: "Σύνδεση", signup: "Δημιουργία λογαριασμού", forgot: "Αποστολή συνδέσμου" }[mode]}</button>
    </form>
    <p class="small muted" style="margin-top:1rem">
      ${mode === "login"
        ? `<button class="linkish" data-mode="forgot">Ξέχασα τον κωδικό</button> · <button class="linkish" data-mode="signup">Νέος λογαριασμός</button>`
        : `<button class="linkish" data-mode="login">Πίσω στη σύνδεση</button>`}
    </p>
    ${mode === "signup" ? `<p class="small muted">Ο πρώτος λογαριασμός γίνεται διαχειριστής. Οι επόμενοι χρειάζονται έγκριση από τον διαχειριστή.</p>` : ""}
  </div></div>`;
  $$("[data-mode]", app).forEach(b => b.onclick = () => renderAuth(b.dataset.mode));
  $("#authForm").onsubmit = async ev => {
    ev.preventDefault();
    const f = formData(ev.target);
    const btn = $("button.primary", ev.target);
    await busy(btn, async () => {
      try {
        if (!f.email) throw new Error("Συμπλήρωσε το email.");
        const redirectTo = location.origin + location.pathname;
        if (mode === "login") {
          must(await sb.auth.signInWithPassword({ email: f.email, password: f.password }));
        } else if (mode === "signup") {
          if (!f.full_name) throw new Error("Συμπλήρωσε το ονοματεπώνυμο.");
          const data = must(await sb.auth.signUp({ email: f.email, password: f.password, options: { data: { full_name: f.full_name }, emailRedirectTo: redirectTo } }));
          if (!data.session) renderAuth("login", `<div class="alert ok">Σου στείλαμε email επιβεβαίωσης. Πάτησε τον σύνδεσμο και μετά συνδέσου.</div>`);
        } else {
          must(await sb.auth.resetPasswordForEmail(f.email, { redirectTo }));
          renderAuth("login", `<div class="alert ok">Αν υπάρχει λογαριασμός, θα λάβεις email με σύνδεσμο επαναφοράς.</div>`);
        }
      } catch (e) {
        const old = $(".alert", app); if (old) old.remove();
        $("#authForm").insertAdjacentHTML("beforebegin", `<div class="alert err">${esc(errMsg(e))}</div>`);
      }
    });
  };
}

function renderNewPassword() {
  $("#app").innerHTML = `
  <div class="auth"><div class="card">
    <div class="brand"><img src="icons/icon.svg" alt=""><span>Διαχείριση ξενοδοχείου</span></div>
    <h2>Νέος κωδικός</h2>
    <form id="pwForm"><div class="field"><label>Νέος κωδικός (τουλάχιστον 6 χαρακτήρες)</label><input name="password" type="password" minlength="6" required autocomplete="new-password"></div>
    <button class="btn primary" style="width:100%">Αποθήκευση</button></form>
  </div></div>`;
  $("#pwForm").onsubmit = async ev => {
    ev.preventDefault();
    await busy($("button", ev.target), async () => {
      try {
        must(await sb.auth.updateUser({ password: formData(ev.target).password }));
        toast("Ο κωδικός άλλαξε.");
        const { data } = await sb.auth.getSession();
        boot(data.session);
      } catch (e) { fail(e); }
    });
  };
}

function renderPending() {
  $("#app").innerHTML = `
  <div class="auth"><div class="card">
    <div class="brand"><img src="icons/icon.svg" alt=""><span>Διαχείριση ξενοδοχείου</span></div>
    <h2>Αναμονή έγκρισης</h2>
    <p>Ο λογαριασμός <b>${esc(S.session.user.email)}</b> δημιουργήθηκε. Ο διαχειριστής πρέπει να σου δώσει πρόσβαση από την ενότητα «Χρήστες».</p>
    <div class="row"><button class="btn primary" id="retry">Έλεγχος ξανά</button><button class="btn" id="logout">Αποσύνδεση</button></div>
  </div></div>`;
  $("#retry").onclick = () => boot(S.session);
  $("#logout").onclick = () => sb.auth.signOut();
}

// ======================================================================
// Βασική διάταξη και πλοήγηση
// ======================================================================
function allowedRoutes() { return Object.entries(ROUTES).filter(([, r]) => r.roles.includes(role())); }

function renderShell() {
  const isFront = FRONT.includes(role());
  $("#app").innerHTML = `
  <header class="topbar">
    <a class="brand" href="#"><img src="icons/icon.svg" alt=""><span>${esc(S.settings.hotel_name)}</span></a>
    <nav class="nav">${allowedRoutes().map(([k, r]) => `<a href="#${k}" data-route="${k}">${r.title}</a>`).join("")}</nav>
    <div class="user-menu">
      ${isFront ? `<button class="btn primary sm" id="newRes">+ Κράτηση</button>` : ""}
      <span class="user-name small muted">${esc(S.profile.full_name || S.session.user.email)} · ${esc(LBL.role[role()])}</span>
      <button class="icon-btn" id="logout" title="Αποσύνδεση" aria-label="Αποσύνδεση">⎋</button>
    </div>
  </header>
  <main id="main"></main>`;
  $("#logout").onclick = async () => { clearInterval(reqWatch); await sb.auth.signOut(); S.profile = null; };
  if (isFront) { $("#newRes").onclick = () => openReservation(null); startRequestWatch(); }
}

// Έλεγχος για νέα αιτήματα από τα tablet κάθε 30''.
let reqWatch = null, lastNewCount = null;
function startRequestWatch() {
  clearInterval(reqWatch);
  lastNewCount = null;
  const check = async () => {
    if (!S.profile || !FRONT.includes(role())) return clearInterval(reqWatch);
    const { count, error } = await sb.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "new");
    if (error) return;
    const a = $('.nav a[data-route="requests"]');
    if (a) a.innerHTML = `Αιτήματα${count ? ` <span class="badge b-pending">${count}</span>` : ""}`;
    if (lastNewCount !== null && count > lastNewCount) {
      toast("Νέο αίτημα υπηρεσίας από δωμάτιο.");
      beep();
      if (location.hash === "#requests") refresh();
    }
    lastNewCount = count;
  };
  check();
  reqWatch = setInterval(check, 30000);
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.25);
  } catch {}
}

function route() {
  if (!S.profile || !S.profile.role) return;
  const allowed = allowedRoutes().map(([k]) => k);
  let key = location.hash.slice(1);
  if (!allowed.includes(key)) key = allowed[0];
  $$(".nav a").forEach(a => a.classList.toggle("active", a.dataset.route === key));
  const main = $("#main");
  main.innerHTML = `<p class="muted">Φόρτωση…</p>`;
  ROUTES[key].render(main).catch(e => { fail(e); main.innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; });
}
window.addEventListener("hashchange", route);
const refresh = () => route();

// ======================================================================
// Κοινά για κρατήσεις
// ======================================================================
const RES_SELECT = "*, guests(*), rooms(number), room_types(name)";
const guestName = g => g ? `${g.last_name} ${g.first_name}` : "—";
const nights = r => D.diff(r.check_in, r.check_out);
const SHORT = { day: "numeric", month: "short" };
const balance = r => Number(r.total_price || 0) - Number(r.paid || 0);
const roomById = id => S.rooms.find(r => r.id === id);
const typeById = id => S.types.find(t => t.id === id);

function resRows(rows, action) {
  if (!rows.length) return `<div class="empty">Καμία κράτηση</div>`;
  return `<div class="table-wrap"><table><thead><tr>
    <th>Πελάτης</th><th>Δωμάτιο</th><th>Διαμονή</th><th>Άτομα</th><th>Κατάσταση</th><th></th></tr></thead><tbody>
    ${rows.map(r => `<tr class="click" data-id="${r.id}">
      <td><b>${esc(guestName(r.guests))}</b><div class="small muted">${esc(r.guests && r.guests.phone || "")}</div></td>
      <td>${r.rooms ? `<b>${esc(r.rooms.number)}</b>` : `<span class="badge b-pending">Χωρίς δωμάτιο</span>`}<div class="small muted">${esc(r.room_types && r.room_types.name || "")}</div></td>
      <td style="white-space:nowrap">${D.fmt(r.check_in, "el", SHORT)} → ${D.fmt(r.check_out, "el", SHORT)}<div class="small muted">${nights(r)} νύχτες</div></td>
      <td>${r.adults}${r.children ? ` + ${r.children}` : ""}</td>
      <td>${badge("status", r.status)}${r.precheckin_at ? ` <span class="badge b-clean" title="Ο πελάτης συμπλήρωσε online check-in">online check-in</span>` : ""}</td>
      <td class="num">${action ? action(r) : ""}</td>
    </tr>`).join("")}
  </tbody></table></div>`;
}

function bindRows(container, rows) {
  $$("tr.click", container).forEach(tr => tr.addEventListener("click", ev => {
    if (ev.target.closest("button")) return;
    openReservation(Number(tr.dataset.id));
  }));
  $$("[data-act]", container).forEach(b => b.addEventListener("click", async () => {
    const r = rows.find(x => x.id === Number(b.dataset.id));
    if (b.dataset.act === "checkout") return checkout(r, b);
    openReservation(r.id);
  }));
}

async function checkout(r, btn) {
  const bal = balance(r);
  const msg = `Check-out για ${guestName(r.guests)} (δωμάτιο ${r.rooms ? r.rooms.number : "—"});` +
    (bal > 0 ? `\n\nΠροσοχή: υπάρχει υπόλοιπο ${money(bal)}.` : "");
  if (!confirm(msg)) return;
  await busy(btn, async () => {
    try {
      must(await sb.from("reservations").update({ status: "checked_out" }).eq("id", r.id));
      toast("Έγινε check-out. Το δωμάτιο σημειώθηκε για καθάρισμα.");
      refresh();
    } catch (e) { fail(e); }
  });
}

// ======================================================================
// Σήμερα
// ======================================================================
async function viewToday(main) {
  const t = D.today();
  const q = () => sb.from("reservations").select(RES_SELECT);
  const [arr, dep, inh, pend] = await Promise.all([
    q().eq("check_in", t).in("status", ["pending", "confirmed", "checked_in"]).order("created_at"),
    q().eq("check_out", t).in("status", ["checked_in", "checked_out"]).order("created_at"),
    q().eq("status", "checked_in").order("check_out"),
    q().eq("status", "pending").order("check_in")
  ].map(p => p.then(must)));
  const activeRooms = S.rooms.filter(r => r.active).length;
  const arrLeft = arr.filter(r => r.status !== "checked_in").length;
  const depLeft = dep.filter(r => r.status === "checked_in").length;
  const overdue = inh.filter(r => r.check_out < t);
  const occ = activeRooms ? Math.round(inh.length / activeRooms * 100) : 0;

  main.innerHTML = `
  <div class="page-head"><h1>${esc(D.fmt(t, "el", { weekday: "long", day: "numeric", month: "long" }))}</h1></div>
  ${!S.rooms.length ? `<div class="alert info">Ξεκίνα προσθέτοντας τύπους δωματίων και δωμάτια από την ενότητα <a href="#rooms">Δωμάτια</a>.</div>` : ""}
  <div class="stats">
    <div class="stat"><b>${arrLeft}</b><span>Αφίξεις που περιμένουμε</span></div>
    <div class="stat"><b>${depLeft}</b><span>Αναχωρήσεις που απομένουν</span></div>
    <div class="stat"><b>${inh.length}</b><span>Δωμάτια με πελάτες</span></div>
    <div class="stat"><b>${occ}%</b><span>Πληρότητα (${activeRooms} δωμάτια)</span></div>
  </div>
  ${pend.length ? `<div class="card" id="cPend"><h2>Online αιτήματα προς επιβεβαίωση <span class="count">${pend.length}</span></h2>${resRows(pend, r => `<button class="btn sm" data-act="open" data-id="${r.id}">Άνοιγμα</button>`)}</div>` : ""}
  <div class="cols" style="margin-top:1rem">
    <div class="card" id="cArr"><h2>Αφίξεις σήμερα <span class="count">${arr.length}</span></h2>
      ${resRows(arr, r => r.status === "checked_in" ? `<span class="small muted">✓ ${new Date(r.checked_in_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}</span>` : `<button class="btn ok sm" data-act="checkin" data-id="${r.id}">Check-in</button>`)}</div>
    <div class="card" id="cDep"><h2>Αναχωρήσεις σήμερα <span class="count">${dep.length}</span></h2>
      ${resRows(dep, r => r.status === "checked_in" ? `<button class="btn sm" data-act="checkout" data-id="${r.id}">Check-out</button>` : `<span class="small muted">✓ Αναχώρησε</span>`)}</div>
  </div>
  ${overdue.length ? `<div class="card" id="cOver"><h2>Έπρεπε να έχουν αναχωρήσει <span class="count">${overdue.length}</span></h2>${resRows(overdue, r => `<button class="btn sm" data-act="checkout" data-id="${r.id}">Check-out</button>`)}</div>` : ""}
  <div class="card" id="cIn"><h2>Στο ξενοδοχείο τώρα <span class="count">${inh.length}</span></h2>${resRows(inh, r => `<button class="btn sm" data-act="checkout" data-id="${r.id}">Check-out</button>`)}</div>`;
  for (const [id, rows] of [["#cPend", pend], ["#cArr", arr], ["#cDep", dep], ["#cOver", overdue], ["#cIn", inh]]) {
    const el = $(id, main); if (el) bindRows(el, rows);
  }
}

// ======================================================================
// Ημερολόγιο
// ======================================================================
let calStart = null;
async function viewCalendar(main) {
  const days = window.innerWidth < 700 ? 10 : 21;
  if (!calStart) calStart = D.add(D.today(), -1);
  const end = D.add(calStart, days);
  const rows = must(await sb.from("reservations")
    .select("id, code, check_in, check_out, status, room_id, room_type_id, adults, children, guests(first_name, last_name)")
    .lt("check_in", end).gt("check_out", calStart).not("status", "in", "(cancelled,no_show)").order("check_in"));
  const unassigned = rows.filter(r => !r.room_id);
  const dates = Array.from({ length: days }, (_, i) => D.add(calStart, i));
  const today = D.today();
  const W = 44;

  const bar = r => {
    const s = D.diff(calStart, r.check_in), e = D.diff(calStart, r.check_out);
    const left = s < 0 ? 0 : s * W + W / 2;
    const right = e > days ? days * W : e * W + W / 2;
    const g = r.guests || {};
    const label = `${g.last_name || ""} ${g.first_name ? g.first_name[0] + "." : ""}`;
    return `<div class="bar s-${r.status}${s < 0 ? " clip-l" : ""}${e > days ? " clip-r" : ""}" data-id="${r.id}"
      style="left:${left + 1}px;width:${Math.max(right - left - 2, 14)}px" title="${esc(`${label} · ${D.fmt(r.check_in)} → ${D.fmt(r.check_out)} · ${LBL.status[r.status]}`)}">${esc(label)}</div>`;
  };
  const head = `<div class="cal-row"><div class="room corner"></div><div class="days">${dates.map(d =>
    `<div class="head${d === today ? " today" : ""}${D.isWeekend(d) ? " wk" : ""}"><span>${esc(D.dow(d))}</span><b>${D.parse(d).getUTCDate()}</b></div>`).join("")}</div></div>`;
  const roomRow = room => `<div class="cal-row"><div class="room">${esc(room.number)}<small>${esc(LBL.room[room.status])}</small></div>
    <div class="days">${dates.map(d => `<div class="cell${D.isWeekend(d) ? " wk" : ""}" data-room="${room.id}" data-date="${d}"></div>`).join("")}
    ${rows.filter(r => r.room_id === room.id).map(bar).join("")}</div></div>`;
  const groups = S.types.map(t => ({ t, rooms: S.rooms.filter(r => r.room_type_id === t.id && r.active) })).filter(g => g.rooms.length);

  main.innerHTML = `
  <div class="page-head"><h1>Ημερολόγιο</h1>
    <button class="btn sm" id="prev">◀</button><button class="btn sm" id="tod">Σήμερα</button><button class="btn sm" id="next">▶</button>
    <input type="date" id="jump" value="${calStart}" style="width:auto">
  </div>
  ${unassigned.length ? `<div class="card" style="margin-bottom:1rem"><h2>Χωρίς ανάθεση δωματίου <span class="count">${unassigned.length}</span></h2>
    <div class="row">${unassigned.map(r => `<button class="btn sm" data-open="${r.id}">${esc(guestName(r.guests))} · ${esc(typeById(r.room_type_id) ? typeById(r.room_type_id).name : "")} · ${D.fmt(r.check_in)}→${D.fmt(r.check_out)}</button>`).join("")}</div></div>` : ""}
  ${groups.length ? `<div class="cal-wrap"><div class="cal" style="--cell:${W}px">${head}
    ${groups.map(g => `<div class="group">${esc(g.t.name)}</div>${g.rooms.map(roomRow).join("")}`).join("")}
  </div></div>
  <div class="legend"><span><i style="background:var(--warn-soft);border:1px dashed var(--warn)"></i>Εκκρεμεί</span><span><i style="background:var(--info-soft)"></i>Επιβεβαιωμένη</span><span><i style="background:var(--ok)"></i>Στο ξενοδοχείο</span><span><i style="background:var(--gray-soft)"></i>Αναχώρησε</span><span>Πάτησε σε κενό κελί για νέα κράτηση.</span></div>`
  : `<div class="alert info">Δεν υπάρχουν δωμάτια. Πρόσθεσέ τα από την ενότητα <a href="#rooms">Δωμάτια</a>.</div>`}`;

  $("#prev").onclick = () => { calStart = D.add(calStart, -7); refresh(); };
  $("#next").onclick = () => { calStart = D.add(calStart, 7); refresh(); };
  $("#tod").onclick = () => { calStart = D.add(D.today(), -1); refresh(); };
  $("#jump").onchange = e => { if (e.target.value) { calStart = e.target.value; refresh(); } };
  $$("[data-open]", main).forEach(b => b.onclick = () => openReservation(Number(b.dataset.open)));
  $$(".bar", main).forEach(b => b.onclick = () => openReservation(Number(b.dataset.id)));
  $$(".cell", main).forEach(c => c.onclick = () =>
    openReservation(null, { room_id: Number(c.dataset.room), check_in: c.dataset.date, check_out: D.add(c.dataset.date, 1) }));
}

// ======================================================================
// Κρατήσεις (λίστα)
// ======================================================================
const resFilter = { from: D.add(D.today(), -7), to: "", status: "active", q: "" };
async function viewReservations(main) {
  let query = sb.from("reservations").select(RES_SELECT).order("check_in").limit(500);
  if (resFilter.from) query = query.gte("check_in", resFilter.from);
  if (resFilter.to) query = query.lte("check_in", resFilter.to);
  if (resFilter.status === "active") query = query.in("status", ["pending", "confirmed", "checked_in"]);
  else if (resFilter.status) query = query.eq("status", resFilter.status);
  const all = must(await query);

  main.innerHTML = `
  <div class="page-head"><h1>Κρατήσεις</h1><button class="btn primary" id="add">+ Νέα κράτηση</button></div>
  <div class="card">
    <div class="grid">
      <div class="field"><label>Αναζήτηση</label><input id="fq" placeholder="Όνομα, κωδικός, τηλέφωνο…" value="${esc(resFilter.q)}"></div>
      <div class="field"><label>Άφιξη από</label><input type="date" id="ffrom" value="${resFilter.from}"></div>
      <div class="field"><label>Άφιξη έως</label><input type="date" id="fto" value="${resFilter.to}"></div>
      <div class="field"><label>Κατάσταση</label><select id="fst"><option value="active">Ενεργές</option><option value="">Όλες</option>${options(LBL.status, resFilter.status)}</select></div>
    </div>
    <div id="list"></div>
  </div>`;
  $("#fst").value = resFilter.status;
  const draw = () => {
    const q = resFilter.q.toLowerCase();
    const rows = !q ? all : all.filter(r => [r.code, r.guests && r.guests.first_name, r.guests && r.guests.last_name, r.guests && r.guests.email, r.guests && r.guests.phone, r.rooms && r.rooms.number]
      .some(v => String(v || "").toLowerCase().includes(q)));
    $("#list").innerHTML = !rows.length ? `<div class="empty">Δεν βρέθηκαν κρατήσεις</div>` : `<div class="table-wrap"><table><thead><tr>
      <th>Κωδικός</th><th>Πελάτης</th><th>Άφιξη</th><th>Αναχώρηση</th><th>Δωμάτιο</th><th>Πηγή</th><th>Κατάσταση</th><th class="num">Σύνολο</th><th class="num">Υπόλοιπο</th></tr></thead><tbody>
      ${rows.map(r => `<tr class="click" data-id="${r.id}">
        <td class="mono">${esc(r.code)}</td><td><b>${esc(guestName(r.guests))}</b></td>
        <td>${D.fmt(r.check_in)}</td><td>${D.fmt(r.check_out)}</td>
        <td>${r.rooms ? esc(r.rooms.number) : "—"} <span class="small muted">${esc(r.room_types && r.room_types.name || "")}</span></td>
        <td class="small">${esc(LBL.source[r.source])}</td><td>${badge("status", r.status)}</td>
        <td class="num">${money(r.total_price)}</td><td class="num">${balance(r) > 0 ? `<b>${money(balance(r))}</b>` : `<span class="muted">—</span>`}</td></tr>`).join("")}
      </tbody></table></div>
      ${all.length === 500 ? `<p class="small muted">Εμφανίζονται οι πρώτες 500. Περιόρισε τις ημερομηνίες.</p>` : ""}`;
    $$("tr.click", main).forEach(tr => tr.onclick = () => openReservation(Number(tr.dataset.id)));
  };
  draw();
  $("#fq").oninput = e => { resFilter.q = e.target.value; draw(); };
  $("#ffrom").onchange = e => { resFilter.from = e.target.value; refresh(); };
  $("#fto").onchange = e => { resFilter.to = e.target.value; refresh(); };
  $("#fst").onchange = e => { resFilter.status = e.target.value; refresh(); };
  $("#add").onclick = () => openReservation(null);
}

// ======================================================================
// Φόρμα κράτησης
// ======================================================================
const GUEST_FIELDS = ["first_name", "last_name", "email", "phone", "nationality", "birth_date", "id_type", "id_number", "address", "city", "country"];

function guestFieldsHtml(g = {}, open = false) {
  return `
  <div class="grid">
    <div class="field"><label>Όνομα *</label><input name="first_name" value="${esc(g.first_name)}" required></div>
    <div class="field"><label>Επώνυμο *</label><input name="last_name" value="${esc(g.last_name)}" required></div>
    <div class="field"><label>Τηλέφωνο</label><input name="phone" type="tel" value="${esc(g.phone)}"></div>
    <div class="field"><label>Email</label><input name="email" type="email" value="${esc(g.email)}"></div>
  </div>
  <details${open ? " open" : ""}><summary class="small" style="cursor:pointer;margin-bottom:.6rem">Στοιχεία ταυτότητας & διεύθυνση ${g.id_number ? "✓" : "(απαιτούνται στο check-in)"}</summary>
  <div class="grid">
    <div class="field"><label>Έγγραφο</label><select name="id_type">${options(LBL.idType, g.id_type || "", "—")}</select></div>
    <div class="field"><label>Αριθμός εγγράφου</label><input name="id_number" value="${esc(g.id_number)}"></div>
    <div class="field"><label>Ημ. γέννησης</label><input name="birth_date" type="date" value="${esc(g.birth_date)}"></div>
    <div class="field"><label>Υπηκοότητα</label><input name="nationality" value="${esc(g.nationality)}"></div>
    <div class="field"><label>Διεύθυνση</label><input name="address" value="${esc(g.address)}"></div>
    <div class="field"><label>Πόλη</label><input name="city" value="${esc(g.city)}"></div>
    <div class="field"><label>Χώρα</label><input name="country" value="${esc(g.country)}"></div>
  </div></details>`;
}

function pickGuest(f) {
  const g = {};
  for (const k of GUEST_FIELDS) g[k] = f[k] === "" ? null : f[k];
  return g;
}

async function openReservation(id, prefill = {}) {
  let r;
  try {
    r = id ? must(await sb.from("reservations").select(RES_SELECT).eq("id", id).single())
           : { status: "confirmed", source: "direct", adults: 2, children: 0, total_price: 0, paid: 0, guests: null,
               check_in: D.today(), check_out: D.add(D.today(), 1), ...prefill };
  } catch (e) { return fail(e); }
  if (!id && r.room_id && !r.room_type_id) r.room_type_id = roomById(r.room_id).room_type_id;
  if (!id && !r.room_type_id && S.types.length) r.room_type_id = S.types.find(t => t.active)?.id;
  let guestId = r.guest_id || null;
  let priceTouched = !!id;

  const isOpen = ["pending", "confirmed"].includes(r.status);
  const footer = `
    <button type="button" class="btn primary" data-save="">Αποθήκευση</button>
    ${r.status === "pending" ? `<button type="button" class="btn" data-save="confirmed">Επιβεβαίωση</button>` : ""}
    ${isOpen ? `<button type="button" class="btn ok" data-save="checked_in">Check-in</button>` : ""}
    ${r.status === "checked_in" ? `<button type="button" class="btn ok" data-save="checked_out">Check-out</button>` : ""}
    <span class="spacer"></span>
    ${id && isOpen ? `<button type="button" class="btn danger" data-save="cancelled">Ακύρωση κράτησης</button>` : ""}`;

  const m = openModal({
    title: id ? `Κράτηση ${r.code}` : "Νέα κράτηση", wide: true, footer,
    body: `
    ${id ? `<div class="row small muted" style="margin-bottom:.8rem">${badge("status", r.status)}
      <span>Πηγή: ${esc(LBL.source[r.source])}${r.ota_code ? ` · κωδ. ${esc(r.ota_code)}` : ""}</span><span>· Καταχωρήθηκε ${new Date(r.created_at).toLocaleString("el-GR")}</span>
      ${r.precheckin_at ? `<span class="badge b-clean">Online check-in ${new Date(r.precheckin_at).toLocaleDateString("el-GR")}</span>` : ""}
      ${r.checked_in_at ? `<span>· Check-in ${new Date(r.checked_in_at).toLocaleString("el-GR")}</span>` : ""}
      ${r.checked_out_at ? `<span>· Check-out ${new Date(r.checked_out_at).toLocaleString("el-GR")}</span>` : ""}</div>` : ""}
    ${r.channel ? `<div class="alert info">Η κράτηση ήρθε από channel manager. Αλλαγές ημερομηνιών ή ακύρωση γίνονται στην πλατφόρμα (${esc(LBL.source[r.source])}). Από εδώ ανάθεσε δωμάτιο, κάνε check-in/out και συμπλήρωσε στοιχεία.</div>` : ""}
    <fieldset><legend>Πελάτης</legend>
      ${!id ? `<div class="field" style="position:relative"><label>Αναζήτηση υπάρχοντος πελάτη</label>
        <input id="gsearch" placeholder="Πληκτρολόγησε επώνυμο, email ή τηλέφωνο" autocomplete="off">
        <div id="gresults"></div></div>` : ""}
      <div id="gsel" class="small muted"></div>
      <div id="gfields">${guestFieldsHtml(r.guests || {}, r.status === "confirmed" && r.check_in <= D.today())}</div>
    </fieldset>
    <fieldset><legend>Διαμονή</legend>
      <div class="grid">
        <div class="field"><label>Άφιξη *</label><input type="date" name="check_in" value="${r.check_in}" required></div>
        <div class="field"><label>Αναχώρηση *</label><input type="date" name="check_out" value="${r.check_out}" required></div>
        <div class="field"><label>Ενήλικες</label><input type="number" name="adults" min="1" max="20" value="${r.adults}"></div>
        <div class="field"><label>Παιδιά</label><input type="number" name="children" min="0" max="20" value="${r.children}"></div>
      </div>
      <div class="grid">
        <div class="field"><label>Τύπος δωματίου *</label><select name="room_type_id">${S.types.map(t => `<option value="${t.id}"${t.id === r.room_type_id ? " selected" : ""}>${esc(t.name)}${t.active ? "" : " (ανενεργός)"}</option>`).join("")}</select></div>
        <div class="field"><label>Δωμάτιο</label><select name="room_id"></select></div>
        <div class="field"><label>Κατάσταση</label><select name="status">${options(LBL.status, r.status)}</select></div>
        <div class="field"><label>Πηγή</label><select name="source">${options(LBL.source, r.source)}</select></div>
      </div>
      <p class="small muted" id="nightsInfo"></p>
    </fieldset>
    <fieldset><legend>Χρέωση</legend>
      <div class="grid">
        <div class="field"><label>Σύνολο (€)</label><div class="row" style="flex-wrap:nowrap"><input type="number" step="0.01" min="0" name="total_price" value="${r.total_price}"><button type="button" class="btn sm" id="calc" title="Υπολογισμός από την τιμή του τύπου δωματίου">↻</button></div></div>
        <div class="field"><label>Πληρωμένα (€)</label><input type="number" step="0.01" min="0" name="paid" value="${r.paid}"></div>
        <div class="field"><label>Υπόλοιπο</label><div id="bal" style="padding:.55rem 0;font-weight:700"></div></div>
      </div>
      <div class="field"><label>Σημειώσεις</label><textarea name="notes">${esc(r.notes)}</textarea></div>
    </fieldset>`
  });
  const form = $("form", m.el);
  const el = n => form.elements[n];

  const updateBalance = () => { $("#bal", form).textContent = money(Number(el("total_price").value || 0) - Number(el("paid").value || 0)); };
  const calcPrice = () => {
    const t = typeById(Number(el("room_type_id").value));
    const n = D.diff(el("check_in").value, el("check_out").value);
    if (t && n > 0) el("total_price").value = (t.base_price * n).toFixed(2);
    updateBalance();
  };
  const updateNights = () => {
    const n = D.diff(el("check_in").value, el("check_out").value);
    $("#nightsInfo", form).textContent = n > 0 ? `${n} ${n === 1 ? "νύχτα" : "νύχτες"}` : "Η αναχώρηση πρέπει να είναι μετά την άφιξη.";
  };
  // Δωμάτια ομαδοποιημένα ανά τύπο· τα κατειλημμένα για τις επιλεγμένες ημερομηνίες είναι απενεργοποιημένα.
  const loadRooms = async () => {
    const ci = el("check_in").value, co = el("check_out").value;
    const current = el("room_id").value || (r.room_id ? String(r.room_id) : "");
    let busyRooms = new Set();
    if (ci && co && co > ci) {
      let q = sb.from("reservations").select("room_id").lt("check_in", co).gt("check_out", ci)
        .not("room_id", "is", null).not("status", "in", "(cancelled,no_show)");
      if (id) q = q.neq("id", id);
      const { data } = await q;
      busyRooms = new Set((data || []).map(x => x.room_id));
    }
    const typeId = Number(el("room_type_id").value);
    const sorted = [...S.types].sort((a, b) => (a.id === typeId ? -1 : b.id === typeId ? 1 : 0));
    el("room_id").innerHTML = `<option value="">— Χωρίς ανάθεση —</option>` + sorted.map(t => {
      const rooms = S.rooms.filter(x => x.room_type_id === t.id && (x.active || String(x.id) === current));
      if (!rooms.length) return "";
      return `<optgroup label="${esc(t.name)}">${rooms.map(x => {
        const taken = busyRooms.has(x.id);
        return `<option value="${x.id}"${taken ? " disabled" : ""}${String(x.id) === current && !taken ? " selected" : ""}>${esc(x.number)}${taken ? " — κατειλημμένο" : x.status !== "clean" ? ` — ${LBL.room[x.status].toLowerCase()}` : ""}</option>`;
      }).join("")}</optgroup>`;
    }).join("");
  };

  updateNights(); updateBalance(); loadRooms();
  if (!id) calcPrice();
  for (const n of ["check_in", "check_out"]) el(n).addEventListener("change", () => {
    if (n === "check_in" && el("check_out").value <= el("check_in").value) el("check_out").value = D.add(el("check_in").value, 1);
    updateNights(); loadRooms(); if (!priceTouched) calcPrice();
  });
  el("room_type_id").addEventListener("change", () => { loadRooms(); if (!priceTouched) calcPrice(); });
  el("room_id").addEventListener("change", () => {
    const room = roomById(Number(el("room_id").value));
    if (room && room.room_type_id !== Number(el("room_type_id").value)) el("room_type_id").value = room.room_type_id;
  });
  el("total_price").addEventListener("input", () => { priceTouched = true; updateBalance(); });
  el("paid").addEventListener("input", updateBalance);
  $("#calc", form).onclick = calcPrice;

  // Αναζήτηση υπάρχοντος πελάτη (μόνο σε νέα κράτηση).
  const gs = $("#gsearch", form);
  if (gs) {
    let timer;
    gs.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = gs.value.replace(/[,()%*]/g, " ").trim();
        if (q.length < 2) { $("#gresults", form).innerHTML = ""; return; }
        const { data } = await sb.from("guests").select("*")
          .or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).order("last_name").limit(8);
        $("#gresults", form).innerHTML = (data || []).length
          ? `<div class="row" style="margin-top:.4rem">${data.map(g => `<button type="button" class="btn sm" data-g="${g.id}">${esc(guestName(g))}${g.phone ? ` · ${esc(g.phone)}` : ""}</button>`).join("")}</div>`
          : `<p class="small muted">Δεν βρέθηκε. Συμπλήρωσε τα στοιχεία παρακάτω για νέο πελάτη.</p>`;
        $$("[data-g]", form).forEach(b => b.onclick = () => {
          const g = data.find(x => x.id === Number(b.dataset.g));
          guestId = g.id;
          $("#gfields", form).innerHTML = guestFieldsHtml(g);
          $("#gsel", form).innerHTML = `Επιλέχθηκε υπάρχων πελάτης: <b>${esc(guestName(g))}</b> <button type="button" class="linkish" id="gclear">νέος πελάτης αντί γι' αυτόν</button>`;
          $("#gresults", form).innerHTML = ""; gs.value = "";
          $("#gclear", form).onclick = () => { guestId = null; $("#gsel", form).innerHTML = ""; $("#gfields", form).innerHTML = guestFieldsHtml({}); };
        });
      }, 250);
    });
  }

  $$("[data-save]", m.el).forEach(btn => btn.addEventListener("click", () => busy(btn, async () => {
    const f = formData(form);
    const target = btn.dataset.save || f.status;
    const g = pickGuest(f);
    try {
      if (!g.first_name || !g.last_name) throw new Error("Συμπλήρωσε όνομα και επώνυμο πελάτη.");
      if (!f.check_in || !f.check_out || f.check_out <= f.check_in) throw new Error("Η αναχώρηση πρέπει να είναι μετά την άφιξη.");
      if (target === "checked_in") {
        if (!f.room_id) throw new Error("Διάλεξε δωμάτιο πριν το check-in.");
        if (!g.id_number && !confirm("Δεν έχουν συμπληρωθεί στοιχεία ταυτότητας/διαβατηρίου. Συνέχεια με check-in;")) return;
        const room = roomById(Number(f.room_id));
        if (room && room.status !== "clean" && !confirm(`Το δωμάτιο ${room.number} είναι «${LBL.room[room.status]}». Συνέχεια;`)) return;
      }
      if (target === "cancelled" && !confirm("Ακύρωση της κράτησης;")) return;
      if (target === "checked_out" && balance({ total_price: f.total_price, paid: f.paid }) > 0 &&
          !confirm(`Υπάρχει υπόλοιπο ${money(balance({ total_price: f.total_price, paid: f.paid }))}. Συνέχεια με check-out;`)) return;

      let newGuest = false;
      if (guestId) must(await sb.from("guests").update(g).eq("id", guestId));
      else { guestId = must(await sb.from("guests").insert(g).select("id").single()).id; newGuest = true; }

      const payload = {
        guest_id: guestId,
        check_in: f.check_in, check_out: f.check_out,
        adults: Number(f.adults || 1), children: Number(f.children || 0),
        room_type_id: Number(f.room_type_id), room_id: f.room_id ? Number(f.room_id) : null,
        status: target, source: f.source,
        total_price: Number(f.total_price || 0), paid: Number(f.paid || 0),
        notes: f.notes || null
      };
      try {
        if (id) must(await sb.from("reservations").update(payload).eq("id", id));
        else must(await sb.from("reservations").insert(payload));
      } catch (e) {
        if (newGuest) { await sb.from("guests").delete().eq("id", guestId); guestId = null; }
        throw e;
      }
      const done = { checked_in: "Έγινε check-in.", checked_out: "Έγινε check-out. Το δωμάτιο σημειώθηκε για καθάρισμα.", cancelled: "Η κράτηση ακυρώθηκε.", confirmed: "Η κράτηση επιβεβαιώθηκε." };
      toast(done[target] && target !== r.status ? done[target] : "Αποθηκεύτηκε.");
      m.close();
      if (["checked_in", "checked_out"].includes(target)) S.rooms = must(await sb.from("rooms").select("*").order("number"));
      refresh();
    } catch (e) { fail(e); }
  })));
}

// ======================================================================
// Πελάτες
// ======================================================================
let guestQuery = "";
async function viewGuests(main) {
  main.innerHTML = `
  <div class="page-head"><h1>Πελάτες</h1><button class="btn primary" id="add">+ Νέος πελάτης</button></div>
  <div class="card">
    <div class="field"><input id="q" placeholder="Αναζήτηση με επώνυμο, όνομα, email ή τηλέφωνο" value="${esc(guestQuery)}"></div>
    <div id="list"><p class="muted">Φόρτωση…</p></div>
  </div>`;
  const load = async () => {
    const q = guestQuery.replace(/[,()%*]/g, " ").trim();
    let query = sb.from("guests").select("*").order("last_name").order("first_name").limit(200);
    if (q) query = query.or(`last_name.ilike.%${q}%,first_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,id_number.ilike.%${q}%`);
    const rows = must(await query);
    $("#list").innerHTML = !rows.length ? `<div class="empty">Δεν βρέθηκαν πελάτες</div>` : `<div class="table-wrap"><table>
      <thead><tr><th>Ονοματεπώνυμο</th><th>Τηλέφωνο</th><th>Email</th><th>Χώρα</th><th>Έγγραφο</th></tr></thead><tbody>
      ${rows.map(g => `<tr class="click" data-id="${g.id}"><td><b>${esc(guestName(g))}</b></td><td>${esc(g.phone)}</td><td>${esc(g.email)}</td>
        <td>${esc(g.country || g.nationality)}</td><td>${g.id_number ? `${esc(LBL.idType[g.id_type] || "")} ${esc(g.id_number)}` : `<span class="muted">—</span>`}</td></tr>`).join("")}
      </tbody></table></div>`;
    $$("tr.click", main).forEach(tr => tr.onclick = () => openGuest(Number(tr.dataset.id)));
  };
  let timer;
  $("#q").oninput = e => { guestQuery = e.target.value; clearTimeout(timer); timer = setTimeout(() => load().catch(fail), 250); };
  $("#add").onclick = () => openGuest(null);
  await load();
}

async function openGuest(id) {
  let g = {}, history = [];
  try {
    if (id) {
      g = must(await sb.from("guests").select("*").eq("id", id).single());
      history = must(await sb.from("reservations").select("*, rooms(number), room_types(name)").eq("guest_id", id).order("check_in", { ascending: false }));
    }
  } catch (e) { return fail(e); }
  const m = openModal({
    title: id ? guestName(g) : "Νέος πελάτης", wide: true,
    footer: `<button type="button" class="btn primary" id="save">Αποθήκευση</button>`,
    body: `${guestFieldsHtml(g, true)}
      <div class="field"><label>Σημειώσεις</label><textarea name="notes">${esc(g.notes)}</textarea></div>
      ${id ? `<h3>Ιστορικό κρατήσεων</h3>${history.length ? `<div class="table-wrap"><table><tbody>${history.map(r => `<tr class="click" data-id="${r.id}">
        <td class="mono">${esc(r.code)}</td><td>${D.fmt(r.check_in)} → ${D.fmt(r.check_out)}</td><td>${r.rooms ? esc(r.rooms.number) : ""} <span class="small muted">${esc(r.room_types && r.room_types.name)}</span></td>
        <td>${badge("status", r.status)}</td><td class="num">${money(r.total_price)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Καμία κράτηση.</p>`}` : ""}`
  });
  $$("tr.click", m.el).forEach(tr => tr.onclick = () => { m.close(); openReservation(Number(tr.dataset.id)); });
  $("#save", m.el).onclick = ev => busy(ev.target, async () => {
    const f = formData($("form", m.el));
    const payload = { ...pickGuest(f), notes: f.notes || null };
    try {
      if (!payload.first_name || !payload.last_name) throw new Error("Συμπλήρωσε όνομα και επώνυμο.");
      if (id) must(await sb.from("guests").update(payload).eq("id", id));
      else must(await sb.from("guests").insert(payload));
      toast("Αποθηκεύτηκε."); m.close(); refresh();
    } catch (e) { fail(e); }
  });
}

// ======================================================================
// Καθαριότητα
// ======================================================================
let hkFilter = "all";
async function viewHousekeeping(main) {
  const rows = must(await sb.rpc("housekeeping_board", { p_date: D.today() }));
  const counts = { dirty: rows.filter(r => r.status === "dirty").length, departing: rows.filter(r => r.departing).length, arriving: rows.filter(r => r.arriving).length };
  const filters = { all: `Όλα (${rows.length})`, dirty: `Βρώμικα (${counts.dirty})`, departing: `Αναχωρήσεις σήμερα (${counts.departing})`, arriving: `Αφίξεις σήμερα (${counts.arriving})` };
  const shown = rows.filter(r => hkFilter === "all" || (hkFilter === "dirty" ? r.status === "dirty" : r[hkFilter]));

  main.innerHTML = `
  <div class="page-head"><h1>Καθαριότητα</h1><button class="btn sm" id="reload">↻ Ανανέωση</button></div>
  <div class="row" style="margin-bottom:1rem">${Object.entries(filters).map(([k, v]) => `<button class="btn sm${k === hkFilter ? " primary" : ""}" data-f="${k}">${v}</button>`).join("")}</div>
  ${!rows.length ? `<div class="alert info">Δεν υπάρχουν δωμάτια ακόμη.</div>` : ""}
  <div class="rooms-grid">${shown.map(r => `
    <div class="room-card st-${r.status}" data-room="${r.room_id}">
      <div class="row"><span class="num">${esc(r.number)}</span><span class="spacer"></span>${badge("room", r.status)}</div>
      <div class="small muted">${esc(r.room_type)}${r.floor ? ` · Όροφος ${esc(r.floor)}` : ""}</div>
      <div class="tags">
        ${r.occupied ? `<span class="badge b-checked_in">Με πελάτες</span>` : `<span class="badge b-gray">Άδειο</span>`}
        ${r.departing ? `<span class="badge b-dirty">Αναχώρηση σήμερα</span>` : ""}
        ${r.arriving ? `<span class="badge b-confirmed">Άφιξη σήμερα</span>` : ""}
      </div>
      <div class="seg">${Object.entries(LBL.room).map(([k, v]) => `<button data-st="${k}" class="${k === r.status ? "on" : ""}">${v}</button>`).join("")}</div>
      <input class="note" placeholder="Σημείωση (π.χ. χαλασμένη λάμπα)" value="${esc(r.notes)}">
    </div>`).join("")}</div>`;

  $("#reload").onclick = refresh;
  $$("[data-f]", main).forEach(b => b.onclick = () => { hkFilter = b.dataset.f; refresh(); });
  $$(".room-card", main).forEach(card => {
    const roomId = Number(card.dataset.room);
    $$("[data-st]", card).forEach(b => b.onclick = async () => {
      try {
        must(await sb.rpc("set_room_status", { p_room: roomId, p_status: b.dataset.st }));
        const room = roomById(roomId); if (room) room.status = b.dataset.st;
        refresh();
      } catch (e) { fail(e); }
    });
    $(".note", card).onchange = async e => {
      try { must(await sb.rpc("set_room_status", { p_room: roomId, p_status: rows.find(r => r.room_id === roomId).status, p_notes: e.target.value })); toast("Η σημείωση αποθηκεύτηκε."); }
      catch (err) { fail(err); }
    };
  });
}

// ======================================================================
// Δωμάτια & τύποι (διαχειριστής)
// ======================================================================
async function viewRooms(main) {
  await loadBase();
  main.innerHTML = `
  <div class="page-head"><h1>Δωμάτια</h1></div>
  <div class="card">
    <div class="row"><h2 style="margin:0">Τύποι δωματίων</h2><span class="spacer"></span><button class="btn primary sm" id="addType">+ Νέος τύπος</button></div>
    <p class="small muted">Π.χ. «Δίκλινο με θέα», «Σουίτα». Η τιμή ανά νύχτα χρησιμοποιείται για τον αυτόματο υπολογισμό και στην online κράτηση.</p>
    ${S.types.length ? `<div class="table-wrap"><table><thead><tr><th>Όνομα</th><th>Άτομα</th><th class="num">Τιμή / νύχτα</th><th>Δωμάτια</th><th>Online</th></tr></thead><tbody>
      ${S.types.map(t => `<tr class="click" data-type="${t.id}"><td><b>${esc(t.name)}</b><div class="small muted">${esc(t.description)}</div></td><td>${t.capacity}</td>
        <td class="num">${money(t.base_price)}</td><td>${S.rooms.filter(r => r.room_type_id === t.id).length}</td><td>${t.active ? "Ναι" : `<span class="muted">Όχι</span>`}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">Δεν υπάρχουν τύποι. Ξεκίνα από εδώ.</div>`}
  </div>
  <div class="card">
    <div class="row"><h2 style="margin:0">Δωμάτια</h2><span class="spacer"></span>
      <button class="btn sm" id="bulk" ${S.types.length ? "" : "disabled"}>+ Πολλά μαζί</button>
      <button class="btn primary sm" id="addRoom" ${S.types.length ? "" : "disabled"}>+ Νέο δωμάτιο</button></div>
    ${S.rooms.length ? `<div class="table-wrap"><table><thead><tr><th>Αριθμός</th><th>Τύπος</th><th>Όροφος</th><th>Κατάσταση</th><th>Ενεργό</th></tr></thead><tbody>
      ${S.rooms.map(r => `<tr class="click" data-room="${r.id}"><td><b>${esc(r.number)}</b></td><td>${esc(typeById(r.room_type_id) ? typeById(r.room_type_id).name : "")}</td>
        <td>${esc(r.floor)}</td><td>${badge("room", r.status)}</td><td>${r.active ? "Ναι" : `<span class="muted">Όχι</span>`}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">Δεν υπάρχουν δωμάτια.</div>`}
  </div>`;
  $("#addType").onclick = () => editType(null);
  $("#addRoom").onclick = () => editRoom(null);
  $("#bulk").onclick = bulkRooms;
  $$("[data-type]", main).forEach(tr => tr.onclick = () => editType(typeById(Number(tr.dataset.type))));
  $$("[data-room]", main).forEach(tr => tr.onclick = () => editRoom(roomById(Number(tr.dataset.room))));
}

function crudModal({ title, body, table, row, toPayload }) {
  const m = openModal({
    title, body,
    footer: `<button type="button" class="btn primary" id="save">Αποθήκευση</button><span class="spacer"></span>
      ${row ? `<button type="button" class="btn danger" id="del">Διαγραφή</button>` : ""}`
  });
  $("#save", m.el).onclick = ev => busy(ev.target, async () => {
    try {
      const payload = toPayload(formData($("form", m.el)), $("form", m.el));
      if (row) must(await sb.from(table).update(payload).eq("id", row.id));
      else must(await sb.from(table).insert(payload));
      toast("Αποθηκεύτηκε."); m.close(); refresh();
    } catch (e) { fail(e); }
  });
  if (row) $("#del", m.el).onclick = ev => busy(ev.target, async () => {
    if (!confirm("Οριστική διαγραφή;")) return;
    try { must(await sb.from(table).delete().eq("id", row.id)); toast("Διαγράφηκε."); m.close(); refresh(); }
    catch (e) { fail(e); }
  });
}

function editType(t) {
  crudModal({
    title: t ? `Τύπος: ${t.name}` : "Νέος τύπος δωματίου", table: "room_types", row: t,
    body: `
      <div class="field"><label>Όνομα *</label><input name="name" value="${esc(t && t.name)}" required></div>
      <div class="field"><label>Περιγραφή (εμφανίζεται στην online κράτηση)</label><textarea name="description">${esc(t && t.description)}</textarea></div>
      <div class="grid">
        <div class="field"><label>Μέγιστα άτομα</label><input type="number" name="capacity" min="1" max="20" value="${t ? t.capacity : 2}"></div>
        <div class="field"><label>Τιμή / νύχτα (€)</label><input type="number" name="base_price" min="0" step="0.01" value="${t ? t.base_price : 0}"></div>
        <div class="field"><label>Σειρά εμφάνισης</label><input type="number" name="sort" value="${t ? t.sort : 0}"></div>
      </div>
      <label class="check"><input type="checkbox" name="active" ${!t || t.active ? "checked" : ""}> Ενεργός (διαθέσιμος για κρατήσεις)</label>`,
    toPayload: (f, form) => {
      if (!f.name) throw new Error("Συμπλήρωσε όνομα.");
      return { name: f.name, description: f.description || null, capacity: Number(f.capacity || 1), base_price: Number(f.base_price || 0), sort: Number(f.sort || 0), active: form.elements.active.checked };
    }
  });
}

function editRoom(r) {
  crudModal({
    title: r ? `Δωμάτιο ${r.number}` : "Νέο δωμάτιο", table: "rooms", row: r,
    body: `
      <div class="grid">
        <div class="field"><label>Αριθμός / όνομα *</label><input name="number" value="${esc(r && r.number)}" required></div>
        <div class="field"><label>Όροφος</label><input name="floor" value="${esc(r && r.floor)}"></div>
      </div>
      <div class="field"><label>Τύπος *</label><select name="room_type_id">${S.types.map(t => `<option value="${t.id}"${r && r.room_type_id === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Κατάσταση</label><select name="status">${options(LBL.room, r ? r.status : "clean")}</select></div>
      <div class="field"><label>Σημειώσεις</label><input name="notes" value="${esc(r && r.notes)}"></div>
      <label class="check"><input type="checkbox" name="active" ${!r || r.active ? "checked" : ""}> Ενεργό</label>`,
    toPayload: (f, form) => {
      if (!f.number) throw new Error("Συμπλήρωσε αριθμό δωματίου.");
      return { number: f.number, floor: f.floor || null, room_type_id: Number(f.room_type_id), status: f.status, notes: f.notes || null, active: form.elements.active.checked };
    }
  });
}

function bulkRooms() {
  const m = openModal({
    title: "Προσθήκη πολλών δωματίων",
    footer: `<button type="button" class="btn primary" id="save">Προσθήκη</button>`,
    body: `<p class="small muted">Π.χ. από 101 έως 110 δημιουργεί 10 δωμάτια.</p>
      <div class="grid">
        <div class="field"><label>Από αριθμό</label><input type="number" name="from" min="1" required></div>
        <div class="field"><label>Έως αριθμό</label><input type="number" name="to" min="1" required></div>
        <div class="field"><label>Όροφος</label><input name="floor"></div>
      </div>
      <div class="field"><label>Τύπος</label><select name="room_type_id">${S.types.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></div>`
  });
  $("#save", m.el).onclick = ev => busy(ev.target, async () => {
    const f = formData($("form", m.el));
    const a = Number(f.from), b = Number(f.to);
    try {
      if (!a || !b || b < a || b - a > 200) throw new Error("Μη έγκυρο εύρος (έως 200 δωμάτια).");
      const rows = [];
      for (let n = a; n <= b; n++) rows.push({ number: String(n), floor: f.floor || null, room_type_id: Number(f.room_type_id) });
      must(await sb.from("rooms").insert(rows));
      toast(`Προστέθηκαν ${rows.length} δωμάτια.`); m.close(); refresh();
    } catch (e) { fail(e); }
  });
}

// ======================================================================
// Χρήστες (διαχειριστής)
// ======================================================================
async function viewUsers(main) {
  const users = must(await sb.from("profiles").select("*").order("created_at"));
  const pending = users.filter(u => !u.role).length;
  main.innerHTML = `
  <div class="page-head"><h1>Χρήστες</h1></div>
  ${pending ? `<div class="alert info">${pending} ${pending === 1 ? "νέος λογαριασμός περιμένει" : "νέοι λογαριασμοί περιμένουν"} έγκριση: διάλεξε ρόλο και πάτα «Αποθήκευση».</div>` : ""}
  <div class="card">
    <p class="small muted">Οι συνάδελφοι δημιουργούν λογαριασμό από τη σελίδα σύνδεσης («Νέος λογαριασμός») και εμφανίζονται εδώ.
      <b>Ρεσεψιόν</b>: κρατήσεις, πελάτες, check-in/out. <b>Καθαριότητα</b>: μόνο κατάσταση δωματίων, χωρίς στοιχεία πελατών. <b>Διαχειριστής</b>: όλα, μαζί με δωμάτια, χρήστες και ρυθμίσεις.</p>
    <div class="table-wrap"><table><thead><tr><th>Όνομα</th><th>Email</th><th>Ρόλος</th><th></th></tr></thead><tbody>
    ${users.map(u => `<tr data-id="${u.id}">
      <td><input name="full_name" value="${esc(u.full_name)}" style="min-width:160px"></td>
      <td class="small">${esc(u.email)}</td>
      <td><select name="role">${options(LBL.role, u.role || "", "Χωρίς πρόσβαση")}</select></td>
      <td class="num"><button class="btn sm" data-save>Αποθήκευση</button></td></tr>`).join("")}
    </tbody></table></div>
  </div>`;
  $$("[data-save]", main).forEach(b => b.onclick = () => busy(b, async () => {
    const tr = b.closest("tr");
    try {
      must(await sb.from("profiles").update({ full_name: $("[name=full_name]", tr).value.trim(), role: $("[name=role]", tr).value || null }).eq("id", tr.dataset.id));
      toast("Αποθηκεύτηκε.");
      if (tr.dataset.id === S.session.user.id) boot(S.session); else refresh();
    } catch (e) { fail(e); }
  }));
}

// ======================================================================
// Ρυθμίσεις (διαχειριστής)
// ======================================================================
async function viewSettings(main) {
  const s = S.settings;
  const portal = new URL("book.html", location.href).href;
  main.innerHTML = `
  <div class="page-head"><h1>Ρυθμίσεις</h1></div>
  <div class="cols">
  <form class="card" id="sf">
    <h2>Στοιχεία ξενοδοχείου</h2>
    <div class="field"><label>Όνομα ξενοδοχείου</label><input name="hotel_name" value="${esc(s.hotel_name)}" required></div>
    <div class="field"><label>Διεύθυνση</label><input name="address" value="${esc(s.address)}"></div>
    <div class="grid">
      <div class="field"><label>Τηλέφωνο</label><input name="phone" value="${esc(s.phone)}"></div>
      <div class="field"><label>Email</label><input name="email" type="email" value="${esc(s.email)}"></div>
      <div class="field"><label>Ώρα check-in</label><input name="check_in_time" type="time" value="${esc(s.check_in_time)}"></div>
      <div class="field"><label>Ώρα check-out</label><input name="check_out_time" type="time" value="${esc(s.check_out_time)}"></div>
    </div>
    <label class="check" style="margin-bottom:1rem"><input type="checkbox" name="online_booking" ${s.online_booking ? "checked" : ""}> Δέχομαι online αιτήματα κράτησης</label>
    <button class="btn primary">Αποθήκευση</button>
  </form>
  <div class="card">
    <h2>Σελίδα πελατών</h2>
    <p>Οι πελάτες κάνουν αίτημα κράτησης, βλέπουν την κράτησή τους και κάνουν online check-in εδώ (ελληνικά & αγγλικά):</p>
    <div class="row" style="flex-wrap:nowrap"><input readonly value="${esc(portal)}" id="purl"><button class="btn" id="copy">Αντιγραφή</button></div>
    <p class="small muted">Βάλε αυτόν τον σύνδεσμο στην ιστοσελίδα σου ή στα email επιβεβαίωσης. Τα online αιτήματα εμφανίζονται στο «Σήμερα» ως «Εκκρεμεί» μέχρι να τα επιβεβαιώσεις.</p>
    <a class="btn" href="${esc(portal)}" target="_blank" rel="noopener">Άνοιγμα</a>
  </div>
  </div>`;
  $("#copy").onclick = async () => { try { await navigator.clipboard.writeText(portal); toast("Αντιγράφηκε."); } catch { $("#purl").select(); } };
  $("#sf").onsubmit = ev => {
    ev.preventDefault();
    return busy($("button.primary", ev.target), async () => {
      const f = formData(ev.target);
      try {
        if (!f.hotel_name) throw new Error("Συμπλήρωσε το όνομα.");
        must(await sb.from("settings").update({ ...nullIfEmpty({ hotel_name: f.hotel_name, address: f.address, phone: f.phone, email: f.email }),
          check_in_time: f.check_in_time || "14:00", check_out_time: f.check_out_time || "11:00", online_booking: ev.target.elements.online_booking.checked }).eq("id", 1));
        toast("Αποθηκεύτηκε.");
        await loadBase(); renderShell(); route();
      } catch (e) { fail(e); }
    });
  };
}

// ======================================================================
// Αιτήματα υπηρεσιών (από τα tablet δωματίων)
// ======================================================================
let reqFilter = "open";
const reqDetails = q => {
  const d = q.details || {};
  return [d.direction && LBL.direction[d.direction], d.flight && `Πτήση/πλοίο: ${d.flight}`, d.destination && `Προορισμός: ${d.destination}`].filter(Boolean);
};
const reqWhen = q => `${q.request_date ? D.fmt(q.request_date, "el", { weekday: "short", day: "numeric", month: "short" }) : "—"}${q.request_time ? ` · ${q.request_time.slice(0, 5)}` : ""}`;

async function viewRequests(main) {
  let query = sb.from("service_requests").select("*, services(name_el, kind), rooms(number)").limit(300);
  if (reqFilter === "open") query = query.in("status", ["new", "confirmed"]).order("request_date", { nullsFirst: false }).order("request_time", { nullsFirst: false });
  else query = query.gte("created_at", D.add(D.today(), -60)).order("created_at", { ascending: false });
  const rows = must(await query);
  const filters = { open: "Ανοιχτά (νέα & επιβεβαιωμένα)", all: "Όλα (60 ημέρες)" };
  main.innerHTML = `
  <div class="page-head"><h1>Αιτήματα υπηρεσιών</h1>
    ${Object.entries(filters).map(([k, v]) => `<button class="btn sm${k === reqFilter ? " primary" : ""}" data-f="${k}">${v}</button>`).join("")}
    <button class="btn sm" id="reload">↻</button></div>
  <div class="card">${!rows.length ? `<div class="empty">Κανένα αίτημα</div>` : `<div class="table-wrap"><table>
    <thead><tr><th>Υπηρεσία</th><th>Δωμάτιο / πελάτης</th><th>Πότε</th><th>Άτομα</th><th>Λεπτομέρειες</th><th class="num">Τιμή</th><th>Κατάσταση</th><th></th></tr></thead><tbody>
    ${rows.map(q => `<tr class="click" data-id="${q.id}">
      <td><b>${esc(q.services && q.services.name_el)}</b><div class="small muted">${esc(LBL.kind[q.services && q.services.kind] || "")}</div></td>
      <td><b>${esc(q.rooms ? q.rooms.number : "—")}</b><div class="small muted">${esc(q.guest_name)}</div></td>
      <td style="white-space:nowrap">${esc(reqWhen(q))}</td>
      <td>${q.persons}</td>
      <td class="small">${reqDetails(q).map(esc).join("<br>")}${q.notes ? `<div class="muted">“${esc(q.notes)}”</div>` : ""}</td>
      <td class="num">${q.price != null ? money(q.price) : `<span class="muted">—</span>`}</td>
      <td>${badge("req", q.status)}<div class="small muted">${new Date(q.created_at).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div></td>
      <td class="num">${q.status === "new" ? `<button class="btn ok sm" data-confirm="${q.id}">Επιβεβαίωση</button>` : q.status === "confirmed" ? `<button class="btn sm" data-done="${q.id}">Ολοκληρώθηκε</button>` : ""}</td>
    </tr>`).join("")}</tbody></table></div>`}</div>`;
  $$("[data-f]", main).forEach(b => b.onclick = () => { reqFilter = b.dataset.f; refresh(); });
  $("#reload").onclick = refresh;
  const setStatus = (id, status, btn) => busy(btn, async () => {
    try { must(await sb.from("service_requests").update({ status }).eq("id", id)); toast("Αποθηκεύτηκε."); refresh(); startRequestWatch(); }
    catch (e) { fail(e); }
  });
  $$("[data-confirm]", main).forEach(b => b.onclick = ev => { ev.stopPropagation(); setStatus(Number(b.dataset.confirm), "confirmed", b); });
  $$("[data-done]", main).forEach(b => b.onclick = ev => { ev.stopPropagation(); setStatus(Number(b.dataset.done), "done", b); });
  $$("tr.click", main).forEach(tr => tr.onclick = () => openRequest(rows.find(q => q.id === Number(tr.dataset.id))));
}

function openRequest(q) {
  const m = openModal({
    title: `${q.services ? q.services.name_el : "Αίτημα"} · Δωμάτιο ${q.rooms ? q.rooms.number : "—"}`,
    footer: `<button type="button" class="btn primary" id="save">Αποθήκευση</button>`,
    body: `
      <p><b>${esc(q.guest_name)}</b> · ${q.persons} άτομα${reqDetails(q).length ? `<br>${reqDetails(q).map(esc).join(" · ")}` : ""}</p>
      ${q.notes ? `<div class="alert info">“${esc(q.notes)}”</div>` : ""}
      <div class="grid">
        <div class="field"><label>Ημερομηνία</label><input type="date" name="request_date" value="${esc(q.request_date)}"></div>
        <div class="field"><label>Ώρα</label><input type="time" name="request_time" value="${esc(q.request_time ? q.request_time.slice(0, 5) : "")}"></div>
        <div class="field"><label>Άτομα</label><input type="number" name="persons" min="1" max="50" value="${q.persons}"></div>
        <div class="field"><label>Τιμή (€)</label><input type="number" name="price" min="0" step="0.01" value="${q.price ?? ""}"></div>
      </div>
      <div class="field"><label>Κατάσταση</label><select name="status">${options(LBL.req, q.status)}</select></div>
      <div class="field"><label>Εσωτερική σημείωση (δεν τη βλέπει ο πελάτης)</label><textarea name="staff_note">${esc(q.staff_note)}</textarea></div>`
  });
  $("#save", m.el).onclick = ev => busy(ev.target, async () => {
    const f = formData($("form", m.el));
    try {
      must(await sb.from("service_requests").update({
        request_date: f.request_date || null, request_time: f.request_time || null, persons: Number(f.persons || 1),
        price: f.price === "" ? null : Number(f.price), status: f.status, staff_note: f.staff_note || null
      }).eq("id", q.id));
      toast("Αποθηκεύτηκε."); m.close(); refresh(); startRequestWatch();
    } catch (e) { fail(e); }
  });
}

// ======================================================================
// Tablet δωματίων (διαχειριστής): αρχική σελίδα, πληροφορίες, υπηρεσίες, συσκευές
// ======================================================================
async function viewTablet(main) {
  await loadBase();
  const [sections, services, tablets] = await Promise.all([
    sb.from("info_sections").select("*").order("sort").order("id"),
    sb.from("services").select("*").order("sort").order("id"),
    sb.from("tablets").select("*")
  ].map(p => p.then(must)));
  const s = S.settings;
  const tabletUrl = new URL("tablet.html", location.href).href;
  const ago = ts => {
    if (!ts) return "—";
    const min = Math.round((Date.now() - new Date(ts)) / 60000);
    return min < 2 ? "τώρα" : min < 60 ? `πριν ${min}'` : new Date(ts).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  main.innerHTML = `
  <div class="page-head"><h1>Tablet δωματίων</h1><a class="btn" href="${esc(tabletUrl)}" target="_blank" rel="noopener">Προεπισκόπηση</a></div>
  <div class="cols">
    <form class="card" id="hf">
      <h2>Αρχική σελίδα</h2>
      <div class="field"><label>Μήνυμα καλωσορίσματος (ελληνικά)</label><textarea name="welcome_el">${esc(s.welcome_el)}</textarea></div>
      <div class="field"><label>Μήνυμα καλωσορίσματος (αγγλικά)</label><textarea name="welcome_en">${esc(s.welcome_en)}</textarea></div>
      <div class="grid">
        <div class="field"><label>Wi‑Fi δίκτυο</label><input name="wifi_name" value="${esc(s.wifi_name)}"></div>
        <div class="field"><label>Wi‑Fi κωδικός</label><input name="wifi_password" value="${esc(s.wifi_password)}"></div>
      </div>
      <div class="field"><label>Φωτογραφία εξωφύλλου (σύνδεσμος https://…)</label><input name="cover_image_url" type="url" value="${esc(s.cover_image_url)}"></div>
      <button class="btn primary">Αποθήκευση</button>
    </form>
    <div class="card">
      <h2>Συσκευές</h2>
      <p class="small muted">Στο tablet άνοιξε <b>${esc(tabletUrl)}</b> (ιδανικά «Προσθήκη στην αρχική οθόνη» για πλήρη οθόνη), πάτα «Κωδικός σύνδεσης» στο δωμάτιο και πληκτρολόγησε τον κωδικό στο tablet μέσα σε 15 λεπτά.</p>
      ${!S.rooms.length ? `<div class="empty">Δεν υπάρχουν δωμάτια.</div>` : `<div class="table-wrap"><table><thead><tr><th>Δωμάτιο</th><th>Tablet</th><th>Τελευταία επαφή</th><th></th></tr></thead><tbody>
      ${S.rooms.filter(r => r.active).map(r => { const tb = tablets.find(x => x.room_id === r.id); const paired = tb && tb.paired_at;
        return `<tr><td><b>${esc(r.number)}</b></td><td>${paired ? `<span class="badge b-clean">Συνδεδεμένο</span>` : `<span class="badge b-gray">Όχι</span>`}</td>
        <td class="small">${paired ? ago(tb.last_seen) : ""}</td>
        <td class="num"><button class="btn sm" data-pair="${r.id}">Κωδικός σύνδεσης</button>${paired ? ` <button class="btn sm danger" data-unpair="${r.id}">Αποσύνδεση</button>` : ""}</td></tr>`; }).join("")}
      </tbody></table></div>`}
    </div>
  </div>
  <div class="card">
    <div class="row"><h2 style="margin:0">Υπηρεσίες</h2><span class="spacer"></span><button class="btn primary sm" id="addSvc">+ Νέα υπηρεσία</button></div>
    <p class="small muted">Transfer, yachting, εκδρομές, spa κ.ά. Ο πελάτης στέλνει αίτημα από το tablet και εμφανίζεται στα «Αιτήματα».</p>
    ${services.length ? `<div class="table-wrap"><table><thead><tr><th>Υπηρεσία</th><th>Κατηγορία</th><th class="num">Τιμή</th><th>Ενεργή</th></tr></thead><tbody>
      ${services.map(v => `<tr class="click" data-svc="${v.id}"><td><b>${esc(v.name_el)}</b><div class="small muted">${esc(v.name_en)}</div></td><td>${esc(LBL.kind[v.kind])}</td>
        <td class="num">${v.price_unit === "on_request" || v.price == null ? `<span class="muted">${LBL.priceUnit.on_request}</span>` : `${money(v.price)} <span class="small muted">${v.price_unit === "per_person" ? "/ άτομο" : ""}</span>`}</td>
        <td>${v.active ? "Ναι" : `<span class="muted">Όχι</span>`}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">Καμία υπηρεσία.</div>`}
  </div>
  <div class="card">
    <div class="row"><h2 style="margin:0">Πληροφορίες ξενοδοχείου</h2><span class="spacer"></span><button class="btn primary sm" id="addSec">+ Νέα ενότητα</button></div>
    <p class="small muted">Π.χ. πρωινό, πισίνα, εστιατόριο, παραλίες, χρήσιμα τηλέφωνα. Εμφανίζονται ως κουμπιά στην αρχική του tablet.</p>
    ${sections.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>Τίτλος</th><th>Κείμενο</th><th>Ενεργή</th></tr></thead><tbody>
      ${sections.map(x => `<tr class="click" data-sec="${x.id}"><td style="font-size:1.4rem">${esc(x.icon)}</td><td><b>${esc(x.title_el)}</b><div class="small muted">${esc(x.title_en)}</div></td>
        <td class="small muted">${esc((x.body_el || "").slice(0, 90))}${(x.body_el || "").length > 90 ? "…" : ""}</td><td>${x.active ? "Ναι" : `<span class="muted">Όχι</span>`}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">Καμία ενότητα.</div>`}
  </div>`;

  $("#hf").onsubmit = ev => {
    ev.preventDefault();
    return busy($("button.primary", ev.target), async () => {
      const f = formData(ev.target);
      try {
        if (f.cover_image_url && !/^https:\/\//i.test(f.cover_image_url)) throw new Error("Ο σύνδεσμος της φωτογραφίας πρέπει να ξεκινά με https://");
        must(await sb.from("settings").update(nullIfEmpty({ welcome_el: f.welcome_el, welcome_en: f.welcome_en, wifi_name: f.wifi_name, wifi_password: f.wifi_password, cover_image_url: f.cover_image_url })).eq("id", 1));
        toast("Αποθηκεύτηκε."); refresh();
      } catch (e) { fail(e); }
    });
  };
  $$("[data-pair]", main).forEach(b => b.onclick = () => busy(b, async () => {
    try {
      const code = must(await sb.rpc("admin_tablet_code", { p_room: Number(b.dataset.pair) }));
      const room = roomById(Number(b.dataset.pair));
      openModal({ title: `Tablet δωματίου ${room ? room.number : ""}`, onClose: refresh, body: `
        <p>Στο tablet άνοιξε:</p><p class="mono" style="word-break:break-all"><b>${esc(tabletUrl)}</b></p>
        <p>και πληκτρολόγησε τον κωδικό:</p>
        <div class="code-box mono">${esc(code)}</div>
        <p class="small muted">Ισχύει για 15 λεπτά και μόνο για μία συσκευή. Αν το δωμάτιο είχε ήδη tablet, αυτό αντικαθίσταται μόλις συνδεθεί το νέο.</p>` });
    } catch (e) { fail(e); }
  }));
  $$("[data-unpair]", main).forEach(b => b.onclick = () => {
    if (!confirm("Αποσύνδεση του tablet από το δωμάτιο; Θα χρειαστεί νέος κωδικός για να ξαναχρησιμοποιηθεί.")) return;
    busy(b, async () => {
      try { must(await sb.rpc("admin_tablet_unpair", { p_room: Number(b.dataset.unpair) })); toast("Αποσυνδέθηκε."); refresh(); }
      catch (e) { fail(e); }
    });
  });
  $("#addSvc").onclick = () => editService(null);
  $("#addSec").onclick = () => editSection(null);
  $$("[data-svc]", main).forEach(tr => tr.onclick = () => editService(services.find(v => v.id === Number(tr.dataset.svc))));
  $$("[data-sec]", main).forEach(tr => tr.onclick = () => editSection(sections.find(x => x.id === Number(tr.dataset.sec))));
}

function editService(v) {
  crudModal({
    title: v ? v.name_el : "Νέα υπηρεσία", table: "services", row: v,
    body: `
      <div class="grid">
        <div class="field"><label>Όνομα (ελληνικά) *</label><input name="name_el" value="${esc(v && v.name_el)}"></div>
        <div class="field"><label>Όνομα (αγγλικά)</label><input name="name_en" value="${esc(v && v.name_en)}"></div>
      </div>
      <div class="field"><label>Περιγραφή (ελληνικά)</label><textarea name="description_el">${esc(v && v.description_el)}</textarea></div>
      <div class="field"><label>Περιγραφή (αγγλικά)</label><textarea name="description_en">${esc(v && v.description_en)}</textarea></div>
      <div class="grid">
        <div class="field"><label>Κατηγορία</label><select name="kind">${options(LBL.kind, v ? v.kind : "transfer")}</select></div>
        <div class="field"><label>Τιμολόγηση</label><select name="price_unit">${options(LBL.priceUnit, v ? v.price_unit : "on_request")}</select></div>
        <div class="field"><label>Τιμή (€)</label><input type="number" name="price" min="0" step="0.01" value="${v && v.price != null ? v.price : ""}"></div>
        <div class="field"><label>Μέγιστα άτομα</label><input type="number" name="max_persons" min="1" max="50" value="${v && v.max_persons ? v.max_persons : ""}"></div>
        <div class="field"><label>Σειρά εμφάνισης</label><input type="number" name="sort" value="${v ? v.sort : 0}"></div>
      </div>
      <div class="field"><label>Φωτογραφία (σύνδεσμος https://…)</label><input name="image_url" type="url" value="${esc(v && v.image_url)}"></div>
      <label class="check"><input type="checkbox" name="active" ${!v || v.active ? "checked" : ""}> Εμφανίζεται στο tablet</label>`,
    toPayload: (f, form) => {
      if (!f.name_el) throw new Error("Συμπλήρωσε όνομα.");
      if (f.image_url && !/^https:\/\//i.test(f.image_url)) throw new Error("Ο σύνδεσμος της φωτογραφίας πρέπει να ξεκινά με https://");
      if (f.price_unit !== "on_request" && f.price === "") throw new Error("Συμπλήρωσε τιμή ή διάλεξε «Κατόπιν επικοινωνίας».");
      return { ...nullIfEmpty({ name_el: f.name_el, name_en: f.name_en, description_el: f.description_el, description_en: f.description_en, image_url: f.image_url }),
        kind: f.kind, price_unit: f.price_unit, price: f.price === "" ? null : Number(f.price),
        max_persons: f.max_persons ? Number(f.max_persons) : null, sort: Number(f.sort || 0), active: form.elements.active.checked };
    }
  });
}

function editSection(x) {
  crudModal({
    title: x ? x.title_el : "Νέα ενότητα πληροφοριών", table: "info_sections", row: x,
    body: `
      <div class="grid">
        <div class="field"><label>Εικονίδιο (emoji)</label><input name="icon" maxlength="8" value="${esc(x ? x.icon : "ℹ️")}"></div>
        <div class="field"><label>Σειρά εμφάνισης</label><input type="number" name="sort" value="${x ? x.sort : 0}"></div>
      </div>
      <div class="grid">
        <div class="field"><label>Τίτλος (ελληνικά) *</label><input name="title_el" value="${esc(x && x.title_el)}"></div>
        <div class="field"><label>Τίτλος (αγγλικά)</label><input name="title_en" value="${esc(x && x.title_en)}"></div>
      </div>
      <div class="field"><label>Κείμενο (ελληνικά)</label><textarea name="body_el" rows="6">${esc(x && x.body_el)}</textarea></div>
      <div class="field"><label>Κείμενο (αγγλικά)</label><textarea name="body_en" rows="6">${esc(x && x.body_en)}</textarea></div>
      <label class="check"><input type="checkbox" name="active" ${!x || x.active ? "checked" : ""}> Εμφανίζεται στο tablet</label>`,
    toPayload: (f, form) => {
      if (!f.title_el) throw new Error("Συμπλήρωσε τίτλο.");
      return { ...nullIfEmpty({ icon: f.icon, title_en: f.title_en, body_el: f.body_el, body_en: f.body_en }), title_el: f.title_el, sort: Number(f.sort || 0), active: form.elements.active.checked };
    }
  });
}

// ======================================================================
// Channel manager (διαχειριστής): σύνδεση με Channex, αντιστοίχιση τύπων δωματίων, ιστορικό
// ======================================================================
let cmRoomTypes = null;   // τύποι δωματίων του Channex από τον τελευταίο έλεγχο σύνδεσης
async function channelCall(action, btn) {
  return busy(btn, async () => {
    const { data, error } = await sb.functions.invoke("channel-sync", { body: { action } });
    if (error) {
      let msg = error.message;
      try { const b = await error.context.json(); if (b && b.error) msg = b.error; } catch {}
      throw new Error(msg);
    }
    if (data && data.ok === false) throw new Error(data.error);
    return data;
  });
}

async function viewChannels(main) {
  await loadBase();
  const [cfg, map, logRows] = await Promise.all([
    sb.rpc("channel_get_settings").then(must),
    sb.from("channel_room_map").select("*").then(must),
    sb.from("channel_log").select("*").order("created_at", { ascending: false }).limit(50).then(must)
  ]);
  const hookUrl = `${HOTEL_CONFIG.url}/functions/v1/channel-sync?token=${cfg.webhook_token}`;
  const dir = { in: "⬇ Κράτηση", out: "⬆ Διαθεσιμότητα", info: "ℹ" };
  const mapFor = id => map.find(m => m.room_type_id === id);

  main.innerHTML = `
  <div class="page-head"><h1>Channel manager</h1>
    ${cfg.enabled ? `<span class="badge b-clean">Ενεργό</span>` : `<span class="badge b-gray">Ανενεργό</span>`}</div>
  <div class="alert info">Οι κρατήσεις από Booking.com, Airbnb, Expedia κ.λπ. μπαίνουν αυτόματα μέσω <b>Channex.io</b>, και κάθε αλλαγή εδώ στέλνει τη διαθεσιμότητα πίσω, ώστε να μη γίνεται overbooking.
    Ο συγχρονισμός γίνεται κάθε 2 λεπτά και αμέσως όταν το Channex στέλνει ειδοποίηση (webhook).</div>
  ${cfg.last_error ? `<div class="alert err"><b>Τελευταίο σφάλμα:</b> ${esc(cfg.last_error)}</div>` : ""}
  <div class="cols">
    <form class="card" id="cf">
      <h2>1. Σύνδεση</h2>
      <div class="field"><label>Περιβάλλον</label><select name="environment">
        <option value="staging"${cfg.environment === "staging" ? " selected" : ""}>Δοκιμαστικό (staging.channex.io)</option>
        <option value="production"${cfg.environment === "production" ? " selected" : ""}>Παραγωγή (app.channex.io)</option></select></div>
      <div class="field"><label>Κλειδί API (Channex → Profile → API Keys)</label>
        <input name="api_key" type="password" autocomplete="off" placeholder="${cfg.has_key ? `Αποθηκευμένο (…${esc(cfg.key_hint)}). Άφησέ το κενό για να μείνει.` : "Επικόλλησε το κλειδί"}"></div>
      <div class="field"><label>Property ID (Channex → Properties)</label><input name="property_id" value="${esc(cfg.property_id)}" autocomplete="off"></div>
      <label class="check" style="margin-bottom:1rem"><input type="checkbox" name="enabled" ${cfg.enabled ? "checked" : ""}> Ενεργός αυτόματος συγχρονισμός</label>
      <div class="row"><button class="btn primary">Αποθήκευση</button><button type="button" class="btn" id="test">Έλεγχος σύνδεσης</button></div>
      <div id="testOut" style="margin-top:.8rem"></div>
    </form>
    <div class="card">
      <h2>Κατάσταση</h2>
      <dl class="kv">
        <dt>Τελευταίος συγχρονισμός</dt><dd>${cfg.last_sync_at ? new Date(cfg.last_sync_at).toLocaleString("el-GR") : "—"}</dd>
        <dt>Αλλαγές προς αποστολή</dt><dd>${cfg.pending}</dd>
      </dl>
      <div class="row" style="margin-top:1rem">
        <button class="btn" id="syncNow" ${cfg.has_key ? "" : "disabled"}>Συγχρονισμός τώρα</button>
        <button class="btn" id="fullPush" ${cfg.has_key ? "" : "disabled"} title="Στέλνει ξανά τη διαθεσιμότητα για τις επόμενες 500 ημέρες">Πλήρης αποστολή διαθεσιμότητας</button>
      </div>
      <h3 style="margin-top:1.2rem">Webhook</h3>
      <p class="small muted">Στο Channex → Webhooks → Create: Event «booking», Callback URL το παρακάτω. Χωρίς webhook οι κρατήσεις έρχονται πάλι, απλώς έως και 2 λεπτά αργότερα.</p>
      <div class="row" style="flex-wrap:nowrap"><input readonly value="${esc(hookUrl)}" id="hook"><button class="btn" id="copyHook">Αντιγραφή</button></div>
      <p class="small"><button class="linkish" id="newToken">Νέο μυστικό token</button> <span class="muted">(αν διέρρευσε ο σύνδεσμος· μετά ενημέρωσε το webhook στο Channex)</span></p>
    </div>
  </div>
  <div class="card">
    <h2>2. Αντιστοίχιση τύπων δωματίων</h2>
    <p class="small muted">Κάθε τύπος δωματίου εδώ πρέπει να αντιστοιχεί σε έναν «Room Type» του Channex. Πάτα πρώτα «Έλεγχος σύνδεσης» για να εμφανιστούν σε λίστα, αλλιώς επικόλλησε το ID του. Κρατήσεις για τύπους χωρίς αντιστοίχιση δεν εισάγονται και εμφανίζονται ως σφάλμα στο ιστορικό.</p>
    ${S.types.length ? `<div class="table-wrap"><table><thead><tr><th>Τύπος εδώ</th><th>Δωμάτια</th><th>Room Type στο Channex</th></tr></thead><tbody>
      ${S.types.map(t => { const m = mapFor(t.id); const cur = m ? m.external_room_type_id : "";
        return `<tr><td><b>${esc(t.name)}</b>${t.active ? "" : ` <span class="small muted">(ανενεργός)</span>`}</td><td>${S.rooms.filter(r => r.room_type_id === t.id && r.active).length}</td>
        <td>${cmRoomTypes ? `<select data-map="${t.id}"><option value="">— Χωρίς αντιστοίχιση —</option>${cmRoomTypes.map(x => `<option value="${esc(x.id)}"${x.id === cur ? " selected" : ""}>${esc(x.title)}</option>`).join("")}${cur && !cmRoomTypes.some(x => x.id === cur) ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ""}</select>`
          : `<input data-map="${t.id}" value="${esc(cur)}" placeholder="Room Type ID" class="mono">`}</td></tr>`; }).join("")}
    </tbody></table></div>
    <button class="btn primary" id="saveMap" style="margin-top:.8rem">Αποθήκευση αντιστοίχισης</button>` : `<div class="empty">Πρόσθεσε πρώτα τύπους δωματίων.</div>`}
  </div>
  <div class="card">
    <h2>Ιστορικό</h2>
    ${logRows.length ? `<div class="table-wrap"><table><thead><tr><th>Πότε</th><th></th><th>Μήνυμα</th></tr></thead><tbody>
      ${logRows.map(l => `<tr><td class="small" style="white-space:nowrap">${new Date(l.created_at).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
        <td class="small" style="white-space:nowrap">${l.ok ? "" : "⚠️ "}${dir[l.direction]}</td><td class="small${l.ok ? "" : " "}" style="${l.ok ? "" : "color:var(--bad)"}">${esc(l.message)}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="empty">Τίποτα ακόμη.</div>`}
  </div>`;

  $("#cf").onsubmit = ev => {
    ev.preventDefault();
    return busy($("button.primary", ev.target), async () => {
      const f = formData(ev.target);
      try {
        const enabled = ev.target.elements.enabled.checked;
        if (enabled && (!f.property_id || (!f.api_key && !cfg.has_key))) throw new Error("Για ενεργοποίηση χρειάζονται κλειδί API και Property ID.");
        must(await sb.rpc("channel_save_settings", { p_environment: f.environment, p_api_key: f.api_key || null, p_property_id: f.property_id, p_enabled: enabled, p_function_url: `${HOTEL_CONFIG.url}/functions/v1/channel-sync` }));
        toast("Αποθηκεύτηκε."); refresh();
      } catch (e) { fail(e); }
    });
  };
  $("#test").onclick = async ev => {
    const out = $("#testOut");
    try {
      const r = await channelCall("test", ev.target);
      cmRoomTypes = r.room_types || [];
      toast(`Σύνδεση με «${r.property || "Channex"}» επιτυχής.`);
      refresh();
    } catch (e) { out.innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; }
  };
  const runAction = (action, okMsg) => async ev => {
    try { const r = await channelCall(action, ev.target); toast(okMsg(r)); refresh(); }
    catch (e) { fail(e); refresh(); }
  };
  $("#syncNow").onclick = runAction("sync", r => `Κρατήσεις: ${r.imported} νέες/αλλαγές${r.failed ? `, ${r.failed} με σφάλμα` : ""} · διαθεσιμότητα: ${r.pushed} εύρη.`);
  $("#fullPush").onclick = runAction("full_push", r => `Στάλθηκαν ${r.pushed} εύρη διαθεσιμότητας.`);
  $("#copyHook").onclick = async () => { try { await navigator.clipboard.writeText(hookUrl); toast("Αντιγράφηκε."); } catch { $("#hook").select(); } };
  $("#newToken").onclick = async () => {
    if (!confirm("Δημιουργία νέου token; Ο παλιός σύνδεσμος webhook θα σταματήσει να λειτουργεί.")) return;
    try { must(await sb.rpc("channel_new_token")); toast("Νέο token."); refresh(); } catch (e) { fail(e); }
  };
  const sm = $("#saveMap");
  if (sm) sm.onclick = () => busy(sm, async () => {
    try {
      const rows = $$("[data-map]", main).map(el => ({ room_type_id: Number(el.dataset.map), external_room_type_id: el.value.trim() }));
      const used = rows.filter(r => r.external_room_type_id).map(r => r.external_room_type_id);
      if (new Set(used).size !== used.length) throw new Error("Δύο τύποι δεν μπορούν να αντιστοιχούν στο ίδιο Room Type του Channex.");
      const clear = rows.filter(r => !r.external_room_type_id).map(r => r.room_type_id);
      if (clear.length) must(await sb.from("channel_room_map").delete().in("room_type_id", clear));
      const keep = rows.filter(r => r.external_room_type_id);
      // Πρώτα αφαιρούνται όσα άλλαξαν, ώστε να μη συγκρουστεί το μοναδικό external_room_type_id.
      const changed = keep.filter(r => { const m = mapFor(r.room_type_id); return m && m.external_room_type_id !== r.external_room_type_id; }).map(r => r.room_type_id);
      if (changed.length) must(await sb.from("channel_room_map").delete().in("room_type_id", changed));
      if (keep.length) must(await sb.from("channel_room_map").upsert(keep));
      toast("Η αντιστοίχιση αποθηκεύτηκε. Πάτα «Πλήρης αποστολή διαθεσιμότητας» για να ενημερωθεί το Channex.");
      refresh();
    } catch (e) { fail(e); }
  });
}
