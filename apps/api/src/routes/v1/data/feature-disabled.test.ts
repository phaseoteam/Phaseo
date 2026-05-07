import { describe, expect, it } from "vitest";

import {
	createFeatureDisabledRoutes,
	disabledBatchRoutes,
	disabledFilesRoutes,
	disabledMusicRoutes,
	disabledVideosRoutes,
} from "./feature-disabled";

describe("feature-disabled routes", () => {
	it("returns 501 for the root disabled feature route", async () => {
		const routes = createFeatureDisabledRoutes("videos");
		const response = await routes.request("https://example.com/");

		expect(response.status).toBe(501);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(await response.json()).toEqual({
			error: "not_implemented",
			reason: "feature_temporarily_disabled",
			feature: "videos",
			message: "videos endpoints are temporarily disabled.",
		});
	});

	it("returns 501 for nested disabled video routes", async () => {
		const response = await disabledVideosRoutes.request("https://example.com/video_123/content", {
			method: "GET",
		});

		expect(response.status).toBe(501);
		expect(await response.json()).toMatchObject({
			error: "not_implemented",
			feature: "videos",
		});
	});

	it("returns 501 for disabled batch, file, and music routes", async () => {
		const batchResponse = await disabledBatchRoutes.request("https://example.com/batch_123/cancel", {
			method: "POST",
		});
		const filesResponse = await disabledFilesRoutes.request("https://example.com/file_123/content", {
			method: "GET",
		});
		const musicResponse = await disabledMusicRoutes.request("https://example.com/generate", {
			method: "POST",
		});

		expect(batchResponse.status).toBe(501);
		expect(await batchResponse.json()).toMatchObject({
			error: "not_implemented",
			feature: "batches",
		});

		expect(filesResponse.status).toBe(501);
		expect(await filesResponse.json()).toMatchObject({
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
