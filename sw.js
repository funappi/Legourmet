// Service worker : l'application s'ouvre sans réseau (favoris, historique, planning, courses, mode cuisine).
// Les recettes viennent du serveur IA : elles ne sont jamais mises en cache ici (elles restent dans le navigateur).
const CACHE = "lg-shell-v3";
const SHELL = [
  "./", "./index.html", "./style.css", "./manifest.webmanifest",
  "./inventory.js", "./units.js", "./settings.js", "./history.js", "./loader-art.js", "./shopping.js",
  "./pwa.js", "./menu.js", "./planning.js", "./cooking.js", "./main.js",
  "./icons/favicon.svg", "./icons/favicon-64.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Polices : cache d'abord, mise à jour en arrière-plan.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const refresh = fetch(req).then((res) => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || refresh;
    }));
    return;
  }

  // Le reste (serveur IA, CDN) passe directement par le réseau.
  if (url.origin !== self.location.origin) return;

  // Fichiers de l'appli : réseau d'abord (toujours la dernière version), cache en secours hors ligne.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});
