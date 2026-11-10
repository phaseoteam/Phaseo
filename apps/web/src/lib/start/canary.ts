// Gradual move from the previous site (still served from Vercel behind
// Cloudflare) to this Worker. When the Worker route covers phaseo.app, each
// request is either handled here or passed through to the previous site with
// `fetch(request)`, which a Worker on that route sends to the origin.
//
// Rollout settings (Worker vars):
// - CANARY_HOSTS: comma-separated hosts the canary applies to. Any other host
//   (workers.dev, previews) is always served here.
// - CANARY_PERCENT: 0–100, the share of visitors served here. Unset = 100.
//
// Visitors keep their side through a bucket cookie (0–99), so raising or
// lowering the percentage only moves the buckets in between, and nobody flips
// apps mid-session. `/_canary/on`, `/_canary/off` and `/_canary/clear` set a
// personal override for testing; `/_canary/status` reports the decision.

export const CANARY_BUCKET_COOKIE = "phaseo_web_bucket";
export const CANARY_OVERRIDE_COOKIE = "phaseo_web_canary";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Paths only the previous site serves.
const PREVIOUS_ONLY = /^\/_next\//;
// Paths only this site serves (its own assets and internals).
const THIS_ONLY = /^\/(?:assets\/|_serverFn\/|api\/i18n-full\/|_messages\/|_content\/)/;

export type CanaryEnv = { CANARY_HOSTS?: string; CANARY_PERCENT?: string };

export type CanaryDecision =
	| { target: "this"; reason: string; setCookies: string[] }
	| { target: "previous"; reason: string; setCookies: string[] }
	| { target: "control"; response: Response };

function readCookie(request: Request, name: string): string | undefined {
	for (const part of (request.headers.get("cookie") ?? "").split(/;\s*/)) {
		const eq = part.indexOf("=");
		if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
	}
	return undefined;
}

function cookie(name: string, value: string, maxAge = COOKIE_MAX_AGE): string {
	return `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure; HttpOnly`;
}

export function canaryPercent(env: CanaryEnv): number {
	const raw = env.CANARY_PERCENT?.trim();
	if (!raw) return 100;
	const value = Number(raw);
	return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function canaryHosts(env: CanaryEnv): string[] {
	return (env.CANARY_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
}

function parseBucket(value: string | undefined): number | undefined {
	if (value === undefined || !/^\d{1,2}$/.test(value)) return undefined;
	return Number(value);
}

export function decideCanary(request: Request, env: CanaryEnv, random: () => number = Math.random): CanaryDecision {
	const url = new URL(request.url);
	if (!canaryHosts(env).includes(url.hostname.toLowerCase())) return { target: "this", reason: "host", setCookies: [] };

	const percent = canaryPercent(env);
	const override = readCookie(request, CANARY_OVERRIDE_COOKIE);
	const bucket = parseBucket(readCookie(request, CANARY_BUCKET_COOKIE));

	if (url.pathname.startsWith("/_canary/")) {
		const action = url.pathname.slice("/_canary/".length);
		const headers = new Headers({ "cache-control": "no-store" });
		if (action === "on" || action === "off") headers.append("set-cookie", cookie(CANARY_OVERRIDE_COOKIE, action));
		else if (action === "clear") headers.append("set-cookie", cookie(CANARY_OVERRIDE_COOKIE, "", 0));
		else if (action !== "status") return { target: "control", response: new Response("Not found", { status: 404, headers }) };
		const effectiveOverride = action === "on" || action === "off" ? action : action === "clear" ? undefined : override;
		const served = effectiveOverride === "on" ? "this" : effectiveOverride === "off" ? "previous" : bucket !== undefined && bucket < percent ? "this" : percent >= 100 ? "this" : "previous";
		headers.set("content-type", "application/json");
		return { target: "control", response: new Response(JSON.stringify({ percent, bucket: bucket ?? null, override: effectiveOverride ?? null, served }), { headers }) };
	}

	if (PREVIOUS_ONLY.test(url.pathname)) return { target: "previous", reason: "previous-only path", setCookies: [] };
	if (THIS_ONLY.test(url.pathname)) return { target: "this", reason: "this-only path", setCookies: [] };
	if (override === "on") return { target: "this", reason: "override", setCookies: [] };
	if (override === "off") return { target: "previous", reason: "override", setCookies: [] };
	if (percent >= 100) return { target: "this", reason: "percent", setCookies: [] };
	if (percent <= 0) return { target: "previous", reason: "percent", setCookies: [] };
	if (bucket !== undefined) return { target: bucket < percent ? "this" : "previous", reason: "bucket", setCookies: [] };

	// No bucket yet. Webhooks, API calls and non-GET requests (no browser
	// session to keep consistent) stay on the previous site until 100%.
	if (url.pathname.startsWith("/api/") || (request.method !== "GET" && request.method !== "HEAD")) {
		return { target: "previous", reason: "unbucketed api", setCookies: [] };
	}
	const assigned = Math.floor(random() * 100);
	return { target: assigned < percent ? "this" : "previous", reason: "new bucket", setCookies: [cookie(CANARY_BUCKET_COOKIE, String(assigned))] };
}

/** Add Set-Cookie and a header saying which site answered. */
export function markResponse(response: Response, served: "this" | "previous", setCookies: string[]): Response {
	const marked = new Response(response.body, response);
	marked.headers.set("x-phaseo-web", served === "this" ? "tanstack" : "previous");
	for (const value of setCookies) marked.headers.append("set-cookie", value);
	return marked;
}
