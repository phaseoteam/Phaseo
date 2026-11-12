import { sdkExportStore, sdkRequestFromChat } from "@/lib/chat/sdkExport";
import { isPublicLocale } from "@/i18n/locales";
import { anySignal, timeoutSignal } from "@/lib/abortSignals";

const DEFAULT_WEB_API_ORIGIN = "https://phaseo.app";
const PUBLIC_WEB_API_TIMEOUT_MS = 15_000;

export class WebApiError extends Error {
	readonly status: number;
	readonly detail?: string;
	readonly issues?: Array<{ path: string; message: string }>;
	/** The response's machine-readable `error`, kept even when `detail` is its message. */
	readonly code?: string;

	constructor(path: string, status: number, detail?: string, issues?: Array<{ path: string; message: string }>, code?: string) {
		super(detail || `Cloudflare web API request failed (${status}): ${path}`);
		this.name = "WebApiError";
		this.status = status;
		this.detail = detail;
		this.issues = issues;
		this.code = code;
	}
}

function getWebApiOrigin(): string {
	if (typeof window !== "undefined") return "";
	return (process.env.WEB_API_ORIGIN ?? DEFAULT_WEB_API_ORIGIN).replace(/\/+$/, "");
}

async function readJsonPayload<T>(
	response: Response,
	path: string,
): Promise<
		(T & { error?: unknown; message?: unknown; detail?: unknown; issues?: Array<{path:string;message:string}> }) | undefined
> {
	const body = await response.text();
	if (!body.trim()) return undefined;

	try {
		return JSON.parse(body) as T & {
			error?: unknown;
			message?: unknown;
			detail?: unknown;
		};
	} catch {
		throw new WebApiError(
			path,
			response.status,
			`Expected a JSON response but received ${response.headers.get("content-type") || "an unknown content type"}.`,
		);
	}
}

/**
 * Fetch public website data from the Cloudflare Worker.
 *
 * Public freshness, stale serving, cache tags, and revalidation are owned by
 * the web API Worker's Cloudflare cache. Server renders add a short layer on
 * top (renderCache below) so a page doesn't wait on that round trip each time.
 */
async function fetchPublicWebApiUncached<T>(
	path: `/api/_web/${string}`,
	options: { signal?: AbortSignal; credentials?: RequestCredentials } = {},
): Promise<T> {
	// Bound both fetching and reading the body so a slow upstream lets the page
	// reach its fallback instead of hanging.
	const deadline = timeoutSignal(PUBLIC_WEB_API_TIMEOUT_MS);
	const response = await fetch(`${getWebApiOrigin()}${path}`, {
		headers: { Accept: "application/json" },
		signal: options.signal
			? anySignal([options.signal, deadline])
			: deadline,
		credentials: options.credentials ?? "omit",
	});

	if (!response.ok) {
		throw new WebApiError(path, response.status);
	}

	return (await response.json()) as T;
}

export function fetchPublicWebApi<T>(
	path: `/api/_web/${string}`,
	options: { signal?: AbortSignal; credentials?: RequestCredentials } = {},
): Promise<T> {
	// Repeated reads within a request are shared by the react-query client, which
	// also owns browser revalidation.
	if (typeof window === "undefined" && (options.credentials ?? "omit") === "omit") {
		return fetchPublicWebApiForRender<T>(path, options);
	}
	return fetchPublicWebApiUncached<T>(path, options);
}

// Server renders keep public responses (no cookies, so the same for everyone)
// in the Workers Cache API of the data centre: fresh for a minute, then served
// once while a background request refreshes them, for up to a day. Keys carry
// the build, so a deploy starts clean.
declare const __PHASEO_BUILD_ID__: string;
const RENDER_CACHE_FRESH_MS = 60_000;
const RENDER_CACHE_STALE_MS = 86_400_000;
const FETCHED_AT_HEADER = "x-phaseo-fetched-at";

function renderCache(): Cache | null {
	const storage = (globalThis as { caches?: CacheStorage & { default?: Cache } }).caches;
	return storage?.default ?? null;
}

function renderCacheKey(path: string): Request {
	const buildId = typeof __PHASEO_BUILD_ID__ === "string" ? __PHASEO_BUILD_ID__ : "dev";
	return new Request(`${getWebApiOrigin()}${path}${path.includes("?") ? "&" : "?"}__render=${encodeURIComponent(buildId)}`);
}

async function storeRendered(cache: Cache, key: Request, body: unknown): Promise<void> {
	await cache.put(key, new Response(JSON.stringify(body), {
		headers: {
			"content-type": "application/json",
			"cache-control": `public, max-age=${RENDER_CACHE_STALE_MS / 1000}`,
			[FETCHED_AT_HEADER]: String(Date.now()),
		},
	}));
}

async function refreshRendered(cache: Cache, key: Request, path: `/api/_web/${string}`): Promise<void> {
	try {
		await storeRendered(cache, key, await fetchPublicWebApiUncached(path));
	} catch (error) {
		// A resource that is gone must not keep being served from the cache.
		if (error instanceof WebApiError && error.status === 404) await cache.delete(key);
	}
}

async function fetchPublicWebApiForRender<T>(
	path: `/api/_web/${string}`,
	options: { signal?: AbortSignal; credentials?: RequestCredentials },
): Promise<T> {
	const cache = renderCache();
	if (!cache) return fetchPublicWebApiUncached<T>(path, options);
	const key = renderCacheKey(path);
	const hit = await cache.match(key).catch(() => undefined);
	if (hit) {
		const age = Date.now() - Number(hit.headers.get(FETCHED_AT_HEADER) ?? 0);
		if (age >= 0 && age < RENDER_CACHE_STALE_MS) {
			const body = (await hit.json().catch(() => undefined)) as T | undefined;
			if (body !== undefined) {
				if (age >= RENDER_CACHE_FRESH_MS) {
					const { waitUntil } = await import("@/lib/start/wait-until");
					void waitUntil(refreshRendered(cache, key, path));
				}
				return body;
			}
		}
	}
	const body = await fetchPublicWebApiUncached<T>(path, options);
	const { waitUntil } = await import("@/lib/start/wait-until");
	void waitUntil(storeRendered(cache, key, body));
	return body;
}

export async function fetchOptionalPublicWebApi<T>(
	path: `/api/_web/${string}`,
	options: { signal?: AbortSignal } = {},
): Promise<T | null> {
	try {
		return await fetchPublicWebApi<T>(path, options);
	} catch (error) {
		if (error instanceof WebApiError && error.status === 404) return null;
		throw error;
	}
}

export async function fetchAccountWebApi<T>(
	path: `/api/account/${string}`,
	accessToken?: string | null,
	init: RequestInit = {},
): Promise<T> {
	const response = await fetch(`${getWebApiOrigin()}${path}`, {
		...init,
		headers: {
			Accept: "application/json",
			...(init.body ? { "Content-Type": "application/json" } : {}),
			...init.headers,
			...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
		},
		cache: "no-store",
	});
	const payload = await readJsonPayload<T>(response, path);
	if (!response.ok) {
		throw new WebApiError(
			path,
			response.status,
			typeof payload?.message === "string"
				? payload.message
				: typeof payload?.detail === "string"
					? payload.detail
					: typeof payload?.error === "string" ? payload.error : undefined,
			Array.isArray(payload?.issues) ? payload.issues.slice(0, 10) : undefined,
			typeof payload?.error === "string" ? payload.error : undefined,
		);
	}
	return payload as T;
}

export async function fetchInternalWebApi<T>(
	path: `/api/internal/${string}`,
	accessToken: string | null,
	init: RequestInit = {},
): Promise<T> {
	const response = await fetch(`${getWebApiOrigin()}${path}`, {
		...init,
		headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
		cache: "no-store",
	});
	const payload = await readJsonPayload<T>(response, path);
	if (!response.ok) throw new WebApiError(path, response.status, typeof payload?.error === "string" ? payload.error : undefined);
	return payload as T;
}

export async function fetchInternalWebApiResponse(
	path: `/api/internal/${string}`,
	accessToken: string | null,
	init: RequestInit = {},
): Promise<Response> {
	return fetch(`${getWebApiOrigin()}${path}`, {
		...init,
		headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
		cache: "no-store",
	});
}

/** Authenticated, private chat proxy request owned by the Cloudflare Worker. */
export async function fetchChatWebApi(path: `/api/chat/${string}`, init: RequestInit = {}): Promise<Response> {
	const sdkRequest = typeof window === "undefined" ? null : sdkRequestFromChat(path, init);
	if (sdkRequest) sdkExportStore.set(sdkRequest);
	const { getBrowserAccessToken } = await import("@/lib/fetchers/internal/accountAuthClient");
	const accessToken = await getBrowserAccessToken();
	const response = await fetch(`${getWebApiOrigin()}${path}`, {
		...init,
		headers: { ...init.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
		cache: "no-store",
	});
	if (sdkRequest && sdkExportStore.get() === sdkRequest) sdkExportStore.set({ ...sdkRequest, status: response.status, requestId: response.headers.get("x-request-id") ?? response.headers.get("x-phaseo-request-id") ?? undefined });
	if (response.status === 403 && typeof window !== "undefined") {
		const payload = await response.clone().json().catch(() => null);
		if (payload?.error === "chat_privacy_review_required") {
			const locale = window.location.pathname.split("/")[1];
			window.location.assign(`${isPublicLocale(locale) ? `/${locale}` : ""}/chat`);
		}
	}
	return response;
}
