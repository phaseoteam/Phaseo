import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		OPENAI_API_KEY: "test-openai-key",
		OPENAI_BASE_URL: "https://provider.example",
	}),
}));

import { proxyOpenAIVideoRequest } from "./openai-google";

describe("proxyOpenAIVideoRequest", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("passes through successful binary content responses", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response(Uint8Array.from([1, 2, 3]), {
					status: 200,
					headers: {
						"Content-Type": "video/mp4",
						"x-upstream": "ok",
					},
				}),
			),
		);

		const response = await proxyOpenAIVideoRequest(
			new Request("https://gateway.local/v1/videos/vid_test/content"),
			{ requestId: "req_video_success", workspaceId: "ws_video_success" },
			"openai",
			"/videos/vid_test/content",
			"GET",
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("video/mp4");
		expect(response.headers.get("x-upstream")).toBe("ok");
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3]));
	});

	it("normalizes JSON upstream permission failures into the public error contract", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response(
					JSON.stringify({
						error: {
							code: "PERMISSION_DENIED",
							message: "The caller does not have permission.",
							param: "model",
						},
					}),
					{
						status: 403,
						headers: { "Content-Type": "application/json" },
					},
				),
			),
		);

		const response = await proxyOpenAIVideoRequest(
			new Request("https://gateway.local/v1/videos/vid_test"),
			{ requestId: "req_video_forbidden", workspaceId: "ws_video_forbidden" },
			"openai",
			"/videos/vid_test",
			"GET",
		);

		expect(response.status).toBe(502);
		const payload = await response.json();
		expect(payload).toMatchObject({
			error: "upstream_error",
			reason: "video_provider_upstream_error",
			request_id: "req_video_forbidden",
			workspace_id: "ws_video_forbidden",
			generation_id: "req_video_forbidden",
			status_code: 502,
			error_type: "system",
			error_origin: "upstream",
			provider: "openai",
			upstream_status: 403,
			upstream_error: {
				code: "PERMISSION_DENIED",
				message: "The caller does not have permission.",
				description: "The caller does not have permission.",
				param: "model",
			},
			provider_failure_diagnostics: {
				category: "provider_access_missing",
				provider: "openai",
			},
		});
	});

	it("normalizes non-JSON upstream failures instead of proxying raw text", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response("provider exploded", {
					status: 500,
					statusText: "Internal Server Error",
					headers: { "Content-Type": "text/plain" },
				}),
			),
		);

		const response = await proxyOpenAIVideoRequest(
			new Request("https://gateway.local/v1/videos/vid_test"),
			{ requestId: "req_video_500", workspaceId: "ws_video_500" },
			"openai",
			"/videos/vid_test",
			"GET",
		);

		expect(response.status).toBe(502);
		const payload = await response.json();
		expect(payload).toMatchObject({
			error: "upstream_error",
			reason: "video_provider_upstream_error",
			request_id: "req_video_500",
			workspace_id: "ws_video_500",
			provider: "openai",
			upstream_status: 500,
			upstream_status_text: "Internal Server Error",
			upstream_body_preview: "provider exploded",
			upstream_error: {
				code: null,
				message: "provider exploded",
				description: "provider exploded",
				param: null,
			},
			provider_failure_diagnostics: {
				category: "server_error",
				provider: "openai",
			},
		});
	});
});
