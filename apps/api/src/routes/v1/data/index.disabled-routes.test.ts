import { describe, expect, it } from "vitest";

import { inferenceRouter } from "./index";

const testEnv = {
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
	KEY_PEPPER: "test-pepper",
	OPENAI_API_KEY: "test-openai-key",
	VIDEO_API_ENABLED: "true",
	GATEWAY_CACHE: {
		get: async () => null,
		put: async () => undefined,
		delete: async () => undefined,
	},
} as any;

function request(url: string, init?: RequestInit) {
	return inferenceRouter.fetch(
		new Request(url, init),
		testEnv,
		{
			waitUntil: () => undefined,
			passThroughOnException: () => undefined,
		} as any,
	);
}

describe("inferenceRouter disabled feature mounts", () => {
	it("mounts real videos, batches, and files routes instead of disabled placeholders", async () => {
		const response = await request("https://example.com/videos");
		const batchResponse = await request("https://example.com/batches/batch_123");
		const batchAliasResponse = await request("https://example.com/batch", {
			method: "POST",
		});
		const fileResponse = await request("https://example.com/files/file_123/content");

		expect(response.status).not.toBe(501);
		expect(batchResponse.status).not.toBe(501);
		expect(batchAliasResponse.status).not.toBe(501);
		expect(fileResponse.status).not.toBe(501);
	});

	it("keeps music routes behind disabled placeholders", async () => {
		const musicResponse = await request("https://example.com/music/generate", {
			method: "POST",
		});

		expect(musicResponse.status).toBe(501);
		expect(await musicResponse.json()).toMatchObject({
			error: "not_implemented",
			feature: "music",
		});
	});
});
