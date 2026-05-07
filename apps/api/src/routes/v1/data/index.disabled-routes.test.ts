import { describe, expect, it } from "vitest";

import { inferenceRouter } from "./index";

describe("inferenceRouter disabled feature mounts", () => {
	it("returns 501 for top-level videos routes", async () => {
		const response = await inferenceRouter.request("https://example.com/videos");

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			error: "not_implemented",
			feature: "videos",
		});
	});

	it("returns 501 for batch aliases, file routes, and music routes", async () => {
		const batchResponse = await inferenceRouter.request("https://example.com/batches/batch_123");
		const batchAliasResponse = await inferenceRouter.request("https://example.com/batch", {
			method: "POST",
		});
		const fileResponse = await inferenceRouter.request("https://example.com/files/file_123/content");
		const musicResponse = await inferenceRouter.request("https://example.com/music/generate", {
			method: "POST",
		});

		expect(batchResponse.status).toBe(501);
		expect(await batchResponse.json()).toMatchObject({
			error: "not_implemented",
			feature: "batches",
		});

		expect(batchAliasResponse.status).toBe(501);
		expect(await batchAliasResponse.json()).toMatchObject({
			error: "not_implemented",
			feature: "batches",
		});

		expect(fileResponse.status).toBe(501);
		expect(await fileResponse.json()).toMatchObject({
			error: "not_implemented",
			feature: "files",
		});

		expect(musicResponse.status).toBe(501);
		expect(await musicResponse.json()).toMatchObject({
			error: "not_implemented",
			feature: "music",
		});
	});
});
