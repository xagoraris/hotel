// Roots AR (πιλοτικό): επαυξημένη πραγματικότητα με βάση τη θέση, μέσα στον browser, χωρίς εφαρμογή.
// Κάμερα + GPS + πυξίδα: ετικέτες για τα σημεία με ar_enabled πάνω στο πραγματικό τοπίο.
// Η πυξίδα των κινητών έχει απόκλιση, γι' αυτό υπάρχει «ευθυγράμμιση» με ένα γνωστό σημείο.

const TA = {
  el: {
    title: "Τοπίο με κάμερα (AR)", start: "Άνοιγμα κάμερας",
    intro: "Στρέψτε το κινητό προς το τοπίο: θα δείτε ετικέτες με τα ονόματα και τις αποστάσεις των σημείων (ηφαίστειο, Σκάρος, Οία…). Λειτουργεί καλύτερα από σημεία με ανοιχτή θέα στην καλντέρα, όπως το Φηροστεφάνι.",
    perms: "Θα σας ζητηθεί άδεια για κάμερα, τοποθεσία και αισθητήρες κίνησης. Τίποτα δεν καταγράφεται ούτε αποθηκεύεται.",
    noCam: "Δεν ήταν δυνατό να ανοίξει η κάμερα. Ελέγξτε ότι δώσατε άδεια, ή δοκιμάστε από κινητό.",
    noCompass: "Η συσκευή δεν δίνει πυξίδα. Το AR χρειάζεται κινητό με πυξίδα.",
    noGps: "Αναμονή για τη θέση σας…",
    align: "Ευθυγράμμιση", alignHelp: n => `Στρέψτε το κέντρο της οθόνης ακριβώς στο «${n}» και πατήστε «Ευθυγράμμιση».`,
    aligned: "Οι ετικέτες ευθυγραμμίστηκαν.", close: "Κλείσιμο", accuracy: m => `ακρίβεια θέσης ±${m} m`,
    calibrate: "Κουνήστε το κινητό σε σχήμα «8» για να βαθμονομηθεί η πυξίδα.", none: "Δεν υπάρχουν σημεία σε αυτή την κατεύθυνση.",
    pilot: "Πιλοτική λειτουργία: οι θέσεις των ετικετών είναι κατά προσέγγιση."
  },
  en: {
    title: "Landscape camera (AR)", start: "Open camera",
    intro: "Point your phone at the landscape to see labels with the names and distances of places (the volcano, Skaros, Oia…). Works best from spots with an open caldera view, such as Firostefani.",
    perms: "You will be asked to allow camera, location and motion sensors. Nothing is recorded or stored.",
    noCam: "The camera could not be opened. Check that you allowed access, or try on a phone.",
    noCompass: "This device does not provide a compass. AR needs a phone with a compass.",
    noGps: "Waiting for your location…",
    align: "Align", alignHelp: n => `Point the centre of the screen exactly at “${n}” and tap “Align”.`,
    aligned: "Labels aligned.", close: "Close", accuracy: m => `location accuracy ±${m} m`,
    calibrate: "Move your phone in a figure-8 to calibrate the compass.", none: "No places in this direction.",
    pilot: "Pilot feature: label positions are approximate."
  }
};
const ta = () => TA[lang];

const AR = { stream: null, watch: null, raf: null, heading: null, pitch: 0, offset: 0, pos: null, acc: null, compassAcc: null, onOri: null, landscape: false };

function bearing(a, b) {
  const r = x => x * Math.PI / 180, d = x => x * 180 / Math.PI;
  const y = Math.sin(r(b.lng - a.lng)) * Math.cos(r(b.lat));
  const x = Math.cos(r(a.lat)) * Math.sin(r(b.lat)) - Math.sin(r(a.lat)) * Math.cos(r(b.lat)) * Math.cos(r(b.lng - a.lng));
  return (d(Math.atan2(y, x)) + 360) % 360;
}
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;          // a − b στο [−180, 180)
const screenAngle = () => (screen.orientation && screen.orientation.angle) || window.orientation || 0;

function arStop() {
  if (AR.stream) AR.stream.getTracks().forEach(tr => tr.stop());
  if (AR.watch != null) navigator.geolocation.clearWatch(AR.watch);
  if (AR.raf) cancelAnimationFrame(AR.raf);
  if (AR.onOri) { window.removeEventListener("deviceorientationabsolute", AR.onOri, true); window.removeEventListener("deviceorientation", AR.onOri, true); }
  Object.assign(AR, { stream: null, watch: null, raf: null, onOri: null, heading: null });
  document.body.classList.remove("rt-ar-on");
}
window.arStop = arStop;

// Πυξίδα: iOS δίνει webkitCompassHeading· Android δίνει alpha (απόλυτο) σε deviceorientationabsolute.
function onOrientation(e) {
  let h = null;
  if (typeof e.webkitCompassHeading === "number") { h = e.webkitCompassHeading; AR.compassAcc = e.webkitCompassAccuracy; }
  else if (e.absolute && typeof e.alpha === "number") h = 360 - e.alpha;
  if (h == null) return;
  h = (h + screenAngle() + 360) % 360;
  // εξομάλυνση (κυκλικός μέσος όρος) για να μην «τρέμουν» οι ετικέτες
  AR.heading = AR.heading == null ? h : (AR.heading + angDiff(h, AR.heading) * 0.15 + 360) % 360;
  if (typeof e.beta === "number") AR.pitch = AR.pitch * 0.85 + (screenAngle() ? (e.gamma || 0) : e.beta) * 0.15;
}

function arPois() {
  const flagged = D0.pois.filter(p => p.ar_enabled);
  return flagged.length ? flagged : D0.pois.filter(p => p.category !== "start");
}

function renderAR() {
  header(ta().title, D0.settings.roots_title || "Roots", true);
  view().innerHTML = `
  <section class="rt-hero small" style="--rc:#2a78d6"><div class="rt-hero-ic">📷</div><h1>${esc(ta().title)}</h1></section>
  <p class="rt-intro">${esc(ta().intro)}</p>
  <p class="small muted">${esc(ta().perms)}</p>
  <div class="rt-actions"><button class="btn primary" id="arStart">📷 ${esc(ta().start)}</button></div>
  <p class="small muted">${esc(ta().pilot)}</p>`;
  $("#arStart").onclick = startAR;
}

async function startAR() {
  // Άδειες: πρέπει να ζητηθούν μέσα από το πάτημα του κουμπιού (iOS).
  try {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== "granted") return toast(ta().noCompass, "err");
    }
  } catch {}
  try {
    AR.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) { console.error(e); return toast(ta().noCam, "err"); }

  document.body.classList.add("rt-ar-on");
  const wrap = document.createElement("div");
  wrap.className = "rt-ar";
  wrap.innerHTML = `
    <video playsinline muted autoplay></video>
    <div class="rt-ar-labels"></div>
    <div class="rt-ar-cross"></div>
    <div class="rt-ar-top"><button class="rt-ar-btn" id="arClose">✕ ${esc(ta().close)}</button><span class="rt-ar-info" id="arInfo"></span></div>
    <div class="rt-ar-bottom">
      <div class="rt-ar-radar"><canvas width="120" height="120"></canvas></div>
      <div class="rt-ar-align"><select id="arRef"></select><button class="rt-ar-btn" id="arAlign">🎯 ${esc(ta().align)}</button></div>
    </div>`;
  document.body.appendChild(wrap);
  const video = $("video", wrap);
  video.srcObject = AR.stream;
  try { await video.play(); } catch {}

  const pois = arPois();
  const ref = $("#arRef", wrap);
  ref.innerHTML = pois.map(p => `<option value="${p.id}">${esc(L(p, "name"))}</option>`).join("");
  const nk = pois.find(p => p.code === "nea_kameni"); if (nk) ref.value = String(nk.id);
  ref.title = ta().alignHelp(ref.selectedOptions[0] ? ref.selectedOptions[0].textContent : "");

  AR.onOri = onOrientation;
  if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", AR.onOri, true);
  window.addEventListener("deviceorientation", AR.onOri, true);
  AR.watch = navigator.geolocation ? navigator.geolocation.watchPosition(
    p => { AR.pos = { lat: p.coords.latitude, lng: p.coords.longitude }; AR.acc = Math.round(p.coords.accuracy); here = AR.pos; },
    () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }) : null;

  $("#arClose", wrap).onclick = () => { arStop(); wrap.remove(); };
  $("#arAlign", wrap).onclick = () => {
    const p = poiById(Number(ref.value));
    if (!p || AR.heading == null || !AR.pos) return;
    AR.offset = angDiff(bearing(AR.pos, p), AR.heading);
    try { sessionStorage.setItem("rt_ar_offset", String(AR.offset)); } catch {}
    toast(ta().aligned);
  };
  try { const o = Number(sessionStorage.getItem("rt_ar_offset")); if (o) AR.offset = o; } catch {}

  const labels = $(".rt-ar-labels", wrap), info = $("#arInfo", wrap), radar = $("canvas", wrap).getContext("2d");
  const els = new Map();
  const none = document.createElement("div"); none.className = "rt-ar-none"; none.textContent = ta().none; none.hidden = true; wrap.appendChild(none);
  const frame = () => {
    AR.raf = requestAnimationFrame(frame);
    const W = wrap.clientWidth, H = wrap.clientHeight;
    const landscape = W > H;
    const hfov = landscape ? 62 : 48;                       // κατά προσέγγιση οπτικό πεδίο κάμερας κινητού
    if (!AR.pos) { info.textContent = ta().noGps; return; }
    if (AR.heading == null) { info.textContent = ta().noCompass; return; }
    const head = (AR.heading + AR.offset + 360) % 360;
    info.textContent = `${Math.round(head)}° · ${ta().accuracy(AR.acc || "?")}${AR.compassAcc > 25 ? " · " + ta().calibrate : ""}`;
    const items = pois.map(p => ({ p, d: km(AR.pos, p), rel: angDiff(bearing(AR.pos, p), head) }))
      .filter(x => x.d > 0.05 && x.d < 25).sort((a, b) => b.d - a.d);
    // κάθετη θέση: πιο μακρινά πιο ψηλά στη γραμμή του ορίζοντα, κλίση κινητού μετακινεί τον ορίζοντα
    const horizon = H * 0.5 + ((landscape ? 0 : AR.pitch - 90) / 40) * H * 0.5;
    const placed = [], show = new Set();
    items.filter(x => Math.abs(x.rel) < hfov / 2 + 4).forEach(x => {
      const left = W / 2 + (x.rel / (hfov / 2)) * (W / 2);
      let top = horizon - 30 - Math.min(1, x.d / 12) * H * 0.18;
      // Αποφυγή επικάλυψης: αν πέφτει πάνω σε άλλη ετικέτα, ανεβαίνει πάνω από αυτήν (μέχρι να βρει κενό).
      for (let moved = true, n = 0; moved && n < 8; n++) {
        moved = false;
        for (const q of placed) if (Math.abs(q.left - left) < 170 && Math.abs(q.top - top) < 64) { top = q.top - 66; moved = true; }
      }
      placed.push({ left, top });
      show.add(x.p.id);
      // Οι ετικέτες δημιουργούνται μία φορά και μόνο μετακινούνται (αλλιώς δεν πατιούνται).
      let el = els.get(x.p.id);
      if (!el) {
        el = document.createElement("a");
        el.className = "rt-ar-label"; el.href = `#/poi/${x.p.id}`; el.dataset.ar = x.p.id;
        el.innerHTML = `<b>${esc(L(x.p, "name"))}</b><span></span>`;
        labels.appendChild(el); els.set(x.p.id, el);
      }
      const scale = Math.max(0.8, 1.15 - x.d / 30);
      el.style.left = left.toFixed(0) + "px"; el.style.top = top.toFixed(0) + "px";
      el.style.transform = `translate(-50%,-100%) scale(${scale.toFixed(2)})`;
      el.style.zIndex = String(1000 - Math.round(x.d * 10));
      const dt = fmtDist(x.d); if (el.lastChild.textContent !== dt) el.lastChild.textContent = dt;
    });
    els.forEach((el, id) => { if (!show.has(id)) { el.remove(); els.delete(id); } });
    none.hidden = show.size > 0;
    drawRadar(radar, items, head);
  };
  labels.onclick = ev => {
    const a = ev.target.closest("[data-ar]"); if (!a) return;
    ev.preventDefault();
    track("ar", Number(a.dataset.ar));
    arStop(); wrap.remove();
    go(`/poi/${a.dataset.ar}`);
  };
  frame();
}

function drawRadar(c, items, head) {
  const R = 56, cx = 60, cy = 60;
  c.clearRect(0, 0, 120, 120);
  c.fillStyle = "rgba(0,0,0,.45)"; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.fillStyle = "rgba(255,255,255,.18)"; c.beginPath(); c.moveTo(cx, cy);
  c.arc(cx, cy, R, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42); c.closePath(); c.fill();
  items.forEach(x => {
    const a = (x.rel - 90) * Math.PI / 180, r = Math.min(1, x.d / 15) * (R - 6);
    c.fillStyle = "#fff"; c.beginPath(); c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, 0, Math.PI * 2); c.fill();
  });
  c.fillStyle = "#E8B04B"; c.font = "bold 11px system-ui"; c.textAlign = "center";
  const n = (-head - 90) * Math.PI / 180; c.fillText("N", cx + Math.cos(n) * (R - 9), cy + Math.sin(n) * (R - 9) + 4);
}
