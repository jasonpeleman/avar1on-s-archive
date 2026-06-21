// ============================================
//  AVAR1ON'S ARCHIVE — service-worker.js
//
//  Minimale service worker, nodig om de site als
//  PWA installeerbaar te maken (geen browserbalk,
//  eigen icoon op het beginscherm).
//
//  STRATEGIE: "network-first" — bij elk bezoek wordt eerst
//  geprobeerd de nieuwste versie van een bestand op te halen
//  via het netwerk. Alleen als dat mislukt (geen internet)
//  valt de site terug op de laatst gecachete versie. Dit
//  voorkomt dat wijzigingen aan CSS/HTML "vast blijven zitten"
//  in een oude cache.
//
//  BELANGRIJK: verhoog CACHE_NAME (v1 -> v2 -> v3, ...) telkens
//  als je deze service worker zelf aanpast, zodat oude caches
//  netjes opgeruimd worden.
// ============================================

const CACHE_NAME = 'avar1ons-archive-v2';

const PRECACHE_FILES = [
  'index.html',
  'style.css',
  'assets/logo.png',
];

// Bij installatie: vaste bestanden alvast opslaan
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_FILES))
  );
  self.skipWaiting();
});

// Oude caches opruimen bij een nieuwe versie
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first: probeer eerst het netwerk (altijd de nieuwste versie),
// val terug op cache alleen als het netwerk niet bereikbaar is.
self.addEventListener('fetch', (event) => {
  if (PRECACHE_FILES.some((file) => event.request.url.endsWith(file))) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Verse versie ophalen gelukt: cache bijwerken voor offline-gebruik later
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)) // geen internet: terugvallen op cache
    );
  }
});
