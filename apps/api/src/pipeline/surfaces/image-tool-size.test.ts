import { describe, expect, it } from "vitest";
import { gptImageSizeForAspectRatio, isGptImageModel } from "./image-tool-size";

describe("image tool sizes for GPT Image", () => {
	it.each([
		["1:1", "1024x1024"],
		["16:9", "1536x1024"],
		["4:3", "1536x1024"],
		["3:2", "1536x1024"],
		["9:16", "1024x1536"],
		["3:4", "1024x1536"],
		["auto", undefined],
		["wide", undefined],
	])("maps %s to %s", (ratio, size) => {
		expect(gptImageSizeForAspectRatio(ratio)).toBe(size);
	});

	it("recognises GPT Image models only", () => {
		expect(isGptImageModel("openai/gpt-image-2.6-flare")).toBe(true);
		expect(isGptImageModel("gpt-image-flare-latest")).toBe(true);
		expect(isGptImageModel("black-forest-labs/flux-2-pro")).toBe(false);
	});
});
