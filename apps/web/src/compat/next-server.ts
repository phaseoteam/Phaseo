// `next/server` for route handlers and middleware helpers.
type CookieRecord = { name: string; value: string };

function parseCookieHeader(header: string | null): Map<string, string> {
	const map = new Map<string, string>();
	if (!header) return map;
	for (const part of header.split(/;\s*/)) {
		const eq = part.indexOf("=");
		if (eq <= 0) continue;
		const name = part.slice(0, eq).trim();
		const raw = part.slice(eq + 1).trim();
		try {
			map.set(name, decodeURIComponent(raw));
		} catch {
			map.set(name, raw);
		}
	}
	return map;
}

class RequestCookies {
	#map: Map<string, string>;
	constructor(headers: Headers) {
		this.#map = parseCookieHeader(headers.get("cookie"));
	}
	get(name: string): CookieRecord | undefined {
		const value = this.#map.get(name);
		return value === undefined ? undefined : { name, value };
	}
	getAll(name?: string): CookieRecord[] {
		const all = [...this.#map].map(([n, value]) => ({ name: n, value }));
		return name ? all.filter((c) => c.name === name) : all;
	}
	has(name: string): boolean {
		return this.#map.has(name);
	}
	set(name: string, value: string): this {
		this.#map.set(name, value);
		return this;
	}
	delete(name: string): boolean {
		return this.#map.delete(name);
	}
	get size(): number {
		return this.#map.size;
	}
	[Symbol.iterator]() {
		return [...this.#map].map(([name, value]) => [name, { name, value }] as const)[Symbol.iterator]();
	}
}

type CookieOptions = { path?: string; domain?: string; maxAge?: number; expires?: Date | number; httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none" | boolean; priority?: string; partitioned?: boolean };

function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
	const parts = [`${name}=${encodeURIComponent(value)}`];
	parts.push(`Path=${options.path ?? "/"}`);
	if (options.domain) parts.push(`Domain=${options.domain}`);
	if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
	if (options.expires !== undefined) parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.sameSite) parts.push(`SameSite=${options.sameSite === true ? "Strict" : String(options.sameSite).replace(/^./, (c) => c.toUpperCase())}`);
	if (options.partitioned) parts.push("Partitioned");
	return parts.join("; ");
}

class ResponseCookies {
	#headers: Headers;
	constructor(headers: Headers) {
		this.#headers = headers;
	}
	set(nameOrOptions: string | (CookieOptions & { name: string; value: string }), value?: string, options?: CookieOptions): this {
		if (typeof nameOrOptions === "string") this.#headers.append("set-cookie", serializeCookie(nameOrOptions, value ?? "", options));
		else this.#headers.append("set-cookie", serializeCookie(nameOrOptions.name, nameOrOptions.value, nameOrOptions));
		return this;
	}
	delete(name: string | { name: string; path?: string; domain?: string }): this {
		const opts = typeof name === "string" ? { name } : name;
		this.#headers.append("set-cookie", serializeCookie(opts.name, "", { path: opts.path, domain: opts.domain, maxAge: 0, expires: 0 }));
		return this;
	}
	get(_name: string): CookieRecord | undefined {
		return undefined;
	}
	getAll(): CookieRecord[] {
		return [];
	}
}

export class NextURL extends URL {
	clone(): NextURL {
		return new NextURL(this.toString());
	}
}

export class NextRequest extends Request {
	readonly nextUrl: NextURL;
	readonly cookies: RequestCookies;
	constructor(input: RequestInfo | URL, init?: RequestInit) {
		super(input as RequestInfo, init);
		this.nextUrl = new NextURL(this.url);
		this.cookies = new RequestCookies(this.headers);
	}
	static from(request: Request): NextRequest {
		return request instanceof NextRequest ? request : new NextRequest(request);
	}
}

export class NextResponse<Body = unknown> extends Response {
	readonly cookies: ResponseCookies;
	declare readonly __body?: Body;
	constructor(body?: BodyInit | null, init?: ResponseInit) {
		super(body, init);
		this.cookies = new ResponseCookies(this.headers);
	}
	static json<T>(body: T, init?: ResponseInit): NextResponse<T> {
		const headers = new Headers(init?.headers);
		if (!headers.has("content-type")) headers.set("content-type", "application/json");
		return new NextResponse<T>(JSON.stringify(body), { ...init, headers });
	}
	static redirect(url: string | URL, init?: number | ResponseInit): NextResponse {
		const status = typeof init === "number" ? init : init?.status ?? 307;
		const headers = new Headers(typeof init === "object" ? init.headers : undefined);
		headers.set("location", String(url));
		return new NextResponse(null, { status, headers });
	}
	static rewrite(url: string | URL, init?: ResponseInit): NextResponse {
		const headers = new Headers(init?.headers);
		headers.set("x-middleware-rewrite", String(url));
		return new NextResponse(null, { ...init, headers });
	}
	static next(init?: ResponseInit & { request?: { headers?: Headers } }): NextResponse {
		const headers = new Headers(init?.headers);
		headers.set("x-middleware-next", "1");
		return new NextResponse(null, { ...init, headers });
	}
}

export type NextFetchEvent = { waitUntil(promise: Promise<unknown>): void };
export type NextMiddleware = (request: NextRequest, event: NextFetchEvent) => Response | NextResponse | undefined | Promise<Response | NextResponse | undefined>;

export async function connection(): Promise<void> {
	// Dynamic rendering is the default in web-start.
}

export function after(task: Promise<unknown> | (() => unknown)): void {
	const promise = typeof task === "function" ? Promise.resolve().then(task) : task;
	void import("./wait-until").then(({ waitUntil }) => waitUntil(promise)).catch(() => undefined);
}

export function userAgent(request: { headers: Headers }) {
	const ua = request.headers.get("user-agent") ?? "";
	return { ua, isBot: /bot|crawl|spider|slurp|bingpreview/i.test(ua), browser: {}, device: {}, engine: {}, os: {}, cpu: {} };
}

export function userAgentFromString(ua: string | undefined) {
	return userAgent({ headers: new Headers({ "user-agent": ua ?? "" }) });
}
