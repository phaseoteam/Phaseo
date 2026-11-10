import { afterEach, describe, expect, it, vi } from "vitest";
import { getDataClient } from "@/data/supabase";
import { fetchRequestProviderAttempts, normalizeGatewayUpstreamRows, runWithUsageContext } from "./actions";
import { V2_ATTEMPT_DETAIL_CUTOVER } from "./requestAttempts";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
} as any;
afterEach(() => vi.unstubAllGlobals());

describe("normalizeGatewayUpstreamRows", () => {
	it("maps child request rows into the existing provider timeline contract", () => {
		expect(normalizeGatewayUpstreamRows([{
			sequence: 2,
			round_number: 1,
			attempt_number: 2,
			internal_attempt_number: null,
			provider: "openai",
			api_model_id: "openai:gpt-5.4-mini",
			provider_model_slug: "gpt-5.4-mini",
			outcome: "success",
			status_code: 200,
			status_text: "OK",
			duration_ms: 42,
			metadata: { started_at_unix_ms: 1000 },
			latency_ms: 180,
			generation_ms: 150,
			total_ms: 210,
			cost_nanos: "125000",
			currency: "USD",
			finish_reason: "stop",
			provider_finish_reason: "stop",
			retryable: false,
			fallback_attempted: true,
			error_code: null,
			error_type: null,
			error_message: null,
			error_description: null,
		}])).toEqual([{
			sequence: 2,
			round_number: 1,
			attempt_number: 2,
			internal_attempt_number: null,
			provider: "openai",
			api_model_id: "openai:gpt-5.4-mini",
			provider_model_slug: "gpt-5.4-mini",
			outcome: "success",
			status: 200,
			status_text: "OK",
			duration_ms: 42,
			started_at_unix_ms: 1000,
			latency_ms: 180,
			generation_ms: 150,
			total_ms: 210,
			cost_nanos: 125000,
			currency: "USD",
			finish_reason: "stop",
			provider_finish_reason: "stop",
			retryable: false,
			fallback_attempted: true,
			upstream_error_code: null,
			upstream_error_type: null,
			upstream_error_message: null,
			upstream_error_description: null,
		}]);
	});
});

describe("fetchRequestProviderAttempts", () => {
	const legacyRow = {
		sequence: 1, attempt_number: 1, provider: "openai", api_model_id: "openai/gpt-6-luna", provider_model_slug: "gpt-6-luna",
		outcome: "upstream_non_2xx", status_code: 400, status_text: "Bad Request", duration_ms: 383,
		error_code: "invalid_value", error_type: "invalid_request_error", error_message: "Failed to download file.", error_description: "url", metadata: {},
	};
	const fact = {
		latency_ms: 665, generation_ms: 833, gateway_total_ms: 895, cost_nanos: 3800, currency: "USD", stop_reason: "stop",
		v2_request_attempts: [
			{ attempt_number: 2, provider_model_id: "openai:openai/gpt-6-luna", started_at: "2026-11-09T15:00:01.500Z", status_code: 200, status_text: "OK", success: true, latency_ms: 268, safe_metadata: { provider: "openai", provider_api_model_id: "gpt-6-luna", retryable: false, fallback_attempted: true } },
			{ attempt_number: 1, provider_model_id: null, started_at: "2026-11-09T15:00:00.100Z", status_code: 400, status_text: "Bad Request", success: false, error_code: "upstream_non_2xx", failure_class: "upstream_non_2xx", latency_ms: 383, safe_metadata: { provider: "openai", provider_api_model_id: "gpt-6-luna" }, upstream_error_code: "invalid_value", upstream_error_type: "invalid_request_error", upstream_error_message: "Failed to download file.", upstream_error_description: "url" },
		],
	};

	async function attemptsFor(createdAt: string, respond: (url: URL) => Response) {
		const paths: string[] = [];
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			paths.push(url.pathname);
			return respond(url);
		}));
		const account = { client: getDataClient(env), workspaceId: "ws-1", role: "admin", user: { id: "user-1" } } as any;
		const attempts = await runWithUsageContext({ account, env }, () => fetchRequestProviderAttempts("ws-1", "req-1", createdAt));
		return { attempts, paths };
	}

	it("reads gateway_upstream_requests for requests before the cut-over", async () => {
		const { attempts, paths } = await attemptsFor("2026-11-09T13:59:59.999Z", (url) => {
			expect(url.searchParams.get("workspace_id")).toBe("eq.ws-1");
			expect(url.searchParams.get("request_id")).toBe("eq.req-1");
			return Response.json([legacyRow]);
		});
		expect(paths).toEqual(["/rest/v1/gateway_upstream_requests"]);
		expect(attempts).toMatchObject([{ status: 400, status_text: "Bad Request", upstream_error_code: "invalid_value", upstream_error_type: "invalid_request_error", upstream_error_message: "Failed to download file." }]);
	});

	it("returns no attempts when the legacy table no longer exists", async () => {
		const { attempts } = await attemptsFor("2026-11-01T00:00:00Z", () => Response.json(
			{ code: "PGRST205", message: "Could not find the table 'public.gateway_upstream_requests' in the schema cache" },
			{ status: 404 },
		));
		expect(attempts).toEqual([]);
	});

	it("maps v2 attempts for requests at or after the cut-over", async () => {
		const { attempts, paths } = await attemptsFor(V2_ATTEMPT_DETAIL_CUTOVER, (url) => {
			expect(url.searchParams.get("workspace_id")).toBe("eq.ws-1");
			expect(url.searchParams.get("request_id")).toBe("eq.req-1");
			expect(url.searchParams.get("select")).toContain("v2_request_attempts(");
			expect(url.searchParams.get("select")).toContain("upstream_error_type");
			return Response.json([fact]);
		});
		expect(paths).toEqual(["/rest/v1/v2_request_facts"]);
		expect(attempts).toEqual([
			{
				sequence: 1, round_number: 1, attempt_number: 1, internal_attempt_number: null,
				provider: "openai", api_model_id: null, provider_model_slug: "gpt-6-luna",
				outcome: "upstream_non_2xx", status: 400, status_text: "Bad Request", duration_ms: 383,
				started_at_unix_ms: Date.parse("2026-11-09T15:00:00.100Z"),
				latency_ms: null, generation_ms: null, total_ms: 383, cost_nanos: 0, currency: "USD",
				finish_reason: null, provider_finish_reason: null, retryable: null, fallback_attempted: false,
				upstream_error_code: "invalid_value", upstream_error_type: "invalid_request_error", upstream_error_message: "Failed to download file.", upstream_error_description: "url",
			},
			{
				sequence: 2, round_number: 1, attempt_number: 2, internal_attempt_number: null,
				provider: "openai", api_model_id: "openai/gpt-6-luna", provider_model_slug: "gpt-6-luna",
				outcome: "success", status: 200, status_text: "OK", duration_ms: 268,
				started_at_unix_ms: Date.parse("2026-11-09T15:00:01.500Z"),
				latency_ms: 665, generation_ms: 833, total_ms: 895, cost_nanos: 3800, currency: "USD",
				finish_reason: "stop", provider_finish_reason: null, retryable: false, fallback_attempted: true,
				upstream_error_code: null, upstream_error_type: null, upstream_error_message: null, upstream_error_description: null,
			},
		]);
	});

	it("returns no attempts when the request has no v2 facts row", async () => {
		const { attempts } = await attemptsFor("2026-11-09T15:00:00Z", () => Response.json([]));
		expect(attempts).toEqual([]);
	});
});
