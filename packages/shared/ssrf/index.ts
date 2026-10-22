// Outbound URL checks for requests to addresses a customer chose: webhooks,
// media URLs and connected MCP servers. A URL passes only if it uses https (or
// http when allowed), is not a private, loopback or link-local literal, and,
// before a fetch, its DNS answers are all public.
//
// safeFetch re-checks every redirect hop, drops credentials when a redirect
// leaves the original origin, times out, and caps the response body.
//
// The gateway and the web API each use a generated copy
// (scripts/sync-ssrf.mjs). Keep it dependency-free.

export type PublicUrlRejection =
	| "url_required"
	| "url_invalid"
	| "url_must_use_https"
	| "url_private_network_not_allowed"
	| "url_dns_resolution_failed";

export type PublicUrlValidation =
	| { ok: true; url: string }
	| { ok: false; reason: PublicUrlRejection };

export type DnsResolver = (hostname: string) => Promise<string[]>;

export type PublicUrlOptions = {
	allowHttp?: boolean;
	/** Replaces the DNS-over-HTTPS lookup, for tests. */
	resolveAddresses?: DnsResolver;
	/** Skips the DNS lookup. Literal addresses are still checked. */
	skipDns?: boolean;
};

export class SsrfError extends Error {
	readonly code: string;
	constructor(code: string) {
		super(code);
		this.name = "SsrfError";
		this.code = code;
	}
}

function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeHostname(value: string): string {
	return value.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

function isPrivateIpv4(hostname: string): boolean {
	const octets = hostname.split(".");
	if (octets.length !== 4) return false;
	const parts = octets.map((part) => {
		if (!/^\d+$/.test(part)) return Number.NaN;
		const value = Number(part);
		return Number.isInteger(value) && value >= 0 && value <= 255 ? value : Number.NaN;
	});
	if (parts.some((part) => Number.isNaN(part))) return false;
	const [a, b] = parts as [number, number, number, number];
	return (
		a === 0 ||
		a === 10 ||
		(a === 100 && b >= 64 && b <= 127) ||
		a === 127 ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 0) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19)) ||
		a >= 224
	);
}

function parseIpv6Words(hostnameRaw: string): number[] | null {
	let hostname = normalizeHostname(hostnameRaw);
	if (!hostname || hostname.includes("%") || (hostname.match(/::/g)?.length ?? 0) > 1) return null;

	if (hostname.includes(".")) {
		const separator = hostname.lastIndexOf(":");
		if (separator < 0) return null;
		const ipv4 = hostname.slice(separator + 1);
		const parts = ipv4.split(".");
		const octets = parts.map((part) => Number(part));
		if (octets.length !== 4 || octets.some((value, index) =>
			!/^\d+$/.test(parts[index] ?? "") || !Number.isInteger(value) || value < 0 || value > 255
		)) return null;
		const [o0, o1, o2, o3] = octets as [number, number, number, number];
		hostname = `${hostname.slice(0, separator)}:${((o0 << 8) | o1).toString(16)}:${((o2 << 8) | o3).toString(16)}`;
	}

	const hasCompression = hostname.includes("::");
	const [leftRaw = "", rightRaw = ""] = hostname.split("::");
	const parseSide = (side: string): number[] | null => {
		if (!side) return [];
		const words = side.split(":");
		if (words.some((word) => !/^[0-9a-f]{1,4}$/i.test(word))) return null;
		return words.map((word) => Number.parseInt(word, 16));
	};
	const left = parseSide(leftRaw);
	const right = parseSide(rightRaw);
	if (!left || !right) return null;
	if (!hasCompression) return left.length === 8 ? left : null;
	const missing = 8 - left.length - right.length;
	if (missing < 1) return null;
	return [...left, ...Array<number>(missing).fill(0), ...right];
}

function embeddedIpv4(words: number[]): string {
	const high = words[6] ?? 0;
	const low = words[7] ?? 0;
	return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isPrivateIpv6(hostnameRaw: string): boolean {
	const words = parseIpv6Words(hostnameRaw);
	if (!words) return false;
	const first = words[0] ?? 0;
	if (words.every((word) => word === 0)) return true;
	if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true;
	if ((first & 0xfe00) === 0xfc00) return true;
	if ((first & 0xffc0) === 0xfe80) return true;
	if ((first & 0xff00) === 0xff00) return true;

	const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
	const compatible = words.slice(0, 6).every((word) => word === 0);
	const nat64 = first === 0x64 && words[1] === 0xff9b && words.slice(2, 6).every((word) => word === 0);
	return (mapped || compatible || nat64) && isPrivateIpv4(embeddedIpv4(words));
}

/** True for localhost names and private, loopback, link-local or multicast IP literals. */
export function isPrivateOrLocalhostLiteral(hostnameRaw: string): boolean {
	const hostname = normalizeHostname(hostnameRaw);
	if (!hostname) return true;
	if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
	if (isPrivateIpv4(hostname)) return true;
	if (isPrivateIpv6(hostname)) return true;
	return false;
}

export function isIpLiteral(hostnameRaw: string): boolean {
	const hostname = normalizeHostname(hostnameRaw);
	return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || parseIpv6Words(hostname) !== null;
}

/** Checks the URL's scheme and literal host without a DNS lookup. Drops the fragment. */
export function validatePublicUrl(value: unknown, options?: { allowHttp?: boolean }): PublicUrlValidation {
	const text = normalizeText(value);
	if (!text) return { ok: false, reason: "url_required" };
	let parsed: URL;
	try {
		parsed = new URL(text);
	} catch {
		return { ok: false, reason: "url_invalid" };
	}
	if (parsed.protocol !== "https:" && !(options?.allowHttp && parsed.protocol === "http:")) {
		return { ok: false, reason: "url_must_use_https" };
	}
	if (isPrivateOrLocalhostLiteral(parsed.hostname)) {
		return { ok: false, reason: "url_private_network_not_allowed" };
	}
	parsed.hash = "";
	return { ok: true, url: parsed.toString() };
}

/** Resolves A and AAAA records with Cloudflare's DNS-over-HTTPS API. */
export async function resolveDnsAddresses(hostname: string): Promise<string[]> {
	const out = new Set<string>();
	for (const type of ["A", "AAAA"] as const) {
		const url = new URL("https://cloudflare-dns.com/dns-query");
		url.searchParams.set("name", hostname);
		url.searchParams.set("type", type);
		const response = await fetch(url.toString(), {
			headers: { Accept: "application/dns-json" },
			signal: AbortSignal.timeout(5_000),
		});
		if (!response.ok) throw new Error(`dns_${type.toLowerCase()}_${response.status}`);
		const payload = await response.json().catch(() => null) as { Answer?: Array<{ data?: unknown }> } | null;
		for (const answer of Array.isArray(payload?.Answer) ? payload.Answer : []) {
			const data = normalizeText(answer.data);
			if (data && (/^\d+\.\d+\.\d+\.\d+$/.test(data) || data.includes(":"))) {
				out.add(data);
			}
		}
	}
	return [...out];
}

/** validatePublicUrl, then checks that every DNS answer for the host is public. */
export async function validatePublicUrlForFetch(value: unknown, options?: PublicUrlOptions): Promise<PublicUrlValidation> {
	const validated = validatePublicUrl(value, { allowHttp: options?.allowHttp });
	if (!validated.ok) return validated;
	const hostname = new URL(validated.url).hostname;
	if (isIpLiteral(hostname) || options?.skipDns) return validated;
	let addresses: string[];
	try {
		addresses = await (options?.resolveAddresses ?? resolveDnsAddresses)(hostname);
	} catch {
		return { ok: false, reason: "url_dns_resolution_failed" };
	}
	if (addresses.length === 0) return { ok: false, reason: "url_dns_resolution_failed" };
	if (addresses.some((address) => isPrivateOrLocalhostLiteral(address))) {
		return { ok: false, reason: "url_private_network_not_allowed" };
	}
	return validated;
}

export type SafeFetchOptions = PublicUrlOptions & {
	/** Whole request, including redirects and reading the body. Default 10 s. */
	timeoutMs?: number;
	/** Default 3. Only GET and HEAD requests follow redirects; others return the 3xx response. */
	maxRedirects?: number;
	/** The body stream errors with ssrf_response_too_large past this many bytes. */
	maxBytes?: number;
	fetch?: typeof fetch;
};

const CREDENTIAL_HEADERS = ["authorization", "cookie", "proxy-authorization"];

function limitBody(response: Response, maxBytes: number): Response {
	const declared = response.headers.get("content-length");
	if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared) > maxBytes) {
		void response.body?.cancel().catch(() => undefined);
		throw new SsrfError("ssrf_response_too_large");
	}
	if (!response.body) return response;
	let total = 0;
	const limited = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			total += chunk.byteLength;
			if (total > maxBytes) {
				controller.error(new SsrfError("ssrf_response_too_large"));
				return;
			}
			controller.enqueue(chunk);
		},
	}));
	return new Response(limited, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/**
 * fetch for customer-chosen URLs. Throws SsrfError when a hop is rejected,
 * a redirect loops past maxRedirects, or the request times out.
 */
export async function safeFetch(input: string | URL, init?: RequestInit, options?: SafeFetchOptions): Promise<Response> {
	const fetchImpl = options?.fetch ?? fetch;
	const maxRedirects = options?.maxRedirects ?? 3;
	const method = (init?.method ?? "GET").toUpperCase();
	const timeout = AbortSignal.timeout(options?.timeoutMs ?? 10_000);
	const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
	const headers = new Headers(init?.headers);
	let currentUrl = input.toString();
	let origin: string | null = null;

	for (let hop = 0; hop <= maxRedirects; hop += 1) {
		const validated = await validatePublicUrlForFetch(currentUrl, options);
		if (validated.ok === false) throw new SsrfError(`ssrf_${validated.reason}`);
		const target = new URL(validated.url);
		if (origin === null) origin = target.origin;
		else if (target.origin !== origin) for (const name of CREDENTIAL_HEADERS) headers.delete(name);

		let response: Response;
		try {
			response = await fetchImpl(validated.url, { ...init, headers: new Headers(headers), redirect: "manual", signal });
		} catch (error) {
			if (timeout.aborted) throw new SsrfError("ssrf_timeout");
			throw error;
		}
		const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
		if (!location || (method !== "GET" && method !== "HEAD")) {
			return options?.maxBytes === undefined ? response : limitBody(response, options.maxBytes);
		}
		await response.body?.cancel().catch(() => undefined);
		if (hop === maxRedirects) break;
		currentUrl = new URL(location, validated.url).toString();
	}
	throw new SsrfError("ssrf_too_many_redirects");
}
