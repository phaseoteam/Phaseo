// src/routes/v1/data/realtime.ts
// Purpose: Realtime route scaffolding.
// Why: Reserves stable endpoint paths before full transport/session implementation lands.
// How: Exposes placeholder handlers with explicit not-implemented payloads.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";

function notImplemented(feature: string): Response {
	return new Response(
		JSON.stringify({
			error: {
				type: "not_implemented",
				message: `${feature} is not implemented yet`,
			},
		}),
		{
			status: 501,
			headers: { "Content-Type": "application/json" },
		},
	);
}

export const realtimeRoutes = new Hono<Env>();

realtimeRoutes.post("/", () => notImplemented("realtime"));
realtimeRoutes.post("/sessions", () => notImplemented("realtime.sessions"));
realtimeRoutes.post("/client_secrets", () => notImplemented("realtime.client_secrets"));
realtimeRoutes.post("/calls", () => notImplemented("realtime.calls"));
realtimeRoutes.get("/calls/:callId", () => notImplemented("realtime.calls.retrieve"));
