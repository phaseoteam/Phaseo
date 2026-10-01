import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { exec as generateImage } from "../endpoints/images";
import { exec as editImage } from "../endpoints/images-edits";

const meta = {
	requestId: "req_openai_image_quality",
	apiKeyId: "key_test",
	apiKeyRef: "kid_test",
	apiKeyKid: "kid_test",
};

const baseArgs = {
	meta,
	workspaceId: "team_test",
	providerId: "openai",
	byokMeta: [],
	pricingCard: null,
};

function completedResponse(): Response {
	return new Response(JSON.stringify({
		created: 1,
		data: [{ b64_json: "encoded-image" }],
		usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
	}), { status: 200, headers: { "Content-Type": "application/json" } });
}

function streamingResponse(): Response {
	return new Response('data: {"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n', {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

beforeAll(setupTestRuntime);
afterAll(teardownTestRuntime);

describe("OpenAI GPT Image 2.5 quality forwarding", () => {
	it("forwards xhigh for non-streaming generation", async () => {
		let upstreamBody: Record<string, unknown> | undefined;
		const result = await generateImage({
			...baseArgs,
			endpoint: "images.generations",
			model: "openai/gpt-image-2.5-flare",
			providerModelSlug: "gpt-image-2.5-flare",
			body: { model: "openai/gpt-image-2.5-flare", prompt: "A red kite", quality: "xhigh" },
			stream: false,
			upstreamTiming: { fetch: async (_input, init) => {
				upstreamBody = JSON.parse(String(init?.body));
				return completedResponse();
			} },
		} as any);

		expect(upstreamBody).toMatchObject({ model: "gpt-image-2.5-flare", quality: "xhigh" });
		expect(result.kind).toBe("completed");
	});

	it("forwards max for streaming generation", async () => {
		let upstreamBody: Record<string, unknown> | undefined;
		const result = await generateImage({
			...baseArgs,
			endpoint: "images.generations",
			model: "openai/gpt-image-2.5-sunburst",
			providerModelSlug: "gpt-image-2.5-sunburst",
			body: { model: "openai/gpt-image-2.5-sunburst", prompt: "A blue kite", quality: "max", stream: true },
			stream: true,
			upstreamTiming: { fetch: async (_input, init) => {
				upstreamBody = JSON.parse(String(init?.body));
				return streamingResponse();
			} },
		} as any);

		expect(upstreamBody).toMatchObject({ model: "gpt-image-2.5-sunburst", quality: "max", stream: true });
		expect(result.kind).toBe("stream");
	});

	it("forwards xhigh for non-streaming edits", async () => {
		let upstreamBody: FormData | undefined;
		const result = await editImage({
			...baseArgs,
			endpoint: "images.edits",
			model: "openai/gpt-image-2.5-flare",
			providerModelSlug: "gpt-image-2.5-flare",
			body: { model: "openai/gpt-image-2.5-flare", prompt: "Add clouds", image: new Blob(["image"]), quality: "xhigh" },
			stream: false,
			upstreamTiming: { fetch: async (_input, init) => {
				upstreamBody = init?.body as FormData;
				return completedResponse();
			} },
		} as any);

		expect(upstreamBody?.get("model")).toBe("gpt-image-2.5-flare");
		expect(upstreamBody?.get("quality")).toBe("xhigh");
		expect(result.kind).toBe("completed");
	});

	it("forwards max for streaming edits", async () => {
		let upstreamBody: FormData | undefined;
		const result = await editImage({
			...baseArgs,
			endpoint: "images.edits",
			model: "openai/gpt-image-2.5-sunburst",
			providerModelSlug: "gpt-image-2.5-sunburst",
			body: { model: "openai/gpt-image-2.5-sunburst", prompt: "Add rain", image: new Blob(["image"]), quality: "max", stream: true },
			stream: true,
			upstreamTiming: { fetch: async (_input, init) => {
				upstreamBody = init?.body as FormData;
				return streamingResponse();
			} },
		} as any);

		expect(upstreamBody?.get("model")).toBe("gpt-image-2.5-sunburst");
		expect(upstreamBody?.get("quality")).toBe("max");
		expect(upstreamBody?.get("stream")).toBe("true");
		expect(result.kind).toBe("stream");
	});
});
