// Private-network checks for customer-supplied endpoint URLs (webhooks,
// Broadcast destinations). This mirrors the gateway's checks in
// apps/api/src/core/webhook-endpoints.ts (validateWebhookEndpointUrl and
// validateWebhookEndpointUrlForDelivery); the two apps share no package, so
// keep both copies in step when either changes.

export type PublicEndpointUrlFailure = "invalid" | "protocol" | "private_network" | "dns_resolution_failed";

export type PublicEndpointUrlValidation =
	| { ok: true; url: URL }
	| { ok: false; reason: PublicEndpointUrlFailure };

type DnsResolver = (hostname: string) => Promise<string[]>;

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
	const [a, b] = parts;
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
		hostname = `${hostname.slice(0, separator)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
	}

	const hasCompression = hostname.includes("::");
	const [leftRaw, rightRaw = ""] = hostname.split("::");
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

function ipv4FromWords(high: number, low: number): string {
	return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
}

function isPrivateIpv6(hostnameRaw: string): boolean {
	const words = parseIpv6Words(hostnameRaw);
	if (!words) return false;
	if (words.every((word) => word === 0)) return true;
	if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true;
	if ((words[0] & 0xfe00) === 0xfc00) return true;
	if ((words[0] & 0xffc0) === 0xfe80) return true;
	if ((words[0] & 0xff00) === 0xff00) return true;
	if ((words[0] & 0xffc0) === 0xfec0) return true;
	if (words[0] === 0x2001 && words[1] === 0) return true;
	if (words[0] === 0x64 && words[1] === 0xff9b && words[2] === 1) return true;
	if (words[0] === 0x2002) return isPrivateIpv4(ipv4FromWords(words[1], words[2]));

	const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
	const translated = words.slice(0, 4).every((word) => word === 0) && words[4] === 0xffff && words[5] === 0;
	const compatible = words.slice(0, 6).every((word) => word === 0);
	const nat64 = words[0] === 0x64 && words[1] === 0xff9b && words.slice(2, 6).every((word) => word === 0);
	return (mapped || translated || compatible || nat64) && isPrivateIpv4(ipv4FromWords(words[6], words[7]));
}

/** True for localhost names and private, loopback, link-local or tunnelled IP literals. */
export function isPrivateOrLocalhostHost(hostnameRaw: string): boolean {
	const hostname = normalizeHostname(hostnameRaw);
	if (!hostname) return true;
	if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
	return isPrivateIpv4(hostname) || isPrivateIpv6(hostname);
}

function isIpLiteral(hostnameRaw: string): boolean {
	const hostname = normalizeHostname(hostnameRaw);
	return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || parseIpv6Words(hostname) !== null;
}

/** Checks the URL text only: scheme, credentials and IP literals. No DNS. */
export function validatePublicEndpointUrl(
	value: string,
	options: { allowHttp?: boolean } = {},
): PublicEndpointUrlValidation {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		return { ok: false, reason: "invalid" };
	}
	if (url.protocol !== "https:" && !(options.allowHttp && url.protocol === "http:")) {
		return { ok: false, reason: "protocol" };
	}
	if (url.username || url.password || isPrivateOrLocalhostHost(url.hostname)) {
		return { ok: false, reason: "private_network" };
	}
	return { ok: true, url };
}

async function resolveDnsAddresses(hostname: string): Promise<string[]> {
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
			const data = typeof answer.data === "string" ? answer.data.trim() : "";
			if (data && (/^\d+\.\d+\.\d+\.\d+$/.test(data) || data.includes(":"))) out.add(data);
		}
	}
	return [...out];
}

function shouldSkipDnsPreflight(): boolean {
	return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV === "test";
}

/**
 * Checks the URL text, then resolves a hostname over DNS-over-HTTPS and
 * rejects it if any answer is private. Run it just before sending.
 */
export async function validatePublicEndpointUrlForDelivery(
	value: string,
	options: { allowHttp?: boolean; resolveAddresses?: DnsResolver; forceDns?: boolean } = {},
): Promise<PublicEndpointUrlValidation> {
	const validated = validatePublicEndpointUrl(value, options);
	if (!validated.ok) return validated;
	const hostname = validated.url.hostname;
	if (isIpLiteral(hostname)) return validated;
	if (!options.forceDns && !options.resolveAddresses && shouldSkipDnsPreflight()) return validated;
	let addresses: string[];
	try {
		addresses = await (options.resolveAddresses ?? resolveDnsAddresses)(normalizeHostname(hostname));
	} catch {
		return { ok: false, reason: "dns_resolution_failed" };
	}
	if (addresses.length === 0) return { ok: false, reason: "dns_resolution_failed" };
	if (addresses.some((address) => isPrivateOrLocalhostHost(address))) {
		return { ok: false, reason: "private_network" };
	}
	return validated;
}
