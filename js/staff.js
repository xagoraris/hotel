// Εφαρμογή προσωπικού: ρεσεψιόν, διοίκηση, καθαριότητα.

const LBL = {
  status: { pending: "Εκκρεμεί", confirmed: "Επιβεβαιωμένη", checked_in: "Στο ξενοδοχείο", checked_out: "Αναχώρησε", cancelled: "Ακυρώθηκε", no_show: "Δεν ήρθε" },
  source: { direct: "Απευθείας", phone: "Τηλέφωνο", email: "Email", online: "Online (ιστοσελίδα)", booking: "Booking.com", airbnb: "Airbnb", expedia: "Expedia", other: "Άλλο" },
  room: { clean: "Καθαρό", dirty: "Βρώμικο", inspect: "Για έλεγχο", out_of_order: "Εκτός λειτουργίας" },
  role: { admin: "Διαχειριστής", reception: "Ρεσεψιόν", housekeeping: "Καθαριότητα" },
  idType: { id_card: "Ταυτότητα", passport: "Διαβατήριο", other: "Άλλο" },
  req: { new: "Νέο", confirmed: "Επιβεβαιωμένο", done: "Ολοκληρώθηκε", cancelled: "Ακυρώθηκε" },
  kind: { transfer: "Transfer", rental: "Ενοικίαση αυτοκινήτου / ATV", yachting: "Yachting / κρουαζιέρα", tour: "Εκδρομή", spa: "Spa", restaurant: "Εστιατόριο", other: "Άλλο" },
  order: { new: "Νέα", preparing: "Ετοιμάζεται", delivered: "Παραδόθηκε", cancelled: "Ακυρώθηκε" },
  priceUnit: { per_booking: "Ανά κράτηση", per_person: "Ανά άτομο", on_request: "Κατόπιν επικοινωνίας" },
  direction: { to_airport: "Προς αεροδρόμιο", from_airport: "Από αεροδρόμιο", to_port: "Προς λιμάνι", from_port: "Από λιμάνι", other: "Άλλη διαδρομή" }
};
const REQ_CLS = { new: "pending", confirmed: "confirmed", done: "checked_in", cancelled: "cancelled" };
const ORD_CLS = { new: "pending", preparing: "confirmed", delivered: "checked_in", cancelled: "cancelled" };
const badge = (kind, key) => `<span class="badge b-${esc(kind === "req" ? REQ_CLS[key] : kind === "order" ? ORD_CLS[key] : key)}">${esc(LBL[kind][key] || key)}</span>`;
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
  orders:       { title: "Παραγγελίες",  roles: FRONT,                       render: viewOrders },
  dining:       { title: "Εστίαση",      roles: FRONT,                       render: viewDining },
  guests:       { title: "Πελάτες",      roles: FRONT,                       render: viewGuests },
  housekeeping: { title: "Καθαριότητα",  roles: [...FRONT, "housekeeping"],  render: viewHousekeeping },
  rooms:        { title: "Δωμάτια",      roles: ["admin"],                   render: viewRooms },
  tablet:       { title: "Tablet",       roles: ["admin"],                   render: viewTablet },
  channels:     { title: "Κανάλια",      roles: ["admin"],                   render: viewChannels },
  roots:        { title: "Roots",        roles: ["admin"],                   render: viewRoots },
  stats:        { title: "Στατιστικά",   roles: ["admin"],                   render: viewStats },
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

// Έλεγχος για νέα αιτήματα και παραγγελίες από τα δωμάτια (κάθε 20'').
let reqWatch = null, lastNewCount = null, lastNewOrders = null;
function startRequestWatch() {
  clearInterval(reqWatch);
  lastNewCount = null; lastNewOrders = null;
  const check = async () => {
    if (!S.profile || !FRONT.includes(role())) return clearInterval(reqWatch);
    const [rq, od] = await Promise.all([
      sb.from("service_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
      sb.from("orders").select("id", { count: "exact", head: true }).eq("status", "new")
    ]);
    if (!rq.error) {
      const count = rq.count;
      const a = $('.nav a[data-route="requests"]');
      if (a) a.innerHTML = `Αιτήματα${count ? ` <span class="badge b-pending">${count}</span>` : ""}`;
      if (lastNewCount !== null && count > lastNewCount) {
        toast("Νέο αίτημα υπηρεσίας από δωμάτιο.");
        beep();
        if (location.hash === "#requests") refresh();
      }
      lastNewCount = count;
    }
    if (!od.error) {
      const count = od.count;
      const a = $('.nav a[data-route="orders"]');
      if (a) a.innerHTML = `Παραγγελίες${count ? ` <span class="badge b-pending">${count}</span>` : ""}`;
      if (lastNewOrders !== null && count > lastNewOrders) {
        toast("Νέα παραγγελία εστίασης.");
        beep(); setTimeout(beep, 350);
        if (location.hash === "#orders") refresh();
      }
      lastNewOrders = count;
    }
  };
  check();
  reqWatch = setInterval(check, 20000);
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
// Υπόλοιπο = διαμονή + έξτρα χρεώσεις δωματίου (εστίαση κ.λπ.) − πληρωμένα.
const balance = r => Number(r.total_price || 0) + Number(r.extras || 0) - Number(r.paid || 0);
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
      ${id ? `<div id="charges"></div>` : ""}
      <div class="field"><label>Σημειώσεις</label><textarea name="notes">${esc(r.notes)}</textarea></div>
    </fieldset>`
  });
  const form = $("form", m.el);
  const el = n => form.elements[n];

  const updateBalance = () => { $("#bal", form).textContent = money(Number(el("total_price").value || 0) + Number(r.extras || 0) - Number(el("paid").value || 0)); };
  // Έξτρα χρεώσεις δωματίου (παραγγελίες εστίασης, minibar κ.λπ.)
  const loadCharges = async () => {
    const box = $("#charges", form); if (!box) return;
    const rows = must(await sb.from("reservation_charges").select("*").eq("reservation_id", id).order("created_at"));
    box.innerHTML = `<div class="small" style="margin:.2rem 0 .8rem">
      <b>Έξτρα χρεώσεις δωματίου: ${money(r.extras || 0)}</b>
      ${rows.length ? `<table class="small" style="margin-top:.3rem"><tbody>${rows.map(c => `<tr><td class="muted" style="white-space:nowrap">${new Date(c.created_at).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td><td>${esc(c.description)}</td><td class="num"${Number(c.amount) < 0 ? ' style="color:var(--bad)"' : ""}>${money(c.amount)}</td></tr>`).join("")}</tbody></table>` : ""}
      <div class="row" style="margin-top:.4rem;flex-wrap:nowrap"><input id="chDesc" placeholder="Περιγραφή (π.χ. Minibar, διόρθωση)" maxlength="120"><input id="chAmt" type="number" step="0.01" placeholder="€" style="max-width:7rem"><button type="button" class="btn sm" id="chAdd">+ Χρέωση</button></div>
      <div class="muted">Αρνητικό ποσό για διόρθωση/έκπτωση. Οι παραγγελίες «Χρέωση στο δωμάτιο» μπαίνουν αυτόματα με την παράδοση.</div></div>`;
    $("#chAdd", box).onclick = ev => busy(ev.target, async () => {
      const desc = $("#chDesc", box).value.trim(), amt = Number($("#chAmt", box).value);
      if (!desc || !amt) return toast("Συμπλήρωσε περιγραφή και ποσό.", "err");
      try {
        must(await sb.from("reservation_charges").insert({ reservation_id: id, description: desc, amount: amt }));
        r.extras = must(await sb.from("reservations").select("extras").eq("id", id).single()).extras;
        updateBalance(); await loadCharges();
      } catch (e) { fail(e); }
    });
  };
  loadCharges().catch(fail);
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
      if (target === "checked_out" && balance({ total_price: f.total_price, extras: r.extras, paid: f.paid }) > 0 &&
          !confirm(`Υπάρχει υπόλοιπο ${money(balance({ total_price: f.total_price, extras: r.extras, paid: f.paid }))}. Συνέχεια με check-out;`)) return;

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
  <form class="card" id="bf">
    <h2>Ταυτότητα (οθόνες πελάτη)</h2>
    <p class="small muted">Χρώματα και λογότυπο για το tablet, την τηλεόραση, το κινητό (QR) και τις τυπωμένες κάρτες QR.</p>
    <div class="grid">
      <div class="field"><label>Κύριο χρώμα</label><input type="color" name="brand_color" value="${esc(s.brand_color || "#16324F")}"></div>
      <div class="field"><label>Δευτερεύον χρώμα (τιμές, λεπτομέρειες)</label><input type="color" name="accent_color" value="${esc(s.accent_color || "#B8894A")}"></div>
    </div>
    <div class="field"><label>Λογότυπο (σύνδεσμος https://…, ιδανικά PNG/SVG με διάφανο φόντο)</label><input type="url" name="logo_url" value="${esc(s.logo_url)}"></div>
    <div class="row"><button class="btn primary">Αποθήκευση</button><button type="button" class="btn" id="brandReset">Επαναφορά προεπιλογών</button></div>
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
  const saveBrand = (row, btn) => busy(btn, async () => {
    try { must(await sb.from("settings").update(row).eq("id", 1)); toast("Αποθηκεύτηκε."); await loadBase(); route(); } catch (e) { fail(e); }
  });
  $("#bf").onsubmit = ev => {
    ev.preventDefault();
    const f = formData(ev.target);
    if (f.logo_url && !/^https:\/\//i.test(f.logo_url)) return toast("Ο σύνδεσμος του λογοτύπου πρέπει να ξεκινά με https://", "err");
    saveBrand({ brand_color: f.brand_color, accent_color: f.accent_color, logo_url: f.logo_url || null }, $("button.primary", ev.target));
  };
  $("#brandReset").onclick = ev => saveBrand({ brand_color: null, accent_color: null, logo_url: null }, ev.target);
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
      <td><b>${esc(q.rooms ? q.rooms.number : "—")}</b>${q.via_qr ? ` <span class="small muted" title="Από το κινητό του πελάτη (QR)">📱</span>` : ""}<div class="small muted">${esc(q.guest_name)}</div></td>
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
// Splendour Roots (διαχειριστής): θεματικές διαδρομές, σημεία ενδιαφέροντος, ρυθμίσεις οδηγού
// ======================================================================
const ROOTS_CAT = { start: "Αφετηρία", archaeology: "Αρχαιολογικός χώρος", museum: "Μουσείο", church: "Εκκλησία", castle: "Κάστρο",
  village: "Χωριό", architecture: "Αρχιτεκτονική", culture: "Πολιτισμός", nature: "Φύση" };
const ROOTS_ACCESS = { walk: "Με τα πόδια", car: "Με αυτοκίνητο", boat: "Με καραβάκι" };
const ROOTS_MODE = { walk: "Περπάτημα", car: "Αυτοκίνητο", mixed: "Μικτή (αυτοκίνητο/καραβάκι)" };
const ROUTE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

async function viewRoots(main) {
  const [routes, pois, stops] = await Promise.all([
    sb.from("roots_routes").select("*").order("sort").order("id"),
    sb.from("roots_pois").select("*").order("sort").order("id"),
    sb.from("roots_route_stops").select("*").order("route_id").order("seq")
  ].map(q => q.then(must)));
  const s = S.settings;
  const url = new URL("roots.html", location.href).href;
  const poiName = id => { const p = pois.find(x => x.id === id); return p ? p.name_el : "?"; };
  main.innerHTML = `
  <div class="page-head"><h1>${esc(s.roots_title || "Roots")}</h1><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">Άνοιγμα οδηγού</a>
    <button class="btn" id="rootsQr">QR για τη ρεσεψιόν</button></div>
  <p class="small muted">Ψηφιακός πολιτιστικός οδηγός: δημόσιος (χωρίς σύνδεση), στα ελληνικά και αγγλικά. Ανοίγει από την οθόνη δωματίου («Ανακαλύψτε τη Σαντορίνη»), από QR ή από την ιστοσελίδα σας: <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>
  <div class="cols">
    <form class="card" id="rsf">
      <h2>Ρυθμίσεις οδηγού</h2>
      <div class="field"><label>Τίτλος</label><input name="roots_title" value="${esc(s.roots_title)}" placeholder="π.χ. Splendour Roots"></div>
      <div class="grid">
        <div class="field"><label>Θέση ξενοδοχείου: γεωγρ. πλάτος</label><input name="hotel_lat" type="number" step="0.000001" value="${s.hotel_lat ?? ""}" placeholder="36.4245"></div>
        <div class="field"><label>γεωγρ. μήκος</label><input name="hotel_lng" type="number" step="0.000001" value="${s.hotel_lng ?? ""}" placeholder="25.4270"></div>
      </div>
      <p class="small muted">Από εδώ μετρούν οι αποστάσεις όταν ο επισκέπτης δεν δίνει τη θέση του. Στο Google Maps: δεξί κλικ πάνω στο ξενοδοχείο → αντιγραφή συντεταγμένων.</p>
      <button class="btn primary">Αποθήκευση</button>
    </form>
    <div class="card">
      <h2>Περιεχόμενο</h2>
      <p class="small">Τα αρχικά κείμενα είναι <b>πρώτη μορφή για έλεγχο</b>: διαβάστε τα, διορθώστε ό,τι χρειάζεται και προσθέστε φωτογραφίες (δικές σας ή με άδεια χρήσης) και, αν θέλετε, ηχογραφημένες αφηγήσεις. Χωρίς ηχογράφηση, το κουμπί «Ακούστε» διαβάζει το κείμενο με τη φωνή της συσκευής.</p>
      <p class="small">Οι συντεταγμένες είναι κατά προσέγγιση: επαληθεύστε τις επιτόπου, ειδικά για τα σημεία που θα χρησιμοποιηθούν στην επαυξημένη πραγματικότητα (AR).</p>
    </div>
  </div>
  <div class="card">
    <div class="row"><h2 style="margin:0">Θεματικές διαδρομές</h2><span class="spacer"></span><button class="btn primary sm" id="addRoute">+ Νέα διαδρομή</button></div>
    <div class="table-wrap"><table><tbody>${routes.map(r => `<tr class="click" data-route="${r.id}">
      <td style="width:6px;background:${esc(r.color || "#ccc")}"></td>
      <td><b>${esc(r.icon || "")} ${esc(r.title_el)}</b>${r.active ? "" : ` <span class="badge b-gray">Κρυφή</span>`}<div class="small muted">${esc(r.duration_el || "")} · ${esc(ROOTS_MODE[r.mode])}</div></td>
      <td class="small">${stops.filter(x => x.route_id === r.id).map(x => esc(poiName(x.poi_id))).join(" → ") || `<span class="muted">Χωρίς στάσεις</span>`}</td></tr>`).join("")}</tbody></table></div>
  </div>
  <div class="card">
    <div class="row"><h2 style="margin:0">Σημεία ενδιαφέροντος</h2><span class="spacer"></span><button class="btn primary sm" id="addPoi">+ Νέο σημείο</button></div>
    <div class="table-wrap"><table><thead><tr><th>Σημείο</th><th>Κατηγορία</th><th>Πρόσβαση</th><th>Μέσα</th><th>AR</th></tr></thead><tbody>${pois.map(p => `<tr class="click" data-poi="${p.id}">
      <td><b>${esc(p.name_el)}</b>${p.active ? "" : ` <span class="badge b-gray">Κρυφό</span>`}<div class="small muted">${esc(p.name_en || "")}</div></td>
      <td class="small">${esc(ROOTS_CAT[p.category])}</td><td class="small">${esc(ROOTS_ACCESS[p.access])}</td>
      <td class="small">${[p.image_url || p.gallery.length ? "📷" : "", p.audio_el_url || p.audio_en_url ? "🎧" : ""].join(" ") || `<span class="muted">—</span>`}</td>
      <td class="small">${p.ar_enabled ? (p.ar_verified ? `<span class="badge b-clean">Επαληθευμένο</span>` : `<span class="badge b-pending">Προς έλεγχο</span>`) : `<span class="muted">—</span>`}</td></tr>`).join("")}</tbody></table></div>
  </div>`;

  $("#rsf").onsubmit = ev => {
    ev.preventDefault();
    const f = formData(ev.target);
    return busy($("button.primary", ev.target), async () => {
      try {
        const lat = f.hotel_lat === "" ? null : Number(f.hotel_lat), lng = f.hotel_lng === "" ? null : Number(f.hotel_lng);
        if ((lat == null) !== (lng == null)) throw new Error("Συμπλήρωσε και τις δύο συντεταγμένες (ή καμία).");
        must(await sb.from("settings").update({ roots_title: f.roots_title || null, hotel_lat: lat, hotel_lng: lng }).eq("id", 1));
        toast("Αποθηκεύτηκε."); await loadBase(); refresh();
      } catch (e) { fail(e); }
    });
  };
  $("#rootsQr").onclick = ev => busy(ev.target, async () => {
    try {
      const w = window.open("", "_blank");
      if (!w) throw new Error("Ο browser μπλόκαρε το νέο παράθυρο. Επίτρεψε τα αναδυόμενα για αυτή τη σελίδα.");
      w.document.write(`<!doctype html><html lang="el"><head><meta charset="utf-8"><title>QR ${esc(s.roots_title || "Roots")}</title><style>
        body{font-family:system-ui,sans-serif;text-align:center;color:${s.brand_color || "#16324F"};padding:20mm} svg{width:90mm;height:90mm}
        h1{font-size:26pt;margin:0} p{font-size:14pt} .bar{margin-bottom:10mm} @media print{.bar{display:none}}</style></head><body>
        <div class="bar"><button onclick="print()">Εκτύπωση</button></div>
        <h1>${esc(s.roots_title || "Roots")}</h1><p>Ανακαλύψτε τη Σαντορίνη · Discover Santorini</p>${await qrSvg(url)}
        <p>Πολιτιστικές διαδρομές, χάρτης και αφηγήσεις<br>Cultural routes, map & audio stories</p></body></html>`);
      w.document.close();
    } catch (e) { fail(e); }
  });
  $("#addRoute").onclick = () => editRoute(null, pois, stops, routes);
  $("#addPoi").onclick = () => editPoi(null);
  $$("[data-route]", main).forEach(tr => tr.onclick = () => editRoute(routes.find(r => r.id === Number(tr.dataset.route)), pois, stops, routes));
  $$("[data-poi]", main).forEach(tr => tr.onclick = () => editPoi(pois.find(p => p.id === Number(tr.dataset.poi))));
}

function editRoute(r, pois, stops, routes) {
  const cur = r ? stops.filter(x => x.route_id === r.id).sort((a, b) => a.seq - b.seq).map(x => x.poi_id) : [];
  const color = r ? r.color : ROUTE_COLORS[routes.length % ROUTE_COLORS.length];
  const poiOpts = sel => pois.map(p => `<option value="${p.id}"${p.id === sel ? " selected" : ""}>${esc(p.name_el)}</option>`).join("");
  const stopRow = id => `<div class="row rstop" style="flex-wrap:nowrap;margin:.25rem 0"><span class="small muted rnum"></span><select class="rpoi">${poiOpts(id)}</select>
    <button type="button" class="btn sm" data-up title="Πάνω">↑</button><button type="button" class="btn sm" data-down title="Κάτω">↓</button><button type="button" class="btn sm danger" data-rm title="Αφαίρεση">✕</button></div>`;
  const m = openModal({ title: r ? r.title_el : "Νέα διαδρομή", wide: true,
    footer: `<button type="button" class="btn primary" id="rsave">Αποθήκευση</button>`,
    body: `
    <div class="grid">
      <div class="field"><label>Τίτλος (ελληνικά) *</label><input name="title_el" value="${esc(r && r.title_el)}"></div>
      <div class="field"><label>Τίτλος (αγγλικά)</label><input name="title_en" value="${esc(r && r.title_en)}"></div>
      <div class="field"><label>Εικονίδιο (emoji)</label><input name="icon" maxlength="8" value="${esc(r ? r.icon : "🧭")}"></div>
      <div class="field"><label>Χρώμα στον χάρτη</label><select name="color">${ROUTE_COLORS.map(c => `<option value="${c}"${c === color ? " selected" : ""} style="background:${c};color:#fff">${c}</option>`).join("")}</select></div>
    </div>
    <div class="field"><label>Εισαγωγή (ελληνικά)</label><textarea name="intro_el" rows="3">${esc(r && r.intro_el)}</textarea></div>
    <div class="field"><label>Εισαγωγή (αγγλικά)</label><textarea name="intro_en" rows="3">${esc(r && r.intro_en)}</textarea></div>
    <div class="grid">
      <div class="field"><label>Διάρκεια (ελληνικά)</label><input name="duration_el" value="${esc(r && r.duration_el)}" placeholder="π.χ. Μισή ημέρα"></div>
      <div class="field"><label>Διάρκεια (αγγλικά)</label><input name="duration_en" value="${esc(r && r.duration_en)}" placeholder="e.g. Half a day"></div>
      <div class="field"><label>Μετακίνηση</label><select name="mode">${options(ROOTS_MODE, r ? r.mode : "car")}</select></div>
      <div class="field"><label>Σειρά</label><input type="number" name="sort" value="${r ? r.sort : routes.length + 1}"></div>
    </div>
    <fieldset><legend>Στάσεις (με τη σειρά)</legend><div id="rstops">${cur.map(stopRow).join("")}</div>
      <button type="button" class="btn sm" id="addStop">+ Στάση</button></fieldset>
    <label class="check"><input type="checkbox" name="active" ${!r || r.active ? "checked" : ""}> Εμφανίζεται στον οδηγό</label>` });
  const box = $("#rstops", m.el);
  const renumber = () => $$(".rnum", box).forEach((x, i) => x.textContent = i + 1 + ".");
  const wire = row => {
    $("[data-up]", row).onclick = () => { if (row.previousElementSibling) box.insertBefore(row, row.previousElementSibling); renumber(); };
    $("[data-down]", row).onclick = () => { if (row.nextElementSibling) box.insertBefore(row.nextElementSibling, row); renumber(); };
    $("[data-rm]", row).onclick = () => { row.remove(); renumber(); };
  };
  $$(".rstop", box).forEach(wire); renumber();
  $("#addStop", m.el).onclick = () => { box.insertAdjacentHTML("beforeend", stopRow(null)); wire(box.lastElementChild); renumber(); };
  $("#rsave", m.el).onclick = ev => busy(ev.target, async () => {
    const form = $("form", m.el), f = formData(form);
    try {
      if (!f.title_el) throw new Error("Συμπλήρωσε τίτλο.");
      const row = { title_el: f.title_el, title_en: f.title_en || null, icon: f.icon || null, color: f.color, intro_el: f.intro_el || null, intro_en: f.intro_en || null,
        duration_el: f.duration_el || null, duration_en: f.duration_en || null, mode: f.mode, sort: Number(f.sort || 0), active: form.elements.active.checked };
      let id = r && r.id;
      if (id) must(await sb.from("roots_routes").update(row).eq("id", id));
      else id = must(await sb.from("roots_routes").insert(row).select("id").single()).id;
      const ids = $$(".rpoi", box).map(x => Number(x.value));
      must(await sb.rpc("admin_roots_set_stops", { p_route: id, p_pois: ids }));
      toast("Αποθηκεύτηκε."); m.close(); refresh();
    } catch (e) { fail(e); }
  });
}

function editPoi(p) {
  crudModal({
    title: p ? p.name_el : "Νέο σημείο ενδιαφέροντος", table: "roots_pois", row: p,
    body: `
    <div class="grid">
      <div class="field"><label>Όνομα (ελληνικά) *</label><input name="name_el" value="${esc(p && p.name_el)}"></div>
      <div class="field"><label>Όνομα (αγγλικά)</label><input name="name_en" value="${esc(p && p.name_en)}"></div>
      <div class="field"><label>Κατηγορία</label><select name="category">${options(ROOTS_CAT, p ? p.category : "culture")}</select></div>
      <div class="field"><label>Πρόσβαση</label><select name="access">${options(ROOTS_ACCESS, p ? p.access : "car")}</select></div>
      <div class="field"><label>Γεωγρ. πλάτος *</label><input name="lat" type="number" step="0.000001" value="${p ? p.lat : ""}"></div>
      <div class="field"><label>Γεωγρ. μήκος *</label><input name="lng" type="number" step="0.000001" value="${p ? p.lng : ""}"></div>
    </div>
    ${p ? `<p class="small"><a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener">Δες τη θέση στο Google Maps ↗</a></p>` : ""}
    <div class="field"><label>Σύντομη περιγραφή (ελληνικά)</label><input name="short_el" value="${esc(p && p.short_el)}" maxlength="160"></div>
    <div class="field"><label>Σύντομη περιγραφή (αγγλικά)</label><input name="short_en" value="${esc(p && p.short_en)}" maxlength="160"></div>
    <div class="field"><label>Κείμενο / αφήγηση (ελληνικά)</label><textarea name="body_el" rows="6">${esc(p && p.body_el)}</textarea></div>
    <div class="field"><label>Κείμενο / αφήγηση (αγγλικά)</label><textarea name="body_en" rows="6">${esc(p && p.body_en)}</textarea></div>
    <div class="grid">
      <div class="field"><label>Πληροφορίες επίσκεψης (ελληνικά)</label><input name="hours_el" value="${esc(p && p.hours_el)}" placeholder="ωράριο, εισιτήριο…"></div>
      <div class="field"><label>Πληροφορίες επίσκεψης (αγγλικά)</label><input name="hours_en" value="${esc(p && p.hours_en)}"></div>
    </div>
    <div class="field"><label>Φωτογραφία (https://…)</label><input name="image_url" type="url" value="${esc(p && p.image_url)}"></div>
    <div class="field"><label>Περισσότερες φωτογραφίες (μία https://… ανά γραμμή)</label><textarea name="gallery" rows="2">${esc(p && p.gallery ? p.gallery.join("\n") : "")}</textarea></div>
    <div class="grid">
      <div class="field"><label>Ηχογραφημένη αφήγηση ελληνικά (https://….mp3)</label><input name="audio_el_url" type="url" value="${esc(p && p.audio_el_url)}"></div>
      <div class="field"><label>Ηχογραφημένη αφήγηση αγγλικά (https://….mp3)</label><input name="audio_en_url" type="url" value="${esc(p && p.audio_en_url)}"></div>
      <div class="field"><label>Σειρά</label><input type="number" name="sort" value="${p ? p.sort : 100}"></div>
    </div>
    <div class="row">
      <label class="check"><input type="checkbox" name="active" ${!p || p.active ? "checked" : ""}> Εμφανίζεται στον οδηγό</label>
      <label class="check"><input type="checkbox" name="ar_enabled" ${p && p.ar_enabled ? "checked" : ""}> Ετικέτα στην κάμερα (AR)</label>
      <label class="check"><input type="checkbox" name="ar_verified" ${p && p.ar_verified ? "checked" : ""}> Η θέση επαληθεύτηκε επιτόπου</label>
    </div>`,
    toPayload: (f, form) => {
      if (!f.name_el) throw new Error("Συμπλήρωσε όνομα.");
      const lat = Number(f.lat), lng = Number(f.lng);
      if (f.lat === "" || f.lng === "" || !(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) throw new Error("Συμπλήρωσε σωστές συντεταγμένες.");
      const https = u => !u || /^https:\/\//i.test(u);
      const gallery = (f.gallery || "").split(/\s*\n\s*/).map(x => x.trim()).filter(Boolean);
      if (![f.image_url, f.audio_el_url, f.audio_en_url, ...gallery].every(https)) throw new Error("Οι σύνδεσμοι πρέπει να ξεκινούν με https://");
      const e = form.elements;
      return { ...nullIfEmpty({ name_en: f.name_en, short_el: f.short_el, short_en: f.short_en, body_el: f.body_el, body_en: f.body_en, hours_el: f.hours_el, hours_en: f.hours_en,
          image_url: f.image_url, audio_el_url: f.audio_el_url, audio_en_url: f.audio_en_url }),
        name_el: f.name_el, category: f.category, access: f.access, lat, lng, gallery, sort: Number(f.sort || 0),
        active: e.active.checked, ar_enabled: e.ar_enabled.checked, ar_verified: e.ar_verified.checked };
    }
  });
}

// ======================================================================
// Στατιστικά χρήσης (διαχειριστής): συγκεντρωτικά, χωρίς στοιχεία επισκεπτών
// ======================================================================
let statsDays = 30;
async function viewStats(main) {
  const to = D.today(), from = D.add(to, -(statsDays - 1));
  const [st, rs] = await Promise.all([
    sb.rpc("admin_stats", { p_from: from, p_to: to }).then(must),
    sb.rpc("admin_roots_stats", { p_from: from, p_to: to }).then(must, () => null)
  ]);
  const o = st.opens, totalOpens = o.tablet + o.tv + o.qr, od = st.orders, rq = st.requests;
  const pct = (a, b) => b ? Math.round(a * 100 / b) + "%" : "—";
  const tile = (label, value, sub) => `<div class="stat"><div class="small muted">${esc(label)}</div><div style="font-size:1.6rem;font-weight:800">${value}</div>${sub ? `<div class="small muted">${sub}</div>` : ""}</div>`;
  const table = (head, rows) => rows.length ? `<div class="table-wrap"><table><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ""}>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<div class="empty">Δεν υπάρχουν δεδομένα ακόμη.</div>`;
  const periods = { 7: "7 ημέρες", 30: "30 ημέρες", 90: "90 ημέρες", 365: "12 μήνες" };

  main.innerHTML = `
  <div class="page-head"><h1>Στατιστικά</h1>
    ${Object.entries(periods).map(([k, v]) => `<button class="btn sm${Number(k) === statsDays ? " primary" : ""}" data-days="${k}">${v}</button>`).join("")}</div>
  <p class="small muted">${D.fmt(from, "el", { day: "numeric", month: "short", year: "numeric" })} – ${D.fmt(to, "el", { day: "numeric", month: "short", year: "numeric" })} ·
    Μόνο συγκεντρωτικοί αριθμοί: δεν καταγράφεται ποιος πελάτης ή ποιο δωμάτιο έκανε τι.</p>
  <div class="stats">
    ${tile("Ανοίγματα οθόνης δωματίου", totalOpens, `Tablet ${o.tablet} · TV ${o.tv} · Κινητό ${o.qr}`)}
    ${tile("Συνδέσεις μέσω QR", st.qr_logins, `σε ${st.stays} διαμονές της περιόδου`)}
    ${tile("Αιτήματα υπηρεσιών", rq.total, `ολοκληρώθηκαν ${rq.done} · από κινητό ${pct(rq.qr, rq.total)}`)}
    ${tile("Παραγγελίες εστίασης", od.total, `παραδόθηκαν ${od.delivered} · στην πισίνα ${od.pool}`)}
    ${tile("Έσοδα εστίασης", money(od.revenue), `χρέωση δωματίου ${pct(od.to_room, od.delivered)} · μέση αξία ${od.delivered ? money(od.revenue / od.delivered) : "—"}`)}
    ${tile("Μέσος χρόνος παράδοσης", od.avg_minutes != null ? `${od.avg_minutes}′` : "—", "από την παραγγελία ως την παράδοση")}
  </div>
  <div class="card">
    <h2>Ανοίγματα ανά ημέρα</h2>
    <div id="chart" class="chart"></div>
    <details style="margin-top:.6rem"><summary class="small">Πίνακας</summary>
      ${table(["Ημέρα", "Ανοίγματα", "Παραγγελίες", "Αιτήματα"], st.daily.slice().reverse().map(d => [esc(D.fmt(d.day, "el", { weekday: "short", day: "numeric", month: "short" })), d.opens, d.orders, d.requests]))}</details>
  </div>
  <div class="cols">
    <div class="card"><h2>Δημοφιλείς υπηρεσίες</h2>
      ${table(["Υπηρεσία", "Προβολές", "Αιτήματα", "Αξία"], st.services.map(x => [`${esc(x.name)}<div class="small muted">${esc(LBL.kind[x.kind] || "")}</div>`, x.views, x.requests, x.value ? money(x.value) : "—"]))}</div>
    <div class="card"><h2>Δημοφιλή πιάτα & ποτά</h2>
      ${table(["Προϊόν", "Τεμάχια", "Αξία"], st.items.map(x => [esc(x.name), x.qty, money(x.value)]))}</div>
  </div>
  <div class="cols">
    <div class="card"><h2>Κατηγορίες υπηρεσιών (προβολές)</h2>${table(["Κατηγορία", "Προβολές"], st.categories.map(x => [esc(LBL.kind[x.kind] || x.kind), x.n]))}</div>
    <div class="card"><h2>Πληροφορίες & εστίαση (προβολές)</h2>${table(["Ενότητα", "Προβολές"], [...st.sections.map(x => [esc(x.name), x.n]), ...st.outlets.map(x => [`🍽️ ${esc(x.name)}`, x.n])].sort((a, b) => b[1] - a[1]))}</div>
  </div>
  ${rs ? `<div class="cols">
    <div class="card"><h2>${esc(S.settings.roots_title || "Roots")}: διαδρομές</h2><p class="small muted">Ανοίγματα του οδηγού: <b>${rs.opens}</b></p>
      ${table(["Διαδρομή", "Προβολές"], rs.routes.map(x => [esc(x.name), x.n]))}</div>
    <div class="card"><h2>${esc(S.settings.roots_title || "Roots")}: σημεία</h2>
      ${table(["Σημείο", "Προβολές", "Αφηγήσεις", "AR"], rs.pois.map(x => [esc(x.name), x.n || 0, x.audio, x.ar]))}</div>
  </div>` : ""}`;
  $$("[data-days]", main).forEach(b => b.onclick = () => { statsDays = Number(b.dataset.days); refresh(); });
  drawBars($("#chart", main), st.daily.map(d => ({ label: D.fmt(d.day, "el", { day: "numeric", month: "short" }), value: d.opens, tip: `${D.fmt(d.day, "el", { weekday: "short", day: "numeric", month: "short" })}: ${d.opens} ανοίγματα · ${d.orders} παραγγελίες · ${d.requests} αιτήματα` })));
}

// Απλό ραβδόγραμμα μίας σειράς (SVG): λεπτές μπάρες, αραιές ετικέτες, tooltip στο πέρασμα του ποντικιού.
function drawBars(el, pts) {
  if (!el) return;
  const W = 900, H = 220, padL = 34, padB = 26, padT = 10, n = pts.length;
  const max = Math.max(1, ...pts.map(p => p.value));
  const step = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : 1);
  const top = Math.ceil(max / step) * step || 1;
  const bw = (W - padL) / n, barW = Math.max(2, Math.min(28, bw - 2));
  const y = v => padT + (H - padT - padB) * (1 - v / top);
  const every = Math.ceil(n / 10);
  const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ανοίγματα ανά ημέρα" style="width:100%;height:auto;display:block">
    ${ticks.map(v => `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" stroke-width="1"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`).join("")}
    ${pts.map((p, i) => { const x = padL + i * bw + (bw - barW) / 2, h = Math.max(0, y(0) - y(p.value));
      return `<g class="bar" data-i="${i}"><rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${H - padT - padB}" fill="transparent"/>
        ${p.value ? `<path d="M${x},${y(0)} v${-(h - Math.min(4, h))} q0,${-Math.min(4, h)} ${Math.min(4, barW / 2)},${-Math.min(4, h)} h${barW - 2 * Math.min(4, barW / 2)} q${Math.min(4, barW / 2)},0 ${Math.min(4, barW / 2)},${Math.min(4, h)} v${h - Math.min(4, h)} z" fill="var(--primary)"/>` : ""}
        ${i % every === 0 ? `<text x="${padL + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(p.label)}</text>` : ""}</g>`; }).join("")}
  </svg><div class="chart-tip" hidden></div>`;
  const tip = $(".chart-tip", el);
  $$(".bar", el).forEach(g => {
    g.onmouseenter = g.ontouchstart = () => { const p = pts[Number(g.dataset.i)]; tip.textContent = p.tip; tip.hidden = false; };
    g.onmousemove = ev => { const r = el.getBoundingClientRect(); tip.style.left = Math.min(ev.clientX - r.left + 12, r.width - 260) + "px"; tip.style.top = (ev.clientY - r.top - 40) + "px"; };
    g.onmouseleave = () => { tip.hidden = true; };
  });
}

// ======================================================================
// Παραγγελίες εστίασης (από tablet / TV / κινητό δωματίων)
// ======================================================================
let ordFilter = "open";
const ALLERGEN_LBL = { gluten: "Γλουτένη", crustaceans: "Καρκινοειδή", eggs: "Αυγά", fish: "Ψάρι", peanuts: "Αράπικο φιστίκι", soy: "Σόγια",
  milk: "Γάλα", nuts: "Ξηροί καρποί", celery: "Σέλινο", mustard: "Μουστάρδα", sesame: "Σουσάμι", sulphites: "Θειώδη", lupin: "Λούπινο", molluscs: "Μαλάκια" };
const TAG_LBL = { vegetarian: "Χορτοφαγικό", vegan: "Vegan", gluten_free: "Χωρίς γλουτένη", spicy: "Πικάντικο", local: "Τοπικό", signature: "Πρόταση σεφ" };

async function viewOrders(main) {
  let q = sb.from("orders").select("*, menu_outlets(name_el, icon), rooms(number), order_items(name_el, qty, notes, price)").limit(200);
  if (ordFilter === "open") q = q.in("status", ["new", "preparing"]).order("created_at");
  else q = q.gte("created_at", D.add(D.today(), -2)).order("created_at", { ascending: false });
  const rows = must(await q);
  const filters = { open: "Ανοιχτές", recent: "Όλες (2 ημέρες)" };
  const ago = ts => { const m = Math.round((Date.now() - new Date(ts)) / 60000); return m < 1 ? "τώρα" : m < 60 ? `πριν ${m}'` : new Date(ts).toLocaleString("el-GR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
  main.innerHTML = `
  <div class="page-head"><h1>Παραγγελίες</h1>
    ${Object.entries(filters).map(([k, v]) => `<button class="btn sm${k === ordFilter ? " primary" : ""}" data-f="${k}">${v}</button>`).join("")}
    <button class="btn sm" id="reload">↻</button></div>
  ${!rows.length ? `<div class="card"><div class="empty">Καμία παραγγελία</div></div>` : `<div class="ord-grid">${rows.map(o => `
    <div class="card ord ord-${o.status}">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><b style="font-size:1.1rem">${o.deliver_to === "pool" ? `🏊 Πισίνα · ξαπλώστρα ${esc(o.location || "?")}` : `🛏️ Δωμάτιο ${esc(o.rooms ? o.rooms.number : "—")}`}</b>
          <div class="small muted">${esc(o.guest_name)}${o.deliver_to === "pool" && o.rooms ? ` · δωμ. ${esc(o.rooms.number)}` : ""} · ${esc(o.menu_outlets.icon || "")} ${esc(o.menu_outlets.name_el)} · #${o.id} ${o.via === "qr" ? "📱" : ""}</div></div>
        <div style="text-align:right">${badge("order", o.status)}<div class="small muted">${ago(o.created_at)}</div></div>
      </div>
      <ul class="ord-items">${(o.order_items || []).map(i => `<li><b>${i.qty}×</b> ${esc(i.name_el)}${i.notes ? `<div class="small" style="color:var(--warn)">↳ ${esc(i.notes)}</div>` : ""}</li>`).join("")}</ul>
      ${o.notes ? `<div class="alert info small">“${esc(o.notes)}”</div>` : ""}
      <div class="row" style="justify-content:space-between">
        <span><b>${money(o.total)}</b> <span class="small muted">· ${o.charge_to_room ? "Χρέωση στο δωμάτιο" : "Πληρωμή κατά την παράδοση"}</span></span>
        <span class="row">
          ${o.status === "new" ? `<button class="btn ok sm" data-st="preparing" data-id="${o.id}">Αποδοχή</button>` : ""}
          ${o.status === "preparing" ? `<button class="btn ok sm" data-st="delivered" data-id="${o.id}">Παραδόθηκε</button>` : ""}
          ${["new", "preparing"].includes(o.status) ? `<button class="btn sm danger" data-st="cancelled" data-id="${o.id}">Ακύρωση</button>` : ""}
        </span>
      </div>
    </div>`).join("")}</div>`}`;
  $$("[data-f]", main).forEach(b => b.onclick = () => { ordFilter = b.dataset.f; refresh(); });
  $("#reload").onclick = refresh;
  $$("[data-st]", main).forEach(b => b.onclick = () => {
    const st = b.dataset.st;
    if (st === "cancelled" && !confirm("Ακύρωση της παραγγελίας; Ο πελάτης θα το δει στην οθόνη του.")) return;
    busy(b, async () => {
      try { must(await sb.from("orders").update({ status: st }).eq("id", Number(b.dataset.id))); toast(st === "delivered" ? "Παραδόθηκε." : "Αποθηκεύτηκε."); refresh(); startRequestWatch(); }
      catch (e) { fail(e); }
    });
  });
  clearTimeout(viewOrders.t);
  viewOrders.t = setTimeout(() => { if (location.hash === "#orders" && !document.querySelector("dialog[open]")) refresh(); }, 30000);
}

// ======================================================================
// Εστίαση: σημεία (εστιατόριο, pool bar), κατηγορίες, πιάτα με αλλεργιογόνα
// Ο διαχειριστής τα επεξεργάζεται· η ρεσεψιόν μπορεί να σημειώνει «εξαντλήθηκε».
// ======================================================================
async function viewDining(main) {
  const admin = role() === "admin";
  const [outlets, cats, items] = await Promise.all([
    sb.from("menu_outlets").select("*").order("sort").order("id"),
    sb.from("menu_categories").select("*").order("sort").order("id"),
    sb.from("menu_items").select("*").order("sort").order("id")
  ].map(p => p.then(must)));
  main.innerHTML = `
  <div class="page-head"><h1>Εστίαση</h1>${admin ? `<button class="btn primary sm" id="addOutlet">+ Νέο σημείο</button>` : ""}</div>
  <p class="small muted">Οι κατάλογοι εμφανίζονται στο tablet, την τηλεόραση και το κινητό (QR) του δωματίου, στα ελληνικά και αγγλικά.
  ${admin ? "" : "Μπορείς να σημειώσεις ότι ένα πιάτο εξαντλήθηκε· την επεξεργασία των καταλόγων την κάνει ο διαχειριστής."}</p>
  ${!outlets.length ? `<div class="card"><div class="empty">Κανένα σημείο εστίασης.</div></div>` : outlets.map(o => `
  <div class="card">
    <div class="row"><h2 style="margin:0">${esc(o.icon || "🍽️")} ${esc(o.name_el)}</h2>
      ${o.active ? "" : `<span class="badge b-gray">Ανενεργό</span>`}
      ${o.accepts_orders ? `<span class="badge b-clean">Δέχεται παραγγελίες</span>` : `<span class="badge b-cancelled">Παραγγελίες κλειστές</span>`}
      <span class="spacer"></span>
      ${admin ? `<button class="btn sm" data-toggle-orders="${o.id}">${o.accepts_orders ? "Κλείσιμο παραγγελιών" : "Άνοιγμα παραγγελιών"}</button>
        <button class="btn sm" data-edit-outlet="${o.id}">Ρυθμίσεις</button><button class="btn sm primary" data-add-cat="${o.id}">+ Κατηγορία</button>` : ""}
    </div>
    <p class="small muted">${esc([o.hours_el, o.deliver_room && "Παράδοση στο δωμάτιο", o.deliver_pool && "Παράδοση στην πισίνα"].filter(Boolean).join(" · "))}</p>
    ${cats.filter(c => c.outlet_id === o.id).map(c => `
      <div class="row" style="margin-top:1rem"><h3 style="margin:0">${esc(c.name_el)} <span class="small muted">${esc(c.name_en || "")}</span></h3>
        ${c.active ? "" : `<span class="badge b-gray">Κρυφή</span>`}<span class="spacer"></span>
        ${admin ? `<button class="btn sm" data-edit-cat="${c.id}">Επεξεργασία</button><button class="btn sm primary" data-add-item="${c.id}">+ Πιάτο</button>` : ""}</div>
      <div class="table-wrap"><table><tbody>
      ${items.filter(i => i.category_id === c.id).map(i => `<tr${admin ? ` class="click" data-item="${i.id}"` : ""}>
        <td><b>${esc(i.name_el)}</b>${i.active ? "" : ` <span class="badge b-gray">Κρυφό</span>`}<div class="small muted">${esc(i.name_en || "")}</div></td>
        <td class="small">${i.allergens.length ? `<span style="color:var(--warn)">${i.allergens.map(a => esc(ALLERGEN_LBL[a])).join(", ")}</span>` : `<span class="muted">Χωρίς αλλεργιογόνα</span>`}
          ${i.tags.length ? `<div class="muted">${i.tags.map(t => esc(TAG_LBL[t])).join(" · ")}</div>` : ""}</td>
        <td class="num">${money(i.price)}</td>
        <td class="num"><button class="btn sm${i.available ? "" : " danger"}" data-avail="${i.id}">${i.available ? "Διαθέσιμο" : "Εξαντλήθηκε"}</button></td>
      </tr>`).join("") || `<tr><td class="muted small">Κανένα πιάτο.</td></tr>`}
      </tbody></table></div>`).join("")}
  </div>`).join("")}`;

  $$("[data-avail]", main).forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    const it = items.find(x => x.id === Number(b.dataset.avail));
    busy(b, async () => { try { must(await sb.from("menu_items").update({ available: !it.available }).eq("id", it.id)); refresh(); } catch (e) { fail(e); } });
  });
  if (!admin) return;
  $("#addOutlet").onclick = () => editOutlet(null);
  $$("[data-edit-outlet]", main).forEach(b => b.onclick = () => editOutlet(outlets.find(o => o.id === Number(b.dataset.editOutlet))));
  $$("[data-toggle-orders]", main).forEach(b => b.onclick = () => {
    const o = outlets.find(x => x.id === Number(b.dataset.toggleOrders));
    busy(b, async () => { try { must(await sb.from("menu_outlets").update({ accepts_orders: !o.accepts_orders }).eq("id", o.id)); refresh(); } catch (e) { fail(e); } });
  });
  $$("[data-add-cat]", main).forEach(b => b.onclick = () => editCategory(null, Number(b.dataset.addCat)));
  $$("[data-edit-cat]", main).forEach(b => b.onclick = () => editCategory(cats.find(c => c.id === Number(b.dataset.editCat))));
  $$("[data-add-item]", main).forEach(b => b.onclick = () => editItem(null, Number(b.dataset.addItem), cats, outlets));
  $$("tr[data-item]", main).forEach(tr => tr.onclick = () => editItem(items.find(i => i.id === Number(tr.dataset.item)), null, cats, outlets));
}

// Κοινή φόρμα αποθήκευσης για σημεία / κατηγορίες / πιάτα.
function diningForm({ title, body, table, id, toRow }) {
  const m = openModal({ title, body, footer: `<button type="button" class="btn primary" id="dsave">Αποθήκευση</button>` });
  $("#dsave", m.el).onclick = ev => busy(ev.target, async () => {
    const form = $("form", m.el);
    try {
      const row = toRow(formData(form), form);
      must(id ? await sb.from(table).update(row).eq("id", id) : await sb.from(table).insert(row));
      toast("Αποθηκεύτηκε."); m.close(); refresh();
    } catch (e) { fail(e); }
  });
  return m;
}
const chk = (name, on, label) => `<label class="check"><input type="checkbox" name="${name}"${on ? " checked" : ""}> ${esc(label)}</label>`;

function editOutlet(o) {
  o = o || { active: true, accepts_orders: true, deliver_room: true, deliver_pool: false, sort: 0, icon: "🍽️" };
  diningForm({ title: o.id ? `Σημείο: ${o.name_el}` : "Νέο σημείο εστίασης", table: "menu_outlets", id: o.id, body: `
    <div class="grid">
      <div class="field"><label>Όνομα (ελληνικά) *</label><input name="name_el" value="${esc(o.name_el)}" required></div>
      <div class="field"><label>Όνομα (αγγλικά)</label><input name="name_en" value="${esc(o.name_en)}"></div>
      <div class="field"><label>Εικονίδιο (emoji)</label><input name="icon" value="${esc(o.icon)}" maxlength="8"></div>
      <div class="field"><label>Σειρά</label><input type="number" name="sort" value="${o.sort}"></div>
      <div class="field"><label>Ωράριο (ελληνικά)</label><input name="hours_el" value="${esc(o.hours_el)}" placeholder="Καθημερινά 13:00 – 23:00"></div>
      <div class="field"><label>Ωράριο (αγγλικά)</label><input name="hours_en" value="${esc(o.hours_en)}" placeholder="Daily 13:00 – 23:00"></div>
    </div>
    <div class="field"><label>Περιγραφή (ελληνικά)</label><textarea name="description_el">${esc(o.description_el)}</textarea></div>
    <div class="field"><label>Περιγραφή (αγγλικά)</label><textarea name="description_en">${esc(o.description_en)}</textarea></div>
    <div class="row">${chk("accepts_orders", o.accepts_orders, "Δέχεται παραγγελίες")}${chk("deliver_room", o.deliver_room, "Παράδοση στο δωμάτιο")}${chk("deliver_pool", o.deliver_pool, "Παράδοση στην πισίνα")}${chk("active", o.active, "Ενεργό")}</div>`,
    toRow: (f, form) => {
      if (!f.name_el) throw new Error("Συμπλήρωσε το όνομα.");
      const e = form.elements;
      if (e.accepts_orders.checked && !e.deliver_room.checked && !e.deliver_pool.checked) throw new Error("Διάλεξε τουλάχιστον έναν τρόπο παράδοσης.");
      return { name_el: f.name_el, name_en: f.name_en || null, icon: f.icon || null, sort: Number(f.sort || 0), hours_el: f.hours_el || null, hours_en: f.hours_en || null,
        description_el: f.description_el || null, description_en: f.description_en || null,
        accepts_orders: e.accepts_orders.checked, deliver_room: e.deliver_room.checked, deliver_pool: e.deliver_pool.checked, active: e.active.checked };
    } });
}

function editCategory(c, outletId) {
  c = c || { outlet_id: outletId, active: true, sort: 0 };
  diningForm({ title: c.id ? `Κατηγορία: ${c.name_el}` : "Νέα κατηγορία", table: "menu_categories", id: c.id, body: `
    <div class="grid">
      <div class="field"><label>Όνομα (ελληνικά) *</label><input name="name_el" value="${esc(c.name_el)}" required></div>
      <div class="field"><label>Όνομα (αγγλικά)</label><input name="name_en" value="${esc(c.name_en)}"></div>
      <div class="field"><label>Σειρά</label><input type="number" name="sort" value="${c.sort}"></div>
    </div>${chk("active", c.active, "Εμφανίζεται στον κατάλογο")}`,
    toRow: (f, form) => {
      if (!f.name_el) throw new Error("Συμπλήρωσε το όνομα.");
      return { outlet_id: c.outlet_id, name_el: f.name_el, name_en: f.name_en || null, sort: Number(f.sort || 0), active: form.elements.active.checked };
    } });
}

function editItem(i, categoryId, cats, outlets) {
  i = i || { category_id: categoryId, allergens: [], tags: [], available: true, active: true, sort: 0, price: "" };
  const catOpts = cats.map(c => { const o = outlets.find(x => x.id === c.outlet_id); return `<option value="${c.id}"${c.id === i.category_id ? " selected" : ""}>${esc(o ? o.name_el : "")} › ${esc(c.name_el)}</option>`; }).join("");
  diningForm({ title: i.id ? i.name_el : "Νέο πιάτο", table: "menu_items", id: i.id, body: `
    <div class="grid">
      <div class="field"><label>Όνομα (ελληνικά) *</label><input name="name_el" value="${esc(i.name_el)}" required></div>
      <div class="field"><label>Όνομα (αγγλικά)</label><input name="name_en" value="${esc(i.name_en)}"></div>
      <div class="field"><label>Τιμή (€) *</label><input type="number" step="0.01" min="0" name="price" value="${esc(i.price)}" required></div>
      <div class="field"><label>Κατηγορία</label><select name="category_id">${catOpts}</select></div>
    </div>
    <div class="field"><label>Περιγραφή (ελληνικά)</label><textarea name="description_el">${esc(i.description_el)}</textarea></div>
    <div class="field"><label>Περιγραφή (αγγλικά)</label><textarea name="description_en">${esc(i.description_en)}</textarea></div>
    <div class="grid">
      <div class="field"><label>Φωτογραφία (σύνδεσμος https://…)</label><input type="url" name="image_url" value="${esc(i.image_url)}"></div>
      <div class="field"><label>Σειρά</label><input type="number" name="sort" value="${i.sort}"></div>
    </div>
    <fieldset><legend>Αλλεργιογόνα (Κανονισμός ΕΕ 1169/2011)</legend>
      <div class="row" style="gap:.3rem 1rem">${Object.entries(ALLERGEN_LBL).map(([k, v]) => chk("al_" + k, i.allergens.includes(k), v)).join("")}</div></fieldset>
    <fieldset><legend>Χαρακτηρισμοί</legend>
      <div class="row" style="gap:.3rem 1rem">${Object.entries(TAG_LBL).map(([k, v]) => chk("tg_" + k, i.tags.includes(k), v)).join("")}</div></fieldset>
    <div class="row">${chk("available", i.available, "Διαθέσιμο σήμερα")}${chk("active", i.active, "Εμφανίζεται στον κατάλογο")}</div>`,
    toRow: (f, form) => {
      const e = form.elements;
      if (!f.name_el) throw new Error("Συμπλήρωσε το όνομα.");
      if (f.price === "" || Number(f.price) < 0) throw new Error("Συμπλήρωσε την τιμή.");
      if (f.image_url && !/^https:\/\//i.test(f.image_url)) throw new Error("Ο σύνδεσμος της φωτογραφίας πρέπει να ξεκινά με https://");
      if (e.tg_vegan.checked && (e.al_milk.checked || e.al_eggs.checked || e.al_fish.checked || e.al_crustaceans.checked || e.al_molluscs.checked))
        throw new Error("Ένα πιάτο με γάλα, αυγά, ψάρι ή θαλασσινά δεν μπορεί να είναι vegan.");
      if (e.tg_gluten_free.checked && e.al_gluten.checked) throw new Error("Το πιάτο έχει σημειωθεί και «με γλουτένη» και «χωρίς γλουτένη».");
      return { category_id: Number(f.category_id), name_el: f.name_el, name_en: f.name_en || null, price: Number(f.price),
        description_el: f.description_el || null, description_en: f.description_en || null, image_url: f.image_url || null, sort: Number(f.sort || 0),
        allergens: Object.keys(ALLERGEN_LBL).filter(k => e["al_" + k].checked), tags: Object.keys(TAG_LBL).filter(k => e["tg_" + k].checked),
        available: e.available.checked, active: e.active.checked };
    } });
}

// ======================================================================
// Tablet δωματίων (διαχειριστής): αρχική σελίδα, πληροφορίες, υπηρεσίες, συσκευές
// ======================================================================
// QR δωματίων: φορτώνεται μόνο όταν χρειαστεί.
let qrLib = null;
function loadQrLib() {
  if (qrLib) return qrLib;
  qrLib = new Promise((ok, bad) => {
    const sc = document.createElement("script");
    sc.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
    sc.onload = () => ok(window.qrcode); sc.onerror = () => { qrLib = null; bad(new Error("Δεν φορτώθηκε η βιβλιοθήκη QR. Έλεγξε τη σύνδεση.")); };
    document.head.appendChild(sc);
  });
  return qrLib;
}
const roomQrUrl = r => new URL(`room.html?r=${encodeURIComponent(r.qr_code)}`, location.href).href;
async function qrSvg(text) {
  const qrcode = await loadQrLib();
  const q = qrcode(0, "M"); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}
async function printRoomQrs(rooms) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Ο browser μπλόκαρε το νέο παράθυρο. Επίτρεψε τα αναδυόμενα για αυτή τη σελίδα.");
  const s = S.settings;
  const cards = [];
  const logo = s.logo_url && /^https:\/\//i.test(s.logo_url) ? `<img class="logo" src="${esc(s.logo_url)}" alt="">` : "";
  for (const r of rooms) cards.push(`<div class="c">${logo}<div class="h">${esc(s.hotel_name)}</div>
    <div class="r">Δωμάτιο ${esc(r.number)} · Room ${esc(r.number)}</div>
    <div class="q">${await qrSvg(roomQrUrl(r))}</div>
    <div class="t">Σκανάρετε για υπηρεσίες, πληροφορίες και αιτήματα<br><span>Scan for hotel services, information & requests</span></div>
    ${s.wifi_name ? `<div class="w">Wi‑Fi: <b>${esc(s.wifi_name)}</b>${s.wifi_password ? ` · <b>${esc(s.wifi_password)}</b>` : ""}</div>` : ""}</div>`);
  w.document.write(`<!doctype html><html lang="el"><head><meta charset="utf-8"><title>QR δωματίων</title><style>
    @page { size: A4; margin: 12mm; } body { font-family: system-ui, sans-serif; margin: 0; color: ${s.brand_color || "#16324F"}; }
    .logo { max-height: 14mm; max-width: 50mm; object-fit: contain; display: block; margin: 0 auto 2mm; }
    .g { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
    .c { border: 1px solid #ccd; border-radius: 6mm; padding: 7mm 6mm; text-align: center; break-inside: avoid; }
    .h { font-weight: 700; font-size: 15pt; } .r { font-size: 12pt; margin: 1mm 0 4mm; }
    .q svg { width: 58mm; height: 58mm; } .t { font-size: 10pt; margin-top: 3mm; } .t span { color: #557; }
    .w { font-size: 10pt; margin-top: 3mm; padding-top: 3mm; border-top: 1px dashed #ccd; }
    .bar { padding: 10px; text-align: center; } @media print { .bar { display: none; } }
  </style></head><body><div class="bar"><button onclick="print()">Εκτύπωση</button></div><div class="g">${cards.join("")}</div></body></html>`);
  w.document.close();
}

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
      <p class="small muted">Για <b>smart TV</b> άνοιξε στον browser της τηλεόρασης <b>${esc(new URL("tv.html", location.href).href)}</b> (πλοήγηση με τα βελάκια και OK του τηλεχειριστηρίου). Η σύνδεση με το δωμάτιο γίνεται με τον ίδιο κωδικό.</p>
      ${!S.rooms.length ? `<div class="empty">Δεν υπάρχουν δωμάτια.</div>` : `<div class="table-wrap"><table><thead><tr><th>Δωμάτιο</th><th>Tablet</th><th>Τελευταία επαφή</th><th></th></tr></thead><tbody>
      ${S.rooms.filter(r => r.active).map(r => { const tb = tablets.find(x => x.room_id === r.id); const paired = tb && tb.paired_at;
        return `<tr><td><b>${esc(r.number)}</b></td><td>${paired ? `<span class="badge b-clean">Συνδεδεμένο</span>` : `<span class="badge b-gray">Όχι</span>`}</td>
        <td class="small">${paired ? ago(tb.last_seen) : ""}</td>
        <td class="num"><button class="btn sm" data-qr="${r.id}">QR</button> <button class="btn sm" data-pair="${r.id}">Κωδικός σύνδεσης</button>${paired ? ` <button class="btn sm danger" data-unpair="${r.id}">Αποσύνδεση</button>` : ""}</td></tr>`; }).join("")}
      </tbody></table></div>`}
    </div>
  </div>
  <div class="card">
    <div class="row"><h2 style="margin:0">QR δωματίων (κινητό πελάτη)</h2><span class="spacer"></span><button class="btn primary sm" id="printQr" ${S.rooms.some(r => r.active) ? "" : "disabled"}>Εκτύπωση όλων</button></div>
    <p class="small muted">Κάθε δωμάτιο έχει δικό του QR. Ο πελάτης το σκανάρει με το κινητό του, γράφει το επώνυμο της κράτησης (ή τον κωδικό κράτησης) και βλέπει ό,τι και το tablet: πληροφορίες, Wi‑Fi, υπηρεσίες, αιτήματα. Χωρίς εφαρμογή και χωρίς λογαριασμό.
    Η πρόσβαση ισχύει μόνο όσο διαρκεί η διαμονή του (μέχρι το check-out) και ο επόμενος πελάτης δεν βλέπει τίποτα από τον προηγούμενο. Μετά από 8 λάθος προσπάθειες σε 15 λεπτά το δωμάτιο κλειδώνει προσωρινά.</p>
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
  const pq = $("#printQr");
  if (pq) pq.onclick = () => busy(pq, async () => { try { await printRoomQrs(S.rooms.filter(r => r.active)); } catch (e) { fail(e); } });
  $$("[data-qr]", main).forEach(b => b.onclick = () => busy(b, async () => {
    try {
      const room = roomById(Number(b.dataset.qr));
      const url = roomQrUrl(room);
      const m = openModal({ title: `QR δωματίου ${room.number}`, onClose: refresh, body: `
        <div style="text-align:center"><div style="width:240px;margin:0 auto">${await qrSvg(url)}</div>
        <p class="mono small" style="word-break:break-all"><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p></div>
        <div class="row" style="justify-content:center"><button type="button" class="btn" id="qrPrint1">Εκτύπωση</button><button type="button" class="btn danger" id="qrNew">Νέο QR</button></div>
        <p class="small muted">«Νέο QR»: το τυπωμένο QR αυτού του δωματίου σταματά να λειτουργεί (π.χ. αν φωτογραφήθηκε και κυκλοφορεί). Ο πελάτης που ήδη μένει κρατά την πρόσβαση μέχρι το check-out.</p>` });
      $("#qrPrint1", m.el).onclick = () => printRoomQrs([room]).catch(fail);
      $("#qrNew", m.el).onclick = async () => {
        if (!confirm(`Νέο QR για το δωμάτιο ${room.number}; Το τυπωμένο QR θα σταματήσει να λειτουργεί και πρέπει να τυπωθεί ξανά.`)) return;
        try { must(await sb.rpc("admin_room_new_qr", { p_room: room.id })); toast("Νέο QR. Τύπωσέ το ξανά."); m.close(); } catch (e) { fail(e); }
      };
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
      <div class="grid">
        <div class="field"><label>Διάρκεια (ελληνικά)</label><input name="duration_el" value="${esc(v && v.duration_el)}" placeholder="π.χ. 5 ώρες, Ανά ημέρα"></div>
        <div class="field"><label>Διάρκεια (αγγλικά)</label><input name="duration_en" value="${esc(v && v.duration_en)}" placeholder="e.g. 5 hours, Per day"></div>
      </div>
      <div class="field"><label>Φωτογραφία (σύνδεσμος https://…)</label><input name="image_url" type="url" value="${esc(v && v.image_url)}"></div>
      <div class="field"><label>Περισσότερες φωτογραφίες (ένας σύνδεσμος https://… ανά γραμμή)</label><textarea name="gallery" rows="3">${esc(v && v.gallery ? v.gallery.join("\n") : "")}</textarea></div>
      <label class="check"><input type="checkbox" name="active" ${!v || v.active ? "checked" : ""}> Εμφανίζεται στο tablet</label>`,
    toPayload: (f, form) => {
      if (!f.name_el) throw new Error("Συμπλήρωσε όνομα.");
      if (f.image_url && !/^https:\/\//i.test(f.image_url)) throw new Error("Ο σύνδεσμος της φωτογραφίας πρέπει να ξεκινά με https://");
      if (f.price_unit !== "on_request" && f.price === "") throw new Error("Συμπλήρωσε τιμή ή διάλεξε «Κατόπιν επικοινωνίας».");
      const gallery = (f.gallery || "").split(/\s*\n\s*/).map(x => x.trim()).filter(Boolean);
      if (gallery.some(u => !/^https:\/\//i.test(u))) throw new Error("Κάθε σύνδεσμος φωτογραφίας πρέπει να ξεκινά με https://");
      if (gallery.length > 12) throw new Error("Έως 12 φωτογραφίες.");
      return { ...nullIfEmpty({ name_el: f.name_el, name_en: f.name_en, description_el: f.description_el, description_en: f.description_en, image_url: f.image_url,
          duration_el: f.duration_el, duration_en: f.duration_en }), gallery,
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
// Channel manager (διαχειριστής): σύνδεση με WebHotelier ή Channex, αντιστοίχιση τύπων δωματίων, ιστορικό
// ======================================================================
let cmRoomTypes = null;   // τύποι δωματίων του channel manager από τον τελευταίο έλεγχο σύνδεσης
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
  const prov = cfg.provider || "webhotelier";
  const P = prov === "webhotelier"
    ? { name: "WebHotelier", the: "η WebHotelier", at: "στη WebHotelier", of: "της WebHotelier", room: "Room code στη WebHotelier", roomPh: "π.χ. DBL" }
    : { name: "Channex", the: "το Channex", at: "στο Channex", of: "του Channex", room: "Room Type στο Channex", roomPh: "Room Type ID" };
  const ready = cfg.has_key && (prov !== "webhotelier" || cfg.api_username);

  main.innerHTML = `
  <div class="page-head"><h1>Channel manager</h1>
    ${cfg.enabled ? `<span class="badge b-clean">Ενεργό</span>` : `<span class="badge b-gray">Ανενεργό</span>`}</div>
  <div class="alert info">Οι κρατήσεις από Booking.com, Airbnb, Expedia κ.λπ. (και από τη μηχανή κρατήσεων) μπαίνουν αυτόματα μέσω <b>${P.name}</b>, και κάθε αλλαγή εδώ στέλνει τη διαθεσιμότητα πίσω, ώστε να μη γίνεται overbooking.
    Ο συγχρονισμός γίνεται κάθε 5 λεπτά και αμέσως όταν ${P.the} στέλνει την κράτηση στο webhook.</div>
  ${cfg.last_error ? `<div class="alert err"><b>Τελευταίο σφάλμα:</b> ${esc(cfg.last_error)}</div>` : ""}
  <div class="cols">
    <form class="card" id="cf">
      <h2>1. Σύνδεση</h2>
      <div class="field"><label>Πάροχος</label><select name="provider">
        <option value="webhotelier"${prov === "webhotelier" ? " selected" : ""}>WebHotelier</option>
        <option value="channex"${prov === "channex" ? " selected" : ""}>Channex.io</option></select></div>
      <div data-prov="webhotelier">
        <div class="field"><label>Όνομα χρήστη API (Hotelier API account από τη WebHotelier)</label>
          <input name="api_username" value="${esc(cfg.api_username)}" autocomplete="off"></div>
        <div class="field"><label>Κωδικός API</label>
          <input name="wh_password" type="password" autocomplete="new-password" placeholder="${cfg.has_key && prov === "webhotelier" ? "Αποθηκευμένος. Άφησέ τον κενό για να μείνει." : "Ο κωδικός του API account"}"></div>
        <div class="field"><label>Κωδικός καταλύματος (property code, π.χ. όπως στο …/availability/<b>CODE</b>)</label>
          <input name="wh_property" value="${prov === "webhotelier" ? esc(cfg.property_id) : ""}" autocomplete="off" class="mono"></div>
      </div>
      <div data-prov="channex">
        <div class="field"><label>Περιβάλλον</label><select name="environment">
          <option value="staging"${cfg.environment === "staging" ? " selected" : ""}>Δοκιμαστικό (staging.channex.io)</option>
          <option value="production"${cfg.environment === "production" ? " selected" : ""}>Παραγωγή (app.channex.io)</option></select></div>
        <div class="field"><label>Κλειδί API (Channex → Profile → API Keys)</label>
          <input name="api_key" type="password" autocomplete="off" placeholder="${cfg.has_key && prov === "channex" ? `Αποθηκευμένο (…${esc(cfg.key_hint)}). Άφησέ το κενό για να μείνει.` : "Επικόλλησε το κλειδί"}"></div>
        <div class="field"><label>Property ID (Channex → Properties)</label><input name="cx_property" value="${prov === "channex" ? esc(cfg.property_id) : ""}" autocomplete="off"></div>
      </div>
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
        <button class="btn" id="syncNow" ${ready ? "" : "disabled"}>Συγχρονισμός τώρα</button>
        <button class="btn" id="fullPush" ${ready ? "" : "disabled"} title="Στέλνει ξανά τη διαθεσιμότητα για τις επόμενες 500 ημέρες">Πλήρης αποστολή διαθεσιμότητας</button>
      </div>
      <h3 style="margin-top:1.2rem">Webhook</h3>
      ${prov === "webhotelier"
        ? `<p class="small muted">Στη WebHotelier, στις ρυθμίσεις του API account → Booking notifications: Endpoint το παρακάτω, Mode <b>PUSH</b>, Format <b>JSON</b>. Χωρίς webhook οι κρατήσεις έρχονται πάλι, απλώς έως και 5 λεπτά αργότερα.</p>`
        : `<p class="small muted">Στο Channex → Webhooks → Create: Event «booking», Callback URL το παρακάτω. Χωρίς webhook οι κρατήσεις έρχονται πάλι, απλώς έως και 5 λεπτά αργότερα.</p>`}
      <div class="row" style="flex-wrap:nowrap"><input readonly value="${esc(hookUrl)}" id="hook"><button class="btn" id="copyHook">Αντιγραφή</button></div>
      <p class="small"><button class="linkish" id="newToken">Νέο μυστικό token</button> <span class="muted">(αν διέρρευσε ο σύνδεσμος· μετά ενημέρωσε το webhook ${P.at})</span></p>
    </div>
  </div>
  <div class="card">
    <h2>2. Αντιστοίχιση τύπων δωματίων</h2>
    <p class="small muted">Κάθε τύπος δωματίου εδώ πρέπει να αντιστοιχεί σε έναν τύπο δωματίου ${P.of}. Πάτα πρώτα «Έλεγχος σύνδεσης» για να εμφανιστούν σε λίστα, αλλιώς γράψε τον κωδικό του. Κρατήσεις για τύπους χωρίς αντιστοίχιση δεν εισάγονται και εμφανίζονται ως σφάλμα στο ιστορικό, γι' αυτό κάνε την αντιστοίχιση <b>πριν</b> ενεργοποιήσεις τον συγχρονισμό.</p>
    ${S.types.length ? `<div class="table-wrap"><table><thead><tr><th>Τύπος εδώ</th><th>Δωμάτια</th><th>${P.room}</th></tr></thead><tbody>
      ${S.types.map(t => { const m = mapFor(t.id); const cur = m ? m.external_room_type_id : "";
        return `<tr><td><b>${esc(t.name)}</b>${t.active ? "" : ` <span class="small muted">(ανενεργός)</span>`}</td><td>${S.rooms.filter(r => r.room_type_id === t.id && r.active).length}</td>
        <td>${cmRoomTypes ? `<select data-map="${t.id}"><option value="">— Χωρίς αντιστοίχιση —</option>${cmRoomTypes.map(x => `<option value="${esc(x.id)}"${x.id === cur ? " selected" : ""}>${esc(x.title)}</option>`).join("")}${cur && !cmRoomTypes.some(x => x.id === cur) ? `<option value="${esc(cur)}" selected>${esc(cur)}</option>` : ""}</select>`
          : `<input data-map="${t.id}" value="${esc(cur)}" placeholder="${P.roomPh}" class="mono">`}</td></tr>`; }).join("")}
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

  const showProv = () => {
    const v = $("#cf").elements.provider.value;
    $$("[data-prov]", main).forEach(el => { el.style.display = el.dataset.prov === v ? "" : "none"; });
  };
  $("#cf").elements.provider.onchange = showProv;
  showProv();

  $("#cf").onsubmit = ev => {
    ev.preventDefault();
    return busy($("button.primary", ev.target), async () => {
      const f = formData(ev.target);
      try {
        const enabled = ev.target.elements.enabled.checked;
        const wh = f.provider === "webhotelier";
        const keep = cfg.has_key && f.provider === prov;   // ίδιος πάροχος: ο αποθηκευμένος κωδικός/κλειδί μένει
        const secret = (wh ? f.wh_password : f.api_key) || null;
        const property = wh ? f.wh_property : f.cx_property;
        if (enabled && (!property || (!secret && !keep) || (wh && !f.api_username)))
          throw new Error(wh ? "Για ενεργοποίηση χρειάζονται όνομα χρήστη, κωδικός API και κωδικός καταλύματος." : "Για ενεργοποίηση χρειάζονται κλειδί API και Property ID.");
        must(await sb.rpc("channel_save_settings", { p_provider: f.provider, p_username: wh ? f.api_username : null,
          p_environment: wh ? null : f.environment, p_api_key: secret, p_property_id: property, p_enabled: enabled,
          p_function_url: `${HOTEL_CONFIG.url}/functions/v1/channel-sync` }));
        if (f.provider !== prov) cmRoomTypes = null;
        toast("Αποθηκεύτηκε."); refresh();
      } catch (e) { fail(e); }
    });
  };
  $("#test").onclick = async ev => {
    const out = $("#testOut");
    try {
      const r = await channelCall("test", ev.target);
      cmRoomTypes = r.room_types || [];
      toast(`Σύνδεση με «${r.property || P.name}» επιτυχής.`);
      refresh();
    } catch (e) { out.innerHTML = `<div class="alert err">${esc(errMsg(e))}</div>`; }
  };
  const runAction = (action, okMsg) => async ev => {
    try { const r = await channelCall(action, ev.target); toast(okMsg(r)); refresh(); }
    catch (e) { fail(e); refresh(); }
  };
  $("#syncNow").onclick = runAction("sync", r => `${r.skipped ? "Κρατήσεις: έγινε λήψη πριν από λιγότερο από 5′, ξανά στον επόμενο κύκλο" : `Κρατήσεις: ${r.imported} νέες/αλλαγές${r.failed ? `, ${r.failed} με σφάλμα` : ""}`} · διαθεσιμότητα: ${r.pushed} εύρη.`);
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
      if (new Set(used).size !== used.length) throw new Error(`Δύο τύποι δεν μπορούν να αντιστοιχούν στον ίδιο τύπο δωματίου ${P.of}.`);
      const clear = rows.filter(r => !r.external_room_type_id).map(r => r.room_type_id);
      if (clear.length) must(await sb.from("channel_room_map").delete().in("room_type_id", clear));
      const keep = rows.filter(r => r.external_room_type_id);
      // Πρώτα αφαιρούνται όσα άλλαξαν, ώστε να μη συγκρουστεί το μοναδικό external_room_type_id.
      const changed = keep.filter(r => { const m = mapFor(r.room_type_id); return m && m.external_room_type_id !== r.external_room_type_id; }).map(r => r.room_type_id);
      if (changed.length) must(await sb.from("channel_room_map").delete().in("room_type_id", changed));
      if (keep.length) must(await sb.from("channel_room_map").upsert(keep));
      toast(`Η αντιστοίχιση αποθηκεύτηκε. Πάτα «Πλήρης αποστολή διαθεσιμότητας» για να ενημερωθεί ${P.the}.`);
      refresh();
    } catch (e) { fail(e); }
  });
}
