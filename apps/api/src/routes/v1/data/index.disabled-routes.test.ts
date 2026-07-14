import { describe, expect, it } from "vitest";

import { inferenceRouter } from "./index";

const testEnv = {
	SUPABASE_URL: "https://supabase.test",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	GATEWAY_CACHE: {} as KVNamespace,
};

const testExecutionContext = {
	waitUntil: () => undefined,
	passThroughOnException: () => undefined,
} as unknown as ExecutionContext;

function request(url: string, init?: RequestInit): Promise<Response> {
	return inferenceRouter.fetch(new Request(url, init), testEnv, testExecutionContext);
}

describe("inferenceRouter disabled feature mounts", () => {
	it("returns 501 for top-level videos routes", async () => {
		const response = await request("https://example.com/videos");

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			error: "not_implemented",
			feature: "videos",
		});
	});

	it("mounts public batch and file routes while music remains disabled", async () => {
		const capabilitiesResponse = await request("https://example.com/batches/capabilities");
		const batchResponse = await request("https://example.com/batches/batch_123");
		const batchAliasResponse = await request("https://example.com/batch", {
			method: "POST",
		});
		const batchFileResponse = await request("https://example.com/batches/files/file_123/content");
		const fileResponse = await request("https://example.com/files/file_123/content");
		const musicResponse = await request("https://example.com/music/generate", {
			method: "POST",
		});

		expect(capabilitiesResponse.status).not.toBe(501);
		expect(batchResponse.status).not.toBe(501);
		expect(batchAliasResponse.status).not.toBe(501);
		expect(batchFileResponse.status).not.toBe(501);
		expect(fileResponse.status).not.toBe(501);

		expect(await batchResponse.json()).not.toMatchObject({ feature: "batches" });
		expect(await batchAliasResponse.json()).not.toMatchObject({ feature: "batches" });
		expect(await batchFileResponse.json()).not.toMatchObject({ feature: "files" });
		expect(await fileResponse.json()).not.toMatchObject({ feature: "files" });

		expect(musicResponse.status).toBe(501);
		expect(await musicResponse.json()).toMatchObject({
			error: "not_implemented",
			feature: "music",
		});
	});
});
