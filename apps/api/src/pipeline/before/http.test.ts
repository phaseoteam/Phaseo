import { describe, expect, it } from "vitest";
import { err } from "./http";

describe("before/http err", () => {
	it("emits the shared structured contract for not_implemented_yet responses", async () => {
		const response = err("not_implemented_yet", {
			reason: "video_api_temporarily_disabled",
			message: "Video endpoints are temporarily disabled while the public contract is finalized.",
		});

		expect(response.status).toBe(501);
		const payload = await response.json();
		expect(payload).toEqual({
			error: "not_implemented_yet",
			reason: "video_api_temporarily_disabled",
			message: "Video endpoints are temporarily disabled while the public contract is finalized.",
			status_code: 501,
			error_type: "user",
			error_origin: "user",
		});
	});

	it("adds structured route-level upstream diagnostics for missing provider keys", async () => {
		const response = err("upstream_error", {
			reason: "google_vertex_key_missing",
			request_id: "G-BEFORE-1",
			provider: "google-vertex",
		});

		expect(response.status).toBe(502);
		const payload = await response.json();
		expect(payload).toMatchObject({
			error: "upstream_error",
			status_code: 502,
			error_type: "system",
			error_origin: "upstream",
			generation_id: "G-BEFORE-1",
			provider_failure_diagnostics: {
				category: "credentials_not_configured",
				hint: "Provider credentials are not configured for this route. Verify gateway keys or the selected BYOK configuration before retrying.",
				provider: "google-vertex",
			},
		});
	});

	it.each(["insufficient_funds", "key_limit_exceeded"] as const)(
		"classifies %s as a user/workspace error",
		async (code) => {
			const response = err(code, { reason: code });
			expect(response.status).toBe(code === "insufficient_funds" ? 402 : 429);
			const payload = await response.json();
			expect(payload).toMatchObject({
				error: code,
				error_type: "user",
				error_origin: "user",
			});
		},
	);

	it("adds structured route-level upstream diagnostics for provider timeouts", async () => {
		const response = err("upstream_error", {
			reason: "video_provider_timeout",
			request_id: "G-BEFORE-2",
			provider: "openai",
		});

		expect(response.status).toBe(502);
		const payload = await response.json();
		expect(payload).toMatchObject({
			error: "upstream_error",
			status_code: 502,
			error_type: "system",
			error_origin: "upstream",
			generation_id: "G-BEFORE-2",
			provider_failure_diagnostics: {
				category: "server_error",
				hint: "The provider timed out while handling this request. Retrying later may succeed.",
				provider: "openai",
			},
		});
	});

	it("preserves existing provider_failure_diagnostics when already provided", async () => {
		const response = err("upstream_error", {
			reason: "google_vertex_key_missing",
			provider_failure_diagnostics: {
				category: "provider_access_missing",
				hint: "custom hint",
				provider: "google-vertex",
			},
		});

		const payload = await response.json();
		expect(payload.provider_failure_diagnostics).toEqual({
			category: "provider_access_missing",
			hint: "custom hint",
			provider: "google-vertex",
		});
	});
});
