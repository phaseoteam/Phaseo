const CACHE_NAME = "phaseo-offline-v1";
const OFFLINE_URL = "/offline.html";
const OFFLINE_ASSETS = [OFFLINE_URL, "/png_logo_dark.png"];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)),
	);
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter(
							(key) => key.startsWith("phaseo-offline-") && key !== CACHE_NAME,
						)
						.map((key) => caches.delete(key)),
				),
		)
		.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;

	// Keep API, authenticated, RSC, and asset requests on their existing network and
	// browser-cache paths. Only replace failed document navigations with the offline page.
	if (request.method !== "GET" || request.mode !== "navigate") {
		return;
	}

	event.respondWith(
		fetch(request).catch(async () => {
			const offlineResponse = await caches.match(OFFLINE_URL);
			return offlineResponse ?? Response.error();
		}),
	);
});
