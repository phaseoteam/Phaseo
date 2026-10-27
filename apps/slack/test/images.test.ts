import { describe, expect, it } from "vitest";
import type { GeneratedImage, ImageSize } from "../src/agent";
import { generateImageTool, IMAGE_COST_RESERVE_USD, MAX_IMAGES_PER_ANSWER } from "../src/images";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function setup(remaining = 0.5) {
	const generated: Array<{ prompt: string; size: ImageSize }> = [];
	const costs: number[] = [];
	const posts: Array<{ filename: string; title: string; altText: string }> = [];
	const notes: string[] = [];
	const state = { remaining };
	const tool = generateImageTool({
		generate: async (prompt, size): Promise<GeneratedImage> => {
			generated.push({ prompt, size });
			return { bytes: PNG, mimeType: "image/png", costUsd: 0.04, model: "openai/gpt-image-2" };
		},
		remainingUsd: () => state.remaining,
		onCost: (usd) => { costs.push(usd); },
		post: async ({ filename, title, altText }) => {
			posts.push({ filename, title, altText });
			return { ok: true, fileId: "F0IMAGE001" };
		},
		notes,
	});
	return { execute: tool.execute as (input: unknown) => Promise<unknown>, generated, costs, posts, notes, state };
}

describe("the generate_image tool", () => {
	it("makes the image at the size asked for, counts its cost and posts it", async () => {
		const { execute, generated, costs, posts, notes } = setup();
		await expect(execute({ prompt: "  A fox in the snow  ", size: "portrait" })).resolves.toEqual({ posted: true, cost_usd: 0.04 });
		expect(generated).toEqual([{ prompt: "A fox in the snow", size: "1024x1536" }]);
		expect(costs).toEqual([0.04]);
		expect(posts).toEqual([{ filename: "image.png", title: "A fox in the snow", altText: "Generated image: A fox in the snow" }]);
		expect(notes).toEqual(['generate_image: posted an image of "A fox in the snow"']);
	});

	it("starts no image without enough of the answer's limit left, nor past the answer's image count", async () => {
		const low = setup(IMAGE_COST_RESERVE_USD - 0.01);
		await expect(low.execute({ prompt: "A fox" })).resolves.toEqual({ posted: false, error: "Not enough of this answer's $0.50 limit is left for an image. Say so: they can ask for it again in a new message." });
		expect(low.generated).toEqual([]);

		const many = setup();
		for (let index = 0; index < MAX_IMAGES_PER_ANSWER; index += 1) await many.execute({ prompt: `Fox ${index}` });
		await expect(many.execute({ prompt: "One more" })).resolves.toMatchObject({ posted: false });
		expect(many.generated).toHaveLength(MAX_IMAGES_PER_ANSWER);
	});

	it("tells the model what to fix in its input", async () => {
		const { execute } = setup();
		await expect(execute({ prompt: "" })).rejects.toThrow("prompt is required");
		await expect(execute({ prompt: "x".repeat(4_001) })).rejects.toThrow("prompt must be at most 4000 characters");
		await expect(execute({ prompt: "A fox", size: "huge" })).rejects.toThrow("size must be one of square, landscape, portrait");
	});
});
