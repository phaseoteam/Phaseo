// Purpose: The only network the end-to-end harness has: a fetch guard that answers provider and side calls.
// Why: The real gateway runs end to end, so every fetch it makes (providers, Supabase, OAuth) must be captured offline.
// How: globalThis.fetch is replaced once for the whole run; each case installs a script of upstream behaviours.

import { defaultSideResponse, type CapturedRequest } from "../src/fetch-capture";
import { detectDialect, synthesiseResponse, wantsStreamingResponse, type ResponseVariant } from "../src/dialects";
import { BASIC } from "../src/response-variants";
import { harnessState } from "./state";
import { nonTextResponse } from "./nontext-writers";

/** What one upstream call returns. A provider's list is consumed in order; the last entry repeats. */
export type UpstreamBehaviour =
	| { kind: "ok"; variant?: ResponseVariant }
	| { kind: "status"; status: number; retryAfter?: string; headers?: Record<string, string>; errorKind?: ErrorKind }
	| { kind: "throw"; message?: string }
	| { kind: "hang" }
	| { kind: "midstream" }
	| { kind: "nontext"; variant?: string };

type ErrorKind = "bad_request" | "rate_limit" | "overloaded" | "server" | "context_length" | "auth" | "mid_stream";

export type UpstreamScript = Record<string, UpstreamBehaviour[]>;

const HOST_PROVIDER: Array<[RegExp, string]> = [
	[/(^|\.)api\.groq\.com$/, "groq"],
	[/(^|\.)api\.deepinfra\.com$/, "deepinfra"],
	[/(^|\.)api\.together\.(ai|xyz)$/, "together"],
	[/(^|\.)api\.openai\.com$/, "openai"],
	[/(^|\.)api\.anthropic\.com$/, "anthropic"],
	[/aiplatform\.googleapis\.com$/, "google-vertex"],
	[/(^|\.)generativelanguage\.googleapis\.com$/, "google-ai-studio"],
	[/(^|\.)api\.cohere\.(com|ai)$/, "cohere"],
	[/(^|\.)api\.mistral\.ai$/, "mistral"],
	[/(^|\.)api\.elevenlabs\.io$/, "elevenlabs"],
];

export function providerForUrl(url: string): string | null {
	let host = "";
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		return null;
	}
	return HOST_PROVIDER.find(([pattern]) => pattern.test(host))?.[1] ?? null;
}

const ERROR_KIND_BY_STATUS: Record<number, ErrorKind> = {
	400: "bad_request", 401: "auth", 403: "auth", 404: "bad_request", 408: "server", 413: "context_length",
	422: "bad_request", 429: "rate_limit", 500: "server", 502: "server", 503: "overloaded", 504: "server", 529: "overloaded",
};

let script: UpstreamScript = {};
let callsByProvider = new Map<string, number>();

export function installScript(next: UpstreamScript) {
	script = next;
	callsByProvider = new Map();
}

async function readBody(body: unknown): Promise<string | null> {
	if (body === undefined || body === null) return null;
	if (typeof body === "string") return body;
	if (body instanceof Uint8Array) return new TextDecoder().decode(body);
	if (body instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(body));
	if (typeof Blob !== "undefined" && body instanceof Blob) return `<blob ${body.size} bytes ${body.type}>`;
	if (body instanceof FormData) {
		const parts: string[] = [];
		for (const [key, value] of body.entries()) {
			parts.push(`${key}=${typeof value === "string" ? value : `<file ${(value as File).name ?? "blob"} ${(value as File).size} bytes>`}`);
		}
		return parts.join("&");
	}
	if (body instanceof URLSearchParams) return body.toString();
	if (body instanceof ReadableStream) return await new Response(body).text();
	return String(body);
}

function headersRecord(input: RequestInfo | URL, init?: RequestInit): Record<string, string> {
	const raw = init?.headers ?? (input instanceof Request ? input.headers : undefined);
	const out: Record<string, string> = {};
	if (!raw) return out;
	const entries = raw instanceof Headers ? [...raw.entries()] : Array.isArray(raw) ? raw : Object.entries(raw);
	for (const [key, value] of entries) if (value !== undefined) out[String(key).toLowerCase()] = String(value);
	return out;
}

function supabaseResponse(call: CapturedRequest): Response {
	const url = new URL(call.url);
	const runtime = harnessState.current;
	if (url.pathname.includes("/rpc/increment_workspace_byok_monthly_request_count")) {
		const count = runtime?.byokMonthlyCount ?? 1;
		return Response.json([{ request_count: count, month_start: "2026-10-01T00:00:00.000Z" }]);
	}
	const wallet = /\/rpc\/gateway_wallet_(reserve|capture|release)_once$/.exec(url.pathname);
	if (wallet) {
		// Wallet holds for async jobs: always granted, and recorded so the report shows what was held.
		const amount = Number(call.bodyJson?.p_amount_nanos ?? 0);
		const status = wallet[1] === "reserve" ? "held" : wallet[1] === "capture" ? "captured" : "released";
		harnessState.captures.reservations.push({ action: wallet[1], reservationId: String(call.bodyJson?.p_reservation_id ?? ""), amountNanos: amount });
		return Response.json([{ ok: true, applied: true, status, amount_nanos: amount }]);
	}
	if (url.pathname.includes("/rpc/")) return Response.json(null);
	return Response.json([]);
}

function withHeaders(response: Response, extra: Record<string, string>): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of Object.entries(extra)) headers.set(key, value);
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function hang(signal: AbortSignal | null | undefined): Promise<Response> {
	return new Promise((_resolve, reject) => {
		if (!signal) {
			// Nothing can cancel it; fail after a bound so a broken deadline cannot stall the run.
			setTimeout(() => reject(new Error("e2e harness: hung upstream call was never aborted")), 5_000);
			return;
		}
		if (signal.aborted) return reject(signal.reason);
		signal.addEventListener("abort", () => reject(signal.reason), { once: true });
	});
}

function providerResponse(call: CapturedRequest, provider: string, behaviour: UpstreamBehaviour, signal: AbortSignal | null | undefined): Response | Promise<Response> {
	const dialect = detectDialect(call.url);
	const stream = wantsStreamingResponse(dialect, call.url, call.bodyJson);
	switch (behaviour.kind) {
		case "ok":
			return synthesiseResponse(dialect, behaviour.variant ?? BASIC, stream);
		case "midstream":
			return synthesiseResponse(dialect, { id: "mid-stream", finish: "stop", usage: "basic", error: { status: 200, kind: "mid_stream" } }, stream);
		case "status": {
			const kind = behaviour.errorKind ?? ERROR_KIND_BY_STATUS[behaviour.status] ?? "server";
			let response = synthesiseResponse(dialect, { id: `error:${behaviour.status}`, finish: "stop", usage: "basic", error: { status: behaviour.status, kind } }, stream);
			// The shared writer adds retry-after: 7 and x-ratelimit-* to every rate limit; other statuses get none.
			const extra: Record<string, string> = { ...(behaviour.headers ?? {}) };
			if (behaviour.retryAfter !== undefined) extra["retry-after"] = behaviour.retryAfter;
			if (Object.keys(extra).length) response = withHeaders(response, extra);
			return response;
		}
		case "throw":
			throw new TypeError(behaviour.message ?? "fetch failed: ECONNRESET (simulated)");
		case "hang":
			return hang(signal);
		case "nontext":
			return nonTextResponse(call, provider, behaviour.variant);
	}
}

/** The fetch installed for the whole run. Unknown hosts are refused, never forwarded. */
export const guardedFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
	const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
	const headers = headersRecord(input, init);
	const bodyText = await readBody(init?.body ?? (input instanceof Request ? input.body : undefined));
	let bodyJson: any = null;
	if (bodyText) {
		try {
			bodyJson = JSON.parse(bodyText);
		} catch {
			bodyJson = null;
		}
	}
	const call: CapturedRequest = { url, method, headers, bodyText, bodyJson };
	const record = { ...call, classification: "side" as "provider" | "side" | "blocked", provider: null as string | null, outcome: "" };
	harnessState.captures.calls.push(record);

	if (url.startsWith("https://supabase.sim.invalid")) {
		record.outcome = "supabase";
		return supabaseResponse(call);
	}
	const side = defaultSideResponse(call);
	if (side) {
		record.outcome = "side";
		return side;
	}
	const provider = providerForUrl(url);
	if (!provider || !harnessState.current) {
		record.classification = "blocked";
		record.outcome = "blocked: unknown host";
		throw new TypeError(`e2e network guard: refused ${method} ${url.replace(/[?].*/, "")}`);
	}
	record.classification = "provider";
	record.provider = provider;
	const list = script[provider];
	const index = callsByProvider.get(provider) ?? 0;
	callsByProvider.set(provider, index + 1);
	const behaviour: UpstreamBehaviour = list?.length ? list[Math.min(index, list.length - 1)] : { kind: "ok" };
	record.outcome = behaviour.kind === "status" ? `status:${behaviour.status}` : behaviour.kind;
	return await providerResponse(call, provider, behaviour, init?.signal ?? (input instanceof Request ? input.signal : null));
}) as typeof fetch;
