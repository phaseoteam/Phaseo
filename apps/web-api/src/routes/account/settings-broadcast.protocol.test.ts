import { afterEach, describe, expect, it, vi } from "vitest";

const row = {
	id: "destination_1",
	workspace_id: "workspace_1",
	destination_id: "otel_collector",
	name: "Collector",
	privacy_exclude_prompts_and_outputs: true,
};

vi.mock("@/auth/requireUser", () => ({ requireUser: async () => ({ id: "user_1" }) }));
vi.mock("@/data/supabase", () => ({
	getDataClient: () => ({
		from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
	}),
}));
vi.mock("./context", () => ({
	requireAccountWorkspace: async () => ({ workspaceId: "workspace_1", role: "admin", client: {} }),
}));
vi.mock("./broadcast-config-crypto", () => ({
	encryptBroadcastConfig: async () => ({ ciphertext: "encrypted", iv: "iv", keyVersion: "v1" }),
	decryptBroadcastConfig: async () => ({ endpoint: "https://collector.example.com", otlp_protocol: "http/protobuf" }),
}));

async function expectedSignature(secret: string, timestamp: string, body: string) {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
	return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("broadcast OTLP protocol", () => {
	it("sends the sample trace as protobuf when the destination uses it", async () => {
		// An empty ExportTraceServiceResponse: full success.
		const fetchMock = vi.fn(async () => new Response(new Uint8Array(), { status: 200, headers: { "content-type": "application/x-protobuf" } }));
		vi.stubGlobal("fetch", fetchMock);
		const { accountSettingsBroadcastRouter } = await import("./settings-broadcast");
		const response = await accountSettingsBroadcastRouter.request("https://example.com/broadcast/destination_1/sample", { method: "POST" }, {});
		expect(await response.json()).toMatchObject({ ok: true, status: "Sample trace sent" });
		const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
		expect(url.toString()).toBe("https://collector.example.com/v1/traces");
		expect(new Headers(init.headers).get("content-type")).toBe("application/x-protobuf");
		expect(init.body).toBeInstanceOf(Uint8Array);
		// Starts with field 1 (resource_spans) as a length-delimited message.
		expect((init.body as Uint8Array)[0]).toBe(0x0a);
	});

	it("sends a sample trace when testing an OTLP configuration", async () => {
		const fetchMock = vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
		vi.stubGlobal("fetch", fetchMock);
		const { accountSettingsBroadcastRouter } = await import("./settings-broadcast");
		const response = await accountSettingsBroadcastRouter.request("https://example.com/broadcast/test-config", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace_1", destinationId: "otel_collector", config: { endpoint: "https://collector.example.com", auth_header: "Bearer x", otlp_compression: "gzip" } }),
		}, {});
		expect(await response.json()).toMatchObject({ ok: true, status: "Connection verified", httpStatus: 200, headerCount: 1 });
		const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
		expect(url.toString()).toBe("https://collector.example.com/v1/traces");
		const sent = new Headers(init.headers);
		expect(sent.get("authorization")).toBe("Bearer x");
		expect(sent.get("content-encoding")).toBe("gzip");
		const body = JSON.parse(await new Response(new Blob([init.body as Uint8Array]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
		expect(body.resourceSpans[0].scopeSpans[0].spans[0].name).toBe("Test Generation");
	});

	it("reports a collector's error when testing a configuration", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
		const { accountSettingsBroadcastRouter } = await import("./settings-broadcast");
		const response = await accountSettingsBroadcastRouter.request("https://example.com/broadcast/test-config", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace_1", destinationId: "otel_collector", config: { endpoint: "https://collector.example.com" } }),
		}, {});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "OTLP collector returned 401: unauthorized" });
	});

	it("signs the webhook test request when a signing secret is set", async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
		const { accountSettingsBroadcastRouter } = await import("./settings-broadcast");
		const response = await accountSettingsBroadcastRouter.request("https://example.com/broadcast/test-config", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace_1", destinationId: "webhook", config: { url: "https://hooks.example.com/traces", signing_secret: "whsec_test_0123456789" } }),
		}, {});
		expect(await response.json()).toMatchObject({ ok: true, status: "Connection verified" });
		const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
		const sent = new Headers(init.headers);
		expect(sent.get("x-test-connection")).toBe("true");
		expect(sent.get("x-phaseo-signature")).toBe(await expectedSignature("whsec_test_0123456789", sent.get("x-phaseo-timestamp")!, init.body as string));
	});

	it("rejects a short webhook signing secret", async () => {
		const { accountSettingsBroadcastRouter } = await import("./settings-broadcast");
		const response = await accountSettingsBroadcastRouter.request("https://example.com/broadcast/test-config", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace_1", destinationId: "webhook", config: { url: "https://hooks.example.com/traces", signing_secret: "short" } }),
		}, {});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Signing secret must be 16 to 256 characters" });
	});

	it("rejects a rule regex the gateway matcher can't run", async () => {
		const { accountSettingsBroadcastRouter } = await import("./settings-broadcast");
		const response = await accountSettingsBroadcastRouter.request("https://example.com/broadcast", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				workspaceId: "workspace_1",
				destinationId: "webhook",
				name: "Hooks",
				config: { url: "https://hooks.example.com/traces" },
				ruleGroups: [{ match: "and", rules: [{ field: "model", condition: "matches_regex", value: "gpt(?!-4)" }] }],
			}),
		}, {});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Invalid regex: Lookahead and lookbehind are not supported" });
	});

	it("rejects an unsupported protocol when testing a configuration", async () => {
		const { accountSettingsBroadcastRouter } = await import("./settings-broadcast");
		const response = await accountSettingsBroadcastRouter.request("https://example.com/broadcast/test-config", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ workspaceId: "workspace_1", destinationId: "otel_collector", config: { endpoint: "https://collector.example.com", otlp_protocol: "grpc" } }),
		}, {});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Protocol must be http/json or http/protobuf" });
	});
});
