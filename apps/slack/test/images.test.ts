import { AgentGatewayError } from "@phaseo/agent-sdk";
import { describe, expect, it, vi } from "vitest";
import { ImageNotReadError, type GeneratedImage, type ImageSize } from "../src/agent";
import { generateImageTool, IMAGE_COST_RESERVE_USD, MAX_IMAGES_PER_ANSWER } from "../src/images";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function setup(remaining = 0.5, options: { madeBefore?: number; generate?: () => Promise<GeneratedImage>; searched?: () => Promise<boolean> } = {}) {
	const generated: Array<{ prompt: string; size: ImageSize }> = [];
	const costs: number[] = [];
	const posts: Array<{ filename: string; title: string; altText: string }> = [];
	const made: Array<{ title: string; shown: boolean }> = [];
	const notes: string[] = [];
	const state = { remaining };
	const tool = generateImageTool({
		generate: async (prompt, size): Promise<GeneratedImage> => {
			generated.push({ prompt, size });
			return options.generate ? options.generate() : { bytes: PNG, mimeType: "image/png", costUsd: 0.04, model: "openai/gpt-image-2" };
		},
		remainingUsd: () => state.remaining,
		made: () => (options.madeBefore ?? 0) + made.length,
		onCost: (usd) => { costs.push(usd); },
		post: async ({ filename, title, altText }) => {
			posts.push({ filename, title, altText });
			return { ok: true, fileId: "F0IMAGE001" };
		},
		onMade: (image) => { made.push(image); },
		notes,
		...(options.searched ? { searched: options.searched } : {}),
	});
	return { execute: tool.execute as (input: unknown) => Promise<unknown>, generated, costs, posts, made, notes, state };
}

describe("the generate_image tool", () => {
	it("makes the image at the size asked for, counts its cost and posts it", async () => {
		const { execute, generated, costs, posts, made, notes } = setup();
		await expect(execute({ prompt: "  A fox in the snow  ", size: "portrait" })).resolves.toEqual({ posted: true, cost_usd: 0.04 });
		expect(generated).toEqual([{ prompt: "A fox in the snow", size: "1024x1536" }]);
		expect(costs).toEqual([0.04]);
		expect(posts).toEqual([{ filename: "image.png", title: "A fox in the snow", altText: "Generated image: A fox in the snow" }]);
		expect(made).toEqual([{ title: "A fox in the snow", shown: true }]);
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

	it("counts the images the answer made in its earlier runs (before a question, or a retried try)", async () => {
		const later = setup(0.5, { madeBefore: MAX_IMAGES_PER_ANSWER - 1 });
		await expect(later.execute({ prompt: "Fox" })).resolves.toMatchObject({ posted: true });
		await expect(later.execute({ prompt: "Another fox" })).resolves.toMatchObject({ posted: false });
		expect(later.generated).toHaveLength(1);
	});

	it("keeps the cost of an image the gateway billed but that couldn't be read, and counts it", async () => {
		const unread = setup(0.5, { generate: async () => { throw new ImageNotReadError(0.05); } });
		await expect(unread.execute({ prompt: "A fox" })).resolves.toEqual({ posted: false, error: "The image was made, but it couldn't be read back to post. Say so; they can ask again in a new message." });
		expect(unread.costs).toEqual([0.05]);
		expect(unread.made).toEqual([{ title: "A fox", shown: false }]);
		expect(unread.posts).toEqual([]);
	});

	it("says no image can be made after a Slack search when the image model has no provider that keeps no data", async () => {
		const noZdrRoute = { error: { code: "model_region_unavailable" }, code: "model_region_unavailable" };
		const refused = (searched: boolean) => setup(0.5, { searched: async () => searched, generate: async () => { throw new AgentGatewayError({ status: 403, statusText: "Forbidden", body: noZdrRoute }); } });
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		await expect(refused(true).execute({ prompt: "A fox" })).resolves.toEqual({ posted: false, error: "No image can be made after a Slack search: once an answer has searched Slack, it may only use AI providers that keep no data (zero data retention), and the image model has none. Say so." });
		await expect(refused(false).execute({ prompt: "A fox" })).resolves.toMatchObject({ posted: false, error: expect.stringContaining("couldn't be made just now") });
		vi.restoreAllMocks();
	});

	it("tells the model what to fix in its input", async () => {
		const { execute } = setup();
		await expect(execute({ prompt: "" })).rejects.toThrow("prompt is required");
		await expect(execute({ prompt: "x".repeat(4_001) })).rejects.toThrow("prompt must be at most 4000 characters");
		await expect(execute({ prompt: "A fox", size: "huge" })).rejects.toThrow("size must be one of square, landscape, portrait");
	});
});
