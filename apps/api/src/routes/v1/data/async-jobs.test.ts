import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseAsyncWebsocketOptions } from "./async-jobs";

const state = vi.hoisted(() => ({
	authResult: {
		ok: true as const,
		workspaceId: "ws_async_test",
		apiKeyId: "key_async_test",
		apiKeyRef: "kid_async_test",
		apiKeyKid: "async_test_kid",
		userId: null,
		internal: false,
	},
	record: {
		workspaceId: "ws_async_test",
		kind: "video",
		internalId: "job_123",
		status: "queued",
		updatedAt: "2026-05-05T00:00:00.000Z",
		meta: {},
	} as Record<string, unknown> | null,
}));

vi.mock("@pipeline/before/auth", () => ({
	authenticate: vi.fn(async () => state.authResult),
}));

vi.mock("@core/async-operations", () => ({
	getAsyncOperation: vi.fn(async () => state.record),
}));

vi.mock("@core/async-notifications", async () => {
	const actual = await vi.importActual<typeof import("@core/async-notifications")>("@core/async-notifications");
	return {
		...actual,
		buildAsyncNotificationData: vi.fn(async () => ({
			id: "job_123",
			kind: "video",
			status: "queued",
		})),
	};
});

vi.mock("../../utils", () => ({
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) =>
		new Response(JSON.stringify(body), {
			status,
			headers: {
				"Content-Type": "application/json",
				...headers,
			},
		}),
}));

describe("parseAsyncWebsocketOptions", () => {
	it("uses safe defaults", () => {
		expect(
			parseAsyncWebsocketOptions(new URL("https://api.phaseo.app/v1/async/video/job_123/ws")),
		).toEqual({
			intervalMs: 2500,
			closeOnTerminal: true,
		});
	});

	it("clamps the polling interval and honors close_on_terminal", () => {
		expect(
			parseAsyncWebsocketOptions(
				new URL(
					"https://api.phaseo.app/v1/async/batch/job_123/ws?interval_ms=100&close_on_terminal=false",
				),
			),
		).toEqual({
			intervalMs: 1000,
			closeOnTerminal: false,
		});

		expect(
			parseAsyncWebsocketOptions(
				new URL("https://api.phaseo.app/v1/async/batch/job_123/ws?interval_ms=60000"),
			),
		).toEqual({
			intervalMs: 10000,
			closeOnTerminal: true,
		});
	});
});

describe("asyncJobsRoutes", () => {
	beforeEach(() => {
		state.authResult = {
			ok: true,
			workspaceId: "ws_async_test",
			apiKeyId: "key_async_test",
			apiKeyRef: "kid_async_test",
			apiKeyKid: "async_test_kid",
			userId: null,
			internal: false,
		};
		state.record = {
			workspaceId: "ws_async_test",
			kind: "video",
			internalId: "job_123",
			status: "queued",
			updatedAt: "2026-05-05T00:00:00.000Z",
			meta: {},
		};
		vi.resetModules();
	});

	it("returns 426 for non-websocket HTTP requests", async () => {
		const { asyncJobsRoutes } = await import("./async-jobs");

		const response = await asyncJobsRoutes.request("https://example.com/video/job_123/ws", {
			method: "GET",
		});

		expect(response.status).toBe(426);
		expect(response.headers.get("upgrade")).toBe("websocket");
		expect(await response.json()).toMatchObject({
			error: {
				code: "websocket_upgrade_required",
			},
		});
	});

	it("returns 400 when the async kind in the path is invalid", async () => {
		const { asyncJobsRoutes } = await import("./async-jobs");

		const response = await asyncJobsRoutes.request("https://example.com/unknown/job_123/ws", {
			method: "GET",
			headers: {
				Upgrade: "websocket",
			},
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "validation_error",
			reason: "invalid_async_job_path",
		});
	});

	it("returns 404 when the async job is not owned or does not exist", async () => {
		state.record = null;
		const { asyncJobsRoutes } = await import("./async-jobs");

		const response = await asyncJobsRoutes.request("https://example.com/video/job_123/ws", {
			method: "GET",
			headers: {
				Upgrade: "websocket",
			},
		});

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({
			error: "not_found",
			reason: "async_job_not_found_or_not_owned",
		});
	});
});
