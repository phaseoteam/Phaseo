// src/app.ts
// Purpose: Worker entrypoint that boots Hono and registers routes.
// Why: Single place to configure the gateway app.
// How: Exposes focused helpers for this module.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";

import { v1Router } from "@/routes/v1";
import { lazyRouter } from "@/routes/lazy";
import type { GatewayBindings } from "@/runtime/env";
import { sendAxiomWideEvent } from "@/observability/axiom";
import { requestIdFor } from "@/runtime/request-id";
import { enforceRegionalSurface } from "@/regional-surface";
export { RealtimeRelayDurableObject } from "@core/realtime-relay-durable-object";
export { ProviderRateLimitDurableObject } from "@core/provider-rate-limit-durable-object";
export { RoutingHealthDurableObject } from "@core/routing-health-durable-object";

const app = new Hono<Env>();

app.use("*", async (c, next) => {
	const requestId = requestIdFor(c.req.raw);
	c.set("requestId", requestId);
	await next();
	if (c.res.status === 101) return;
	const headers = new Headers(c.res.headers);
	headers.set("x-request-id", requestId);
	c.res = new Response(c.res.body, {
		status: c.res.status,
		statusText: c.res.statusText,
		headers,
	});
});
app.use("*", enforceRegionalSurface);

const root = lazyRouter("/", () => import("@/routes/root").then(module => module.rootRouter));
app.all("/", root);
app.all("/.well-known/*", root);
const auth = lazyRouter("/auth", () => import("@/routes/auth").then(module => module.authRouter));
app.all("/auth", auth);
app.all("/auth/*", auth);
const oauth = lazyRouter("/oauth", () => import("@/routes/oauth").then(module => module.oauthRouter));
app.all("/oauth", oauth);
app.all("/oauth/*", oauth);
app.route("/v1", v1Router);
const internal = lazyRouter("/internal", () => import("@/routes/internal").then(module => module.internalRouter));
app.all("/internal", internal);
app.all("/internal/*", internal);

app.onError((error, c) => {
	const requestId = c.get("requestId") ?? requestIdFor(c.req.raw);
	const url = new URL(c.req.url);
	const event = sendAxiomWideEvent({
		event_type: "api.unhandled_error",
		event_emitted_at: new Date().toISOString(),
		success: false,
		error_type: "system",
		error_origin: "api",
		error_operational_kind: "api_unhandled_error",
		error_action_owner: "gateway",
		error_operationally_actionable: true,
		error_requires_investigation: true,
		error_name: error.name,
		error_message: error.message.slice(0, 1000),
		error_stack: error.stack?.slice(0, 8000) ?? null,
		request_id: requestId,
		request_method: c.req.method,
		request_path: url.pathname,
		request_route: c.req.routePath,
		environment: c.env.ENV ?? null,
		cf_ray: c.req.header("cf-ray") ?? null,
		cf_colo: c.req.raw.cf?.colo ?? null,
		cf_country: c.req.raw.cf?.country ?? null,
	}, c.env);
	c.executionCtx?.waitUntil?.(event);

	console.error("api_unhandled_error", {
		requestId,
		method: c.req.method,
		path: url.pathname,
		error,
	});

	return c.json(
		{ error: "internal_error", message: "An unexpected error occurred.", request_id: requestId },
		500,
		{ "x-request-id": requestId },
	);
});

export default {
	fetch: app.fetch,
	async scheduled(event: ScheduledController, env: GatewayBindings) {
		const { handleScheduledEvent } = await import("@/scheduled");
		await handleScheduledEvent(event, env);
	},
};
