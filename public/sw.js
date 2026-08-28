// PiaoConnect service worker
// Purpose: let the app SHELL (login page / dashboard chrome) open even with
// no internet connection — this does NOT cache live data. API calls (events,
// residents, notifications, etc.) still require a real connection; only the
// static HTML/JS/CSS that makes the interface appear is cached.
//
// IMPORTANT: this only takes effect against a PRODUCTION build
// (`npm run build`). While running `npm run dev`, Vite's dev server streams
// JS modules live and cannot be meaningfully cached for offline use — the
// service worker intentionally does nothing in that mode (see app.tsx,
// which only registers it when import.meta.env.PROD is true).

const CACHE_VERSION = "piao-shell-v1";
const SHELL_URL = "/";
const PRECACHE_URLS = [SHELL_URL, "/favicon.ico", "/logo-removebg-preview.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {
      // Best-effort — if one precache asset 404s, don't block install.
    }))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

function isBuildAsset(url) {
  return url.pathname.startsWith("/build/");
}

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_VERSION);
    cache.put(SHELL_URL, response.clone());
    return response;
  } catch {
    const cached = await caches.match(SHELL_URL);
    if (cached) return cached;
    throw new Error("Offline and no cached shell available yet.");
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(CACHE_VERSION);
  cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Full-page navigations (typing the URL, refreshing, opening the app
  // fresh) — this is what makes the interface open with no connection.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstShell(request));
    return;
  }

  // Hashed, immutable Vite build output — safe to cache aggressively.
  if (isBuildAsset(url)) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  // Everything else (API calls, /storage/ files, etc.) passes through
  // untouched — those need a live connection and should fail normally
  // when offline so the app's existing error handling can react.
});
