// Purpose: Injected fetch for the provider simulator.
// Why: Captures the exact upstream request and guarantees no request leaves the process.
// How: Replaces globalThis.fetch for the duration of one scenario and routes every call to a responder.

export type CapturedRequest = {
	url: string;
	method: string;
	headers: Record<string, string>;
	bodyText: string | null;
	bodyJson: any;
};

export type Responder = (request: CapturedRequest, index: number) => Response | Promise<Response>;

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
	if (!headers) return {};
	if (headers instanceof Headers) return Object.fromEntries(headers.entries());
	if (Array.isArray(headers)) return Object.fromEntries(headers);
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (value !== undefined) out[key.toLowerCase()] = String(value);
	}
	return out;
}

async function readBody(body: unknown): Promise<string | null> {
	if (body === undefined || body === null) return null;
	if (typeof body === "string") return body;
	if (body instanceof Uint8Array) return new TextDecoder().decode(body);
	if (body instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(body));
	if (typeof Blob !== "undefined" && body instanceof Blob) return await body.text();
	if (body instanceof FormData) {
		const parts: string[] = [];
		for (const [key, value] of body.entries()) {
			parts.push(`${key}=${typeof value === "string" ? value : `<file ${(value as File).name ?? "blob"}>`}`);
		}
		return parts.join("&");
	}
	if (body instanceof ReadableStream) return await new Response(body).text();
	return String(body);
}

const TINY_PNG = Uint8Array.from(
	atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
	(char) => char.charCodeAt(0),
);

/** Media and auth calls an executor may make before the provider call. */
/** True for the simulator's fake Supabase host only, compared on the parsed host rather than a URL prefix. */
export function isSimSupabase(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:" && parsed.hostname === "supabase.sim.invalid";
	} catch {
		return false;
	}
}

export function defaultSideResponse(request: CapturedRequest): Response | null {
	const url = request.url;
	if (/^https:\/\/sim\.example\/.*\.(png|jpg|jpeg|webp)$/i.test(url)) {
		return new Response(TINY_PNG, { status: 200, headers: { "content-type": "image/png", "content-length": String(TINY_PNG.length) } });
	}
	if (/^https:\/\/sim\.example\/.*\.(pdf)$/i.test(url)) {
		const pdf = new TextEncoder().encode("%PDF-1.4\n%sim\n");
		return new Response(pdf, { status: 200, headers: { "content-type": "application/pdf", "content-length": String(pdf.length) } });
	}
	if (/^https:\/\/sim\.example\/.*\.(wav|mp3)$/i.test(url)) {
		const audio = new Uint8Array(64);
		return new Response(audio, { status: 200, headers: { "content-type": "audio/wav", "content-length": "64" } });
	}
	if (/oauth2\.googleapis\.com\/token|\/token$/.test(url)) {
		return new Response(JSON.stringify({ access_token: "sim-access-token", expires_in: 3600, token_type: "Bearer" }), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}
	if (isSimSupabase(url)) {
		return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
	}
	return null;
}

export async function withCapturedFetch<T>(
	responder: Responder,
	run: (calls: CapturedRequest[]) => Promise<T>,
): Promise<{ result: T | undefined; error: unknown; calls: CapturedRequest[] }> {
	const original = globalThis.fetch;
	const calls: CapturedRequest[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		const method = init?.method ?? (input instanceof Request ? input.method : "GET");
		const headers = headersToRecord(init?.headers ?? (input instanceof Request ? input.headers : undefined));
		const bodyText = await readBody(init?.body ?? (input instanceof Request ? input.body : undefined));
		let bodyJson: any = null;
		if (bodyText) {
			try {
				bodyJson = JSON.parse(bodyText);
			} catch {
				bodyJson = null;
			}
		}
		const call: CapturedRequest = { url, method, headers: Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])), bodyText, bodyJson };
		calls.push(call);
		return await responder(call, calls.length - 1);
	}) as typeof fetch;
	try {
		const result = await run(calls);
		return { result, error: undefined, calls };
	} catch (error) {
		return { result: undefined, error, calls };
	} finally {
		globalThis.fetch = original;
	}
}

/** Header names whose values must never reach a report. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		out[key] = /authorization|api-key|x-goog-api-key|x-api-key|token|secret|signature|cookie/i.test(key)
			? (value.startsWith("Bearer ") ? "Bearer <redacted>" : "<redacted>")
			: value;
	}
	return out;
}
