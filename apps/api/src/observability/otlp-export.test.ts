import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverGatewayOtlpPayload, deliverGatewayWebhookPayload, drainGatewayOtlpOutbox, filterMetadata, selected } from "./otlp-export";
import { encodeOtlpTraceRequest } from "./otlp-protobuf";

vi.mock("@core/webhook-endpoints", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@core/webhook-endpoints")>();
	return {
		...actual,
		validateWebhookEndpointUrlForDelivery: vi.fn(async (value: unknown) => {
			const validated = actual.validateWebhookEndpointUrl(value);
			if (!validated.ok) return validated;
			const hostname = new URL(validated.url).hostname;
			if (hostname === "private-dns.example.com") {
				return { ok: false as const, reason: "webhook_url_private_network_not_allowed" as const };
			}
			return validated;
		}),
	};
});

const supabase = vi.hoisted(() => ({
	claimed: [] as Array<{ id: string; destination_id: string; payload: unknown; attempts: number }>,
	updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
}));

vi.mock("@/runtime/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/runtime/env")>();
	return {
		...actual,
		getSupabaseAdmin: () => ({
			rpc: async () => ({ data: supabase.claimed, error: null }),
			from: (table: string) => table === "workspace_broadcast_destinations"
				? {
					select: () => ({
						eq: () => ({
							maybeSingle: async () => ({
								data: {
									id: "destination-1",
									destination_id: "otel_collector",
									destination_config: { endpoint: "https://collector.example.com" },
									enabled: true,
								},
								error: null,
							}),
						}),
					}),
				}
				: {
					update: (patch: Record<string, unknown>) => ({
						eq: async (_column: string, id: string) => {
							supabase.updates.push({ id, patch });
							return { error: null };
						},
					}),
				},
		}),
	};
});

describe("deliverGatewayWebhookPayload", () => {
	it("delivers OTLP JSON with configured headers and method", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
		const payload = { resourceSpans: [] };
		const result = await deliverGatewayWebhookPayload(payload, {
			url: "https://hooks.example.com/traces",
			method: "PUT",
			headers_json: JSON.stringify({ Authorization: "Bearer secret" }),
		});
		expect(result).toMatchObject({ delivered: true, retryable: false, status: 204 });
		const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(url.toString()).toBe("https://hooks.example.com/traces");
		expect(init).toMatchObject({ method: "PUT", body: JSON.stringify(payload), redirect: "manual" });
		expect(new Headers(init.headers).get("authorization")).toBe("Bearer secret");
	});

	it("retries transient webhook failures", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", {
			status: 429,
			headers: { "retry-after": "3" },
		})));
		const result = await deliverGatewayWebhookPayload(
			{ resourceSpans: [] },
			{ url: "https://hooks.example.com/traces" },
			2,
		);
		expect(result).toMatchObject({ delivered: false, retryable: true, status: 429, delayMs: 3_000 });
	});

	it("rejects private webhook destinations before delivery", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await deliverGatewayWebhookPayload(
			{ resourceSpans: [] },
			{ url: "http://127.0.0.1/traces" },
		);
		expect(result).toMatchObject({ delivered: false, retryable: false, status: null });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("Broadcast destination selection and metadata", () => {
	const telemetry = {
		requestId: "req_1", workspaceId: "ws_1", keyId: "key_selected", endpoint: "chat.completions",
		requestedModel: "openai/gpt-5", statusCode: 200, success: true, startedAtMs: 1, completedAtMs: 2,
	} as any;
	const destination = { id: "dest_1", destination_id: "webhook", destination_config: null } as any;

	it("supports include and exclude API-key targeting", () => {
		expect(selected({ ...destination, broadcast_destination_keys: [{ key_id: "key_selected", filter_mode: "include" }] }, telemetry, "event_1")).toBe(true);
		expect(selected({ ...destination, broadcast_destination_keys: [{ key_id: "key_selected", filter_mode: "exclude" }] }, telemetry, "event_1")).toBe(false);
		expect(selected({ ...destination, broadcast_destination_keys: [
			{ key_id: "key_selected", filter_mode: "include" },
			{ key_id: "key_other", filter_mode: "exclude" },
		] }, telemetry, "event_1")).toBe(true);
	});

	it("removes disabled metadata families from OTLP attributes", () => {
		const payload = { resourceSpans: [{ attributes: [
			{ key: "gen_ai.request.model", value: { stringValue: "gpt-5" } },
			{ key: "phaseo.cost.nanos", value: { intValue: "10" } },
			{ key: "phaseo.api_key.id", value: { stringValue: "key_1" } },
			{ key: "http.route", value: { stringValue: "/v1/chat/completions" } },
			{ key: "service.name", value: { stringValue: "phaseo-gateway" } },
		] }] };
		const filtered = filterMetadata(payload, {
			...destination,
			include_generation_metadata: false,
			include_cost_metadata: false,
			include_identity_metadata: false,
			include_request_context: false,
		}) as any;
		expect(filtered.resourceSpans[0].attributes.map((attribute: any) => attribute.key)).toEqual(["service.name"]);
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("deliverGatewayOtlpPayload", () => {
	it("exports OTLP JSON to the standard traces path", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ partialSuccess: {} }), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		const payload = { resourceSpans: [] };
		const result = await deliverGatewayOtlpPayload(payload, {
			endpoint: "https://collector.example.com",
			headers_json: JSON.stringify({ "x-tenant": "phaseo" }),
		});
		expect(result).toMatchObject({ delivered: true, retryable: false, status: 200 });
		const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(url.toString()).toBe("https://collector.example.com/v1/traces");
		expect(init).toMatchObject({ method: "POST", body: JSON.stringify(payload), redirect: "manual" });
		const sentHeaders = new Headers(init.headers);
		expect(sentHeaders.get("content-type")).toBe("application/json");
		expect(sentHeaders.get("x-tenant")).toBe("phaseo");
	});

	it("honours Retry-After for retryable collector responses", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
			new Response("", { status: 503, headers: { "retry-after": "7" } }),
		));
		const result = await deliverGatewayOtlpPayload(
			{ resourceSpans: [] },
			{ endpoint: "https://collector.example.com/v1/traces" },
			2,
		);
		expect(result).toMatchObject({ delivered: false, retryable: true, status: 503, delayMs: 7_000 });
	});

	it("does not retry OTLP partial-success acknowledgements", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
			new Response(JSON.stringify({
				partialSuccess: { rejectedSpans: "2", errorMessage: "invalid attributes" },
			}), { status: 200 }),
		));
		const result = await deliverGatewayOtlpPayload(
			{ resourceSpans: [] },
			{ endpoint: "https://collector.example.com" },
		);
		expect(result).toMatchObject({
			delivered: false,
			retryable: false,
			error: "OTLP partial success rejected 2 spans: invalid attributes",
		});
	});

	it("does not retry invalid or private collector configuration", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await deliverGatewayOtlpPayload(
			{ resourceSpans: [] },
			{ endpoint: "http://127.0.0.1:4318" },
		);
		expect(result).toMatchObject({ delivered: false, retryable: false, status: null });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it.each([
		"http://[::1]:4318",
		"http://[fd00::1]:4318",
		"http://[fe80::1]:4318",
		"https://[::ffff:127.0.0.1]:4318",
	])("rejects bracketed private IPv6 collector endpoint %s", async (endpoint) => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await deliverGatewayOtlpPayload({ resourceSpans: [] }, { endpoint });

		expect(result).toMatchObject({ delivered: false, retryable: false, status: null });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("continues to support public HTTP collectors", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ partialSuccess: {} }), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		const result = await deliverGatewayOtlpPayload(
			{ resourceSpans: [] },
			{ endpoint: "http://collector.example.com" },
		);

		expect(result).toMatchObject({ delivered: true, status: 200 });
		expect((fetchMock.mock.calls[0] as [URL])[0].toString()).toBe("http://collector.example.com/v1/traces");
	});

	it("rejects collector hostnames that resolve to private addresses", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await deliverGatewayOtlpPayload(
			{ resourceSpans: [] },
			{ endpoint: "https://private-dns.example.com" },
		);

		expect(result).toMatchObject({
			delivered: false,
			retryable: false,
			status: null,
			error: "Invalid OTLP endpoint: webhook_url_private_network_not_allowed",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("drainGatewayOtlpOutbox", () => {
	it("drops payloads from rows that will not be sent again", async () => {
		const payload = { resourceSpans: [{ prompt: "secret prompt" }] };
		supabase.claimed = [
			{ id: "delivered", destination_id: "destination-1", payload, attempts: 1 },
			{ id: "retry", destination_id: "destination-1", payload, attempts: 1 },
			{ id: "rejected", destination_id: "destination-1", payload, attempts: 1 },
		];
		supabase.updates = [];
		vi.stubGlobal("fetch", vi.fn()
			.mockResolvedValueOnce(new Response(null, { status: 200 }))
			.mockResolvedValueOnce(new Response(null, { status: 503 }))
			.mockResolvedValueOnce(new Response(null, { status: 400 })));

		const summary = await drainGatewayOtlpOutbox();

		expect(summary).toEqual({ claimed: 3, delivered: 1, retried: 1, failed: 1 });
		const patches = Object.fromEntries(supabase.updates.map(({ id, patch }) => [id, patch]));
		expect(patches.delivered).toMatchObject({ status: "delivered", payload: {} });
		expect(patches.rejected).toMatchObject({ status: "failed", payload: {} });
		expect(patches.retry).toMatchObject({ status: "pending" });
		expect(patches.retry).not.toHaveProperty("payload");
	});
});

describe("deliverGatewayOtlpPayload over protobuf", () => {
	const payload = { resourceSpans: [{ scopeSpans: [{ spans: [{ traceId: "0af7651916cd43dd8448eb211c80319c", spanId: "b7ad6b7169203331", name: "chat" }] }] }] };

	it("sends protobuf when the destination asks for it, whatever the configured headers say", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array(), { status: 200, headers: { "content-type": "application/x-protobuf" } }));
		vi.stubGlobal("fetch", fetchMock);
		const result = await deliverGatewayOtlpPayload(payload, {
			endpoint: "https://collector.example.com",
			otlp_protocol: "http/protobuf",
			headers_json: JSON.stringify({ "Content-Type": "application/json", "x-tenant": "phaseo" }),
		});
		expect(result).toMatchObject({ delivered: true, status: 200 });
		const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(url.toString()).toBe("https://collector.example.com/v1/traces");
		const sent = new Headers(init.headers);
		expect(sent.get("content-type")).toBe("application/x-protobuf");
		expect(sent.get("accept")).toBe("application/x-protobuf");
		expect(sent.get("x-tenant")).toBe("phaseo");
		expect(init.body).toEqual(encodeOtlpTraceRequest(payload));
	});

	it("reports spans a protobuf collector rejected", async () => {
		// partial_success { rejected_spans: 1, error_message: "bad" }, under a media type in another case.
		const body = Uint8Array.from([0x0a, 0x07, 0x08, 0x01, 0x12, 0x03, 0x62, 0x61, 0x64]);
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { "content-type": "Application/X-Protobuf; charset=binary" } })));
		const result = await deliverGatewayOtlpPayload(payload, { endpoint: "https://collector.example.com", otlp_protocol: "http/protobuf" });
		expect(result).toMatchObject({ delivered: false, retryable: false, error: "OTLP partial success rejected 1 spans: bad" });
	});

	it("rejects an unknown protocol without sending", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const result = await deliverGatewayOtlpPayload(payload, { endpoint: "https://collector.example.com", otlp_protocol: "grpc" });
		expect(result).toMatchObject({ delivered: false, retryable: false, error: "OTLP protocol must be http/json or http/protobuf" });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
