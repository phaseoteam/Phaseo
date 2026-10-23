import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth/requireUser", () => ({ requireUser: async () => ({ id: "user_1" }) }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => ({}) }));
vi.mock("./context", () => ({
	requireAccountWorkspace: async () => ({ workspaceId: "workspace_1", role: "admin", client: {} }),
}));

afterEach(() => {
	vi.unstubAllGlobals();
});

async function testConfig(destinationId: string, config: Record<string, string>) {
	const { accountSettingsBroadcastRouter } = await import("./settings-broadcast");
	return accountSettingsBroadcastRouter.request("https://example.com/broadcast/test-config", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ workspaceId: "workspace_1", destinationId, config }),
	}, {});
}

describe("broadcast row destinations", () => {
	it("writes a sample object when testing a bucket", async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const response = await testConfig("gcs", { bucket: "traces", access_key_id: "GOOG1", secret_access_key: "secret" });
		expect(await response.json()).toMatchObject({ ok: true, status: "Connection verified", httpStatus: 200, endpoint: "https://storage.googleapis.com/traces/" });
		const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
		expect(url.toString()).toMatch(/^https:\/\/storage\.googleapis\.com\/traces\/phaseo\/.+\.jsonl\.gz$/);
		expect(init.method).toBe("PUT");
		expect(init.redirect).toBe("manual");
		const text = await new Response(new Blob([init.body as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
		expect(JSON.parse(text.trim())).toMatchObject({ name: "Test Generation", attributes: { "gen_ai.request.model": "openai/gpt-4-turbo" } });
	});

	it("reports the store's error code", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("<Error><Code>NoSuchBucket</Code></Error>", { status: 404 })));
		const response = await testConfig("s3", { bucket: "missing", access_key_id: "AKIA", secret_access_key: "secret" });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Destination returned 404: NoSuchBucket" });
	});

	it("rejects a config before sending anything", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		for (const [config, error] of [
			[{ bucket: "traces", access_key_id: "AKIA" }, "secret_access_key is required"],
			[{ bucket: "traces", access_key_id: "AKIA", secret_access_key: "s", endpoint: "https://127.0.0.1:9000" }, "Private or loopback endpoint addresses are not allowed."],
			[{ bucket: "traces", access_key_id: "AKIA", secret_access_key: "s", path_template: "{date}" }, "path_template must include {uuid} so objects never overwrite each other"],
		] as const) {
			const response = await testConfig("s3", config);
			expect(await response.json()).toEqual({ error });
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
