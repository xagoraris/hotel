// Κοινά βοηθητικά για την εφαρμογή προσωπικού και την πύλη πελατών.
// Αν δεν έχει συμπληρωθεί το js/config.js, δείχνουμε οδηγία αντί για σφάλμα.
if (!/^https:\/\//.test(HOTEL_CONFIG.url || "")) {
  document.addEventListener("DOMContentLoaded", () => {
    document.body.innerHTML = `<div style="max-width:520px;margin:15vh auto;padding:1.5rem;font:16px/1.5 system-ui,sans-serif">
      <h2>Χρειάζεται ρύθμιση</h2><p>Συμπλήρωσε τη διεύθυνση και το κλειδί του Supabase στο αρχείο <b>js/config.js</b> (δες το README).</p></div>`;
  });
  throw new Error("HOTEL_CONFIG not set");
}
const sb = supabase.createClient(HOTEL_CONFIG.url, HOTEL_CONFIG.key);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Ημερομηνίες ως κείμενο "YYYY-MM-DD" (χωρίς ώρα), με πράξεις σε UTC ώστε να μη μετράει η θερινή ώρα.
const D = {
  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },
  parse(s) { return new Date(s + "T00:00:00Z"); },
  add(s, n) { const d = D.parse(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },
  diff(a, b) { return Math.round((D.parse(b) - D.parse(a)) / 86400000); },
  fmt(s, lang = "el", opts = { day: "numeric", month: "short", year: "numeric" }) {
    if (!s) return "";
    return D.parse(s).toLocaleDateString(lang === "en" ? "en-GB" : "el-GR", { ...opts, timeZone: "UTC" });
  },
  dow(s, lang = "el") { return D.parse(s).toLocaleDateString(lang === "en" ? "en-GB" : "el-GR", { weekday: "short", timeZone: "UTC" }); },
  isWeekend(s) { const g = D.parse(s).getUTCDay(); return g === 0 || g === 6; }
};

function money(n) {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(Number(n || 0));
}

function toast(msg, kind = "ok") {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.append(box); }
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.classList.add("out"), 3500);
  setTimeout(() => t.remove(), 4000);
}

// Παράθυρο διαλόγου. Επιστρέφει { el, close }.
function openModal({ title, body, footer = "", wide = false, onClose }) {
  const dlg = document.createElement("dialog");
  dlg.className = "modal" + (wide ? " wide" : "");
  dlg.innerHTML = `
    <form method="dialog" class="modal-inner" novalidate>
      <header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Κλείσιμο">✕</button></header>
      <div class="modal-body">${body}</div>
      ${footer ? `<footer>${footer}</footer>` : ""}
    </form>`;
  document.body.append(dlg);
  const close = () => { dlg.close(); };
  dlg.addEventListener("close", () => { dlg.remove(); onClose && onClose(); });
  $("[data-close]", dlg).addEventListener("click", close);
  dlg.showModal();
  return { el: dlg, close };
}

function formData(form) {
  const o = {};
  for (const [k, v] of new FormData(form)) o[k] = typeof v === "string" ? v.trim() : v;
  return o;
}

function nullIfEmpty(o) {
  for (const k in o) if (o[k] === "") o[k] = null;
  return o;
}

// Κουμπί σε κατάσταση φόρτωσης όσο τρέχει μια ενέργεια.
async function busy(btn, fn) {
  if (!btn) return fn();
  btn.disabled = true;
  btn.classList.add("loading");
  try { return await fn(); }
  finally { btn.disabled = false; btn.classList.remove("loading"); }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
