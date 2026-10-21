// Service worker μόνο για να μπορεί η εφαρμογή να εγκατασταθεί στο κινητό.
// Δεν κρατάει τίποτα σε cache: κάθε νέα έκδοση φαίνεται αμέσως.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
