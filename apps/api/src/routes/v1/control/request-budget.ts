// Purpose: One weighted request budget per caller across the management (control) API.
// Why: Management routes had no rate limit, and they differ a lot in how hard they
//      work the database: a pricing read is cheap, an analytics query is not.
// How: Each request draws a cost (see controlRequestCost) from the Workers Rate
//      Limiting binding CONTROL_API_RATE_LIMITER, using its `delta` option. The
//      caller is identified by a SHA-256 of their bearer token (a management key,
//      OAuth token or dashboard session), or of their IP address when they send
//      none, so no database lookup is needed.
//      The binding counts per Cloudflare location and only approximately. That
//      suits an abuse guard; exact, per-workspace limits live in
//      core/customer-rate-limits.ts and only cover inference.
//      CONTROL_API_RATE_LIMIT_MODE picks the behaviour:
//        "off" (default)  nothing is counted;
//        "shadow"         requests are counted in the background and would-be
//                         denials are logged, but nothing is refused;
//        "enforce"        a request over budget gets a 429 rate_limit_exceeded.
//      A missing binding or a binding error always lets the request through.
import type { MiddlewareHandler } from "hono";
import type { Env } from "@/runtime/types";
import type { GatewayBindings } from "@/runtime/env.types";
import { err } from "@pipeline/before/http";
import { requestIdFor } from "@/runtime/request-id";
import { timingSafeEqual } from "@/routes/auth.helpers";

export type ControlRateLimitMode = "off" | "shadow" | "enforce";

/** The binding's window, in seconds (wrangler `ratelimits.simple.period`). */
export const CONTROL_API_RATE_LIMIT_PERIOD_SECONDS = 60;

/** Paths whose handlers call an outside service (observability destinations, classifiers, models). */
const EXTERNAL_TEST_PATHS = [
	/^\/observability\/destinations\/(?:[^/]+\/)?(?:test|sample)$/,
	/^\/classifiers\/test$/,
	/^\/preset-test-runs(?:\/|$)/,
];

/** Searches over request history and other large workspace tables. */
const HISTORY_PREFIXES = ["/logs", "/generations", "/audit-events", "/activity", "/feedback", "/events"];

/** Public catalogue reads, served from cached catalogue data. */
const CATALOGUE_PREFIXES = ["/models", "/pricing", "/providers", "/organisations"];

/** Reads about the caller themselves. */
const SELF_PREFIXES = ["/key", "/me", "/settings"];

function hasPrefix(path: string, prefixes: string[]): boolean {
	return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** The path below /v1, with any trailing slash removed. */
export function controlPath(pathname: string): string {
	const path = pathname.replace(/^\/v1(?=\/|$)/, "").replace(/\/+$/, "");
	return path || "/";
}

/**
 * How many units of the caller's budget a request uses. 0 means the request is
 * not counted at all.
 */
export function controlRequestCost(method: string, pathname: string): number {
	const verb = method.toUpperCase();
	const path = controlPath(pathname);
	if (verb === "OPTIONS" || path === "/health" || path.startsWith("/health/")) return 0;
	if (EXTERNAL_TEST_PATHS.some((pattern) => pattern.test(path))) return 10;
	if (hasPrefix(path, ["/analytics"])) return 10;
	// Catalogue reads stay cheap whatever the verb (POST /pricing/calculate is a calculation).
	if (hasPrefix(path, CATALOGUE_PREFIXES)) return 1;
	if (verb !== "GET" && verb !== "HEAD") return 3;
	if (hasPrefix(path, HISTORY_PREFIXES)) return 5;
	if (hasPrefix(path, SELF_PREFIXES)) return 1;
	return 2;
}

export function controlRateLimitMode(value: string | undefined): ControlRateLimitMode {
	const mode = String(value ?? "").trim().toLowerCase();
	return mode === "shadow" || mode === "enforce" ? mode : "off";
}

/** Internal callers (web-api, jobs, cache invalidation) prove themselves with the control secret. */
function isInternalCaller(req: Request, env: GatewayBindings): boolean {
	const configured = [env.PHASEO_CONTROL_SECRET, env.GATEWAY_INTERNAL_TEST_TOKEN]
		.map((value) => String(value ?? "").trim())
		.filter((value) => value.length > 0);
	if (!configured.length) return false;
	const provided = [req.headers.get("x-control-secret"), req.headers.get("x-phaseo-internal-token")]
		.map((value) => String(value ?? "").trim())
		.filter((value) => value.length > 0);
	return provided.some((got) => configured.some((expected) => timingSafeEqual(got, expected)));
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The budget key: one per credential, or one per IP address for callers without one. */
export async function controlBudgetKey(req: Request): Promise<string> {
	const authorization = req.headers.get("authorization")?.trim() ?? "";
	const token = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
	if (token) return `token:${await sha256Hex(token)}`;
	const address = req.headers.get("cf-connecting-ip")?.trim() || "unknown";
	return `ip:${await sha256Hex(address)}`;
}

/** First path segment, for logs. Never includes ids. */
function routeGroup(pathname: string): string {
	return controlPath(pathname).split("/")[1] || "/";
}

export function controlBudgetExceeded(req: Request): Response {
	const response = err("rate_limit_exceeded", {
		request_id: requestIdFor(req),
		error_origin: "user",
		reason: "management_api_rate_limit",
		description: `This credential has used its management API allowance for this minute. Heavier requests, such as analytics and log searches, use more of it. Retry after ${CONTROL_API_RATE_LIMIT_PERIOD_SECONDS} seconds.`,
	});
	response.headers.set("Retry-After", String(CONTROL_API_RATE_LIMIT_PERIOD_SECONDS));
	return response;
}

type CheckOutcome = "allowed" | "denied" | "unavailable";

async function checkBudget(limiter: RateLimit, key: string, cost: number): Promise<CheckOutcome> {
	try {
		return (await limiter.limit({ key, delta: cost })).success ? "allowed" : "denied";
	} catch (error) {
		console.error("Control API rate limiter unavailable", error);
		return "unavailable";
	}
}

function logDenial(mode: ControlRateLimitMode, req: Request, key: string, cost: number): void {
	console.warn(JSON.stringify({
		event: "control_api_rate_limit",
		outcome: mode === "enforce" ? "denied" : "would_deny",
		mode,
		method: req.method,
		route_group: routeGroup(new URL(req.url).pathname),
		cost,
		// A prefix is enough to group one caller's denials without logging the hash itself.
		caller: key.slice(0, key.indexOf(":") + 13),
	}));
}

export const controlRequestBudget: MiddlewareHandler<Env> = async (c, next) => {
	const env = c.env;
	const mode = controlRateLimitMode(env?.CONTROL_API_RATE_LIMIT_MODE);
	const limiter = env?.CONTROL_API_RATE_LIMITER;
	if (mode === "off" || !limiter) return next();
	const req = c.req.raw;
	const cost = controlRequestCost(req.method, new URL(req.url).pathname);
	if (cost <= 0 || isInternalCaller(req, env)) return next();

	if (mode === "shadow") {
		// Shadow mode adds no latency: the check runs after the response is sent.
		const check = (async () => {
			const key = await controlBudgetKey(req);
			if (await checkBudget(limiter, key, cost) === "denied") logDenial(mode, req, key, cost);
		})();
		let waitUntil: ((promise: Promise<unknown>) => void) | undefined;
		try { waitUntil = c.executionCtx.waitUntil.bind(c.executionCtx); } catch { /* No Worker context in unit tests. */ }
		if (waitUntil) waitUntil(check);
		else await check;
		return next();
	}

	const key = await controlBudgetKey(req);
	if (await checkBudget(limiter, key, cost) === "denied") {
		logDenial(mode, req, key, cost);
		return controlBudgetExceeded(req);
	}
	return next();
};
