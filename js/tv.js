// Πλοήγηση με τηλεχειριστήριο για την έκδοση τηλεόρασης (tv.html).
// Βελάκια: μετακίνηση στο πλησιέστερο στοιχείο προς εκείνη την κατεύθυνση. OK/Enter: πάτημα. Return/Back: πίσω.
// Γραμμένο σε απλή JavaScript ώστε να τρέχει και σε παλαιότερους browsers τηλεοράσεων (Samsung Tizen).
(function () {
  var FOCUSABLE = 'button:not([disabled]), a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex="0"]';
  var KEY = { 37: "left", 38: "up", 39: "right", 40: "down" };
  var BACK_CODES = { 10009: 1, 461: 1, 8: 1, 27: 1 };   // Tizen Return, webOS Back, Backspace, Escape

  // Πλήκτρα του τηλεχειριστηρίου Samsung που θέλουμε να φτάνουν στη σελίδα.
  try {
    if (window.tizen && tizen.tvinputdevice) {
      ["MediaPlayPause", "ColorF0Red", "ColorF1Green"].forEach(function (k) { try { tizen.tvinputdevice.registerKey(k); } catch (e) {} });
    }
  } catch (e) {}

  function visible(el) {
    if (!el || el.offsetParent === null) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function items() {
    return Array.prototype.filter.call(document.querySelectorAll(FOCUSABLE), visible);
  }
  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function move(dir) {
    var list = items();
    var cur = document.activeElement;
    if (!cur || cur === document.body || list.indexOf(cur) < 0) { focusFirst(); return; }
    var a = cur.getBoundingClientRect(), ca = center(a);
    var best = null, bestScore = Infinity;
    list.forEach(function (el) {
      if (el === cur) return;
      var b = el.getBoundingClientRect(), cb = center(b);
      var dx = cb.x - ca.x, dy = cb.y - ca.y, main, side;
      if (dir === "right") { if (b.left < a.right - 2 && dx <= 0) return; main = Math.max(0, b.left - a.right); side = Math.abs(dy); }
      if (dir === "left")  { if (b.right > a.left + 2 && dx >= 0) return; main = Math.max(0, a.left - b.right); side = Math.abs(dy); }
      if (dir === "down")  { if (b.top < a.bottom - 2 && dy <= 0) return; main = Math.max(0, b.top - a.bottom); side = Math.abs(dx); }
      if (dir === "up")    { if (b.bottom > a.top + 2 && dy >= 0) return; main = Math.max(0, a.top - b.bottom); side = Math.abs(dx); }
      var score = main + side * 2;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) focus(best);
    else if (dir === "up") window.scrollTo(0, 0);
  }

  function focus(el) {
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    var r = el.getBoundingClientRect(), top = document.querySelector(".tb-top");
    var head = top ? top.getBoundingClientRect().bottom : 0, margin = window.innerHeight * 0.12;
    if (r.top < head + margin) window.scrollBy(0, r.top - head - margin);
    else if (r.bottom > window.innerHeight - margin) window.scrollBy(0, r.bottom - window.innerHeight + margin);
  }

  // Μετά από κάθε αλλαγή σελίδας: εστίαση στο πρώτο στοιχείο του περιεχομένου (όχι στην μπάρα).
  function focusFirst() {
    var main = document.getElementById("view");
    var inMain = items().filter(function (el) { return main && main.contains(el); });
    var pick = inMain[0] || items()[0];
    if (pick) focus(pick);
  }

  function isTyping(el) {
    return el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !/^(button|submit|checkbox|radio)$/i.test(el.type)));
  }

  document.addEventListener("keydown", function (ev) {
    var code = ev.keyCode, el = document.activeElement;
    var dir = KEY[code];
    if (dir) {
      // Μέσα σε πεδίο κειμένου τα ◀ ▶ μετακινούν τον κέρσορα, εκτός αν είμαστε στην άκρη.
      if (isTyping(el) && (dir === "left" || dir === "right")) {
        var len = (el.value || "").length, pos = el.selectionStart;
        if (pos !== null && pos !== undefined && ((dir === "left" && pos > 0) || (dir === "right" && pos < len))) return;
      }
      ev.preventDefault();
      move(dir);
      return;
    }
    if (BACK_CODES[code] && !(isTyping(el) && (code === 8))) {
      ev.preventDefault();
      if (isTyping(el)) { el.blur(); return; }
      if (window.tvBack) window.tvBack();
      return;
    }
    // OK σε στοιχείο που δεν είναι κουμπί (π.χ. κάρτα υπηρεσίας)
    if (code === 13 && el && el.getAttribute("tabindex") === "0" && el.tagName !== "BUTTON") { ev.preventDefault(); el.click(); }
  }, true);

  // Το «Πίσω» του browser δεν πρέπει να βγάζει από την οθόνη δωματίου.
  try {
    history.pushState({ tv: 1 }, "");
    window.addEventListener("popstate", function () {
      history.pushState({ tv: 1 }, "");
      if (window.tvBack) window.tvBack();
    });
  } catch (e) {}

  document.addEventListener("DOMContentLoaded", function () {
    var view = document.getElementById("view");
    if (!view || !window.MutationObserver) return;
    var timer = null;
    new MutationObserver(function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var a = document.activeElement;
        if (!a || a === document.body || !visible(a) || !document.contains(a)) focusFirst();
      }, 60);
    }).observe(view, { childList: true });
  });
})();
