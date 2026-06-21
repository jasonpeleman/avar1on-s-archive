// ============================================
//  AVAR1ON'S ARCHIVE — service-worker.js
//
//  Minimale service worker, nodig om de site als
//  PWA installeerbaar te maken (geen browserbalk,
//  eigen icoon op het beginscherm).
//
//  Cachet alleen de vaste opmaak-bestanden (CSS/JS/logo),
//  niet de kaartdata of API-aanroepen — die moeten altijd
//  vers blijven, anders zie je oude voortgang of data.
// ============================================

const CACHE_NAME = "avar1ons-archive-v2";


// Bij installatie: vaste bestanden alvast opslaan
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_FILES)),
  );
  self.skipWaiting();
});

// Oude caches opruimen bij een nieuwe versie
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

// Alleen de gecachete bestanden offline tonen; alles anders
// (API-data, Supabase) gaat altijd gewoon over het netwerk.
self.addEventListener("fetch", (event) => {
  if (PRECACHE_FILES.some((file) => event.request.url.endsWith(file))) {
    event.respondWith(
      caches
        .match(event.request)
        .then((cached) => cached || fetch(event.request)),
    );
  }
});
