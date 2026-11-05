// Cookie header parsing and Set-Cookie serialisation for server routes and
// the request middleware.

export type CookieRecord = { name: string; value: string };

export type CookieOptions = {
	path?: string;
	domain?: string;
	maxAge?: number;
	expires?: Date | number;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "lax" | "strict" | "none" | boolean;
	partitioned?: boolean;
};

/** Every cookie in a `Cookie` header, values URI-decoded where possible. */
export function parseCookieHeader(header: string | null | undefined): CookieRecord[] {
	if (!header) return [];
	return header.split(/;\s*/).flatMap((part) => {
		const eq = part.indexOf("=");
		if (eq <= 0) return [];
		const raw = part.slice(eq + 1).trim();
		let value = raw;
		try {
			value = decodeURIComponent(raw);
		} catch {
			// Keep the raw value.
		}
		return [{ name: part.slice(0, eq).trim(), value }];
	});
}

/** One cookie from a request's `Cookie` header. */
export function readRequestCookie(request: Request, name: string): string | undefined {
	return parseCookieHeader(request.headers.get("cookie")).find((cookie) => cookie.name === name)?.value;
}

/** A `Set-Cookie` header value. The path defaults to `/`. */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
	const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? "/"}`];
	if (options.domain) parts.push(`Domain=${options.domain}`);
	if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
	if (options.expires !== undefined) parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.sameSite) parts.push(`SameSite=${options.sameSite === true ? "Strict" : String(options.sameSite).replace(/^./, (c) => c.toUpperCase())}`);
	if (options.partitioned) parts.push("Partitioned");
	return parts.join("; ");
}
