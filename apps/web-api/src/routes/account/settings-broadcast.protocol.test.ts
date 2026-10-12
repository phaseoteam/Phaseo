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
