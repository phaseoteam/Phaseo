import { describe, expect, it } from "vitest";
import { buildAxiomEvent } from "./axiom";

describe("buildAxiomEvent", () => {
	it("maps sanitized gateway/provider envelopes from extra_json", () => {
		const event = buildAxiomEvent({
			requestId: "req_123",
			teamId: "team_123",
			provider: "openai",
			model: "openai/gpt-5-mini",
			endpoint: "chat.completions",
			stream: false,
			isByok: false,
			success: true,
			statusCode: 200,
			env: "test",
			extraJson: JSON.stringify({
				request: { method: "POST", path: "/v1/chat/completions" },
				timing: { execute_ms: 321 },
				transform: {
					request_surface_sanitized: { model: "openai/gpt-5-mini", messages: ["[redacted]"] },
					upstream_request_sanitized: { model: "gpt-5-mini", input: "[redacted]" },
					gateway_response_sanitized: { id: "g_123", status: "completed" },
					upstream_response_sanitized: { id: "resp_123", status: "ok" },
					upstream_response_headers: { "x-request-id": "req_upstream" },
					upstream_status_code: 200,
					upstream_status_text: "OK",
					upstream_url: "https://api.openai.com/v1/responses",
					requested_params: ["temperature", "top_p"],
					param_routing_diagnostics: { providerCountBefore: 6, providerCountAfter: 2 },
				},
			}),
		});

		expect(event.gateway_request_present).toBe(true);
		expect(event.provider_request_present).toBe(true);
		expect(event.gateway_response_present).toBe(true);
		expect(event.provider_response_present).toBe(true);
		expect(event.provider_status_code).toBe(200);
		expect(event.provider_status_text).toBe("OK");
		expect(event.provider_url).toBe("https://api.openai.com/v1/responses");
		expect(String(event.gateway_request_redacted_json)).toContain("openai/gpt-5-mini");
		expect(String(event.provider_response_headers_json)).toContain("x-request-id");
		expect(String(event.requested_params_json)).toContain("temperature");
	});
});
