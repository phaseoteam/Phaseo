import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils", () => ({
	withRuntime:
		(handler: (req: Request) => Promise<Response>) =>
		async (c: { req: { raw: Request } }) =>
			handler(c.req.raw),
	json: (data: unknown, status = 200) =>
		new Response(JSON.stringify(data), {
			status,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
		}),
}));

vi.mock("@pipeline/before/guards", () => ({
	guardAuth: vi.fn(async () => ({
		ok: true as const,
		value: {
			requestId: "req_responses_ws_test",
			workspaceId: "ws_responses_ws_test",
			apiKeyId: "key_responses_ws_test",
			internal: false,
		},
	})),
	guardContext: vi.fn(),
}));

import { responsesWsRoutes } from "./responses-ws";
import { guardAuth } from "@pipeline/before/guards";

describe("responses websocket route handshake guards", () => {
	beforeEach(() => {
		delete (globalThis as Record<string, unknown>).__AI_STATS_ENABLE_RESPONSES_WS__;
		vi.clearAllMocks();
	});

	it("returns the temporary disabled websocket response before upgrade/auth", async () => {
		const response = await responsesWsRoutes.request("https://example.com/", {
			method: "GET",
			headers: {
				upgrade: "websocket",
			},
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toEqual({
			error: {
				type: "invalid_request_error",
				code: "responses_websocket_disabled",
				message: "WebSocket mode is temporarily disabled on /v1/responses/ws.",
			},
		});
		expect(guardAuth).not.toHaveBeenCalled();
	});

	it("requires websocket upgrade when the endpoint is enabled", async () => {
		(globalThis as Record<string, unknown>).__AI_STATS_ENABLE_RESPONSES_WS__ = true;

		const response = await responsesWsRoutes.request("https://example.com/", {
			method: "GET",
		});

		expect(response.status).toBe(426);
		expect(await response.json()).toEqual({
			error: {
				type: "invalid_request_error",
				code: "websocket_upgrade_required",
				message: "Use WebSocket upgrade for /v1/responses/ws.",
			},
		});
		expect(guardAuth).not.toHaveBeenCalled();
	});
});
