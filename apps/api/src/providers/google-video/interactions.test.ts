import { describe, expect, it } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { PriceCard } from "@pipeline/pricing/types";
import { computeVideoPricedUsage } from "@core/video-pricing";
import { InvalidGoogleVideoRequestError } from "./request";
import {
	buildGoogleOmniInteractionRequest,
	estimateGoogleOmniUsageMeters,
	googleInteractionUsageMeters,
	isGoogleOmniVideoModel,
	normalizeGoogleInteractionVideoPayload,
	normalizeGoogleOmniRequest,
} from "./interactions";

const ir = (fields: Partial<IRVideoGenerationRequest>): IRVideoGenerationRequest =>
	({ model: "gemini-omni-1.1-flash", prompt: "A red paper boat", ...fields }) as IRVideoGenerationRequest;

// Usage from a live 10-second 360p text-to-video run on 2026-11-04.
const LIVE_USAGE = {
	total_tokens: 19785,
	total_input_tokens: 13,
	input_tokens_by_modality: [{ modality: "text", tokens: 13 }],
	total_cached_tokens: 0,
	total_output_tokens: 19310,
	output_tokens_by_modality: [{ modality: "video", tokens: 19310 }],
	total_tool_use_tokens: 0,
	total_thought_tokens: 462,
	initial_input_tokens: 23,
};

describe("Gemini Omni request", () => {
	it("recognises Omni model ids only", () => {
		expect(isGoogleOmniVideoModel("gemini-omni-1.1-flash")).toBe(true);
		expect(isGoogleOmniVideoModel("models/gemini-omni-flash-preview")).toBe(true);
		expect(isGoogleOmniVideoModel("veo-3.1-generate-preview")).toBe(false);
		expect(isGoogleOmniVideoModel("gemini-3.8-flash")).toBe(false);
	});

	it("defaults to 8 seconds of 720p 16:9", () => {
		const request = normalizeGoogleOmniRequest(ir({}));
		expect(request).toMatchObject({ seconds: 8, resolution: "720p", aspectRatio: "16:9", outputCount: 1, inputImageCount: 0 });
	});

	it.each([
		[{ seconds: 2 }, "3 to 10"],
		[{ seconds: 11 }, "3 to 10"],
		[{ seconds: 4.5 }, "whole number"],
		[{ size: "480p" }, "360p, 720p, 1080p, or 4k"],
		[{ aspectRatio: "1:1" }, "16:9 or 9:16"],
		[{ negativePrompt: "blur" }, "negative prompts"],
		[{ generateAudio: false }, "always generates audio"],
		[{ sampleCount: 2 }, "exactly one video"],
		[{ inputReferences: [{ type: "audio", url: "https://example.com/a.mp3" }] }, "image and video inputs only"],
		[{ lastFrame: "https://example.com/end.png" }, "requires a first-frame image"],
	] as const)("rejects %j", (fields, message) => {
		expect(() => normalizeGoogleOmniRequest(ir(fields as any))).toThrow(InvalidGoogleVideoRequestError);
		expect(() => normalizeGoogleOmniRequest(ir(fields as any))).toThrow(message);
	});

	it("orders first frame, last frame, references, then source video", () => {
		const request = normalizeGoogleOmniRequest(ir({
			inputReferences: [
				{ type: "video", url: "https://example.com/clip.mp4" },
				{ type: "image", role: "reference", url: "https://example.com/ref.png" },
				{ type: "image", role: "last_frame", url: "https://example.com/end.png" },
				{ type: "image", role: "first_frame", data: "AAAA", mimeType: "image/png" },
			],
			seconds: 4,
			size: "4k",
		}));
		expect(request.media.map((item) => item.role)).toEqual(["first_frame", "last_frame", "reference", "source"]);
		expect(request.media[0]?.source).toBe("data:image/png;base64,AAAA");
		expect(request.inputImageCount).toBe(3);
		expect(request.sourceVideo).toBe("https://example.com/clip.mp4");
		expect(request.resolution).toBe("4k");
	});

	it("builds a background interaction that returns a Files API URI", () => {
		const request = normalizeGoogleOmniRequest(ir({ seconds: 4, size: "360p", aspectRatio: "9:16" }));
		expect(buildGoogleOmniInteractionRequest({ model: "gemini-omni-1.1-flash", prompt: "A red paper boat", request, media: [], seed: 7 })).toEqual({
			model: "gemini-omni-1.1-flash",
			input: "A red paper boat",
			background: true,
			store: true,
			response_format: { type: "video", delivery: "uri", duration: "4s", resolution: "360p", aspect_ratio: "9:16" },
			generation_config: { seed: 7 },
		});
	});

	it("puts inline media before the prompt", () => {
		const request = normalizeGoogleOmniRequest(ir({ inputImage: "data:image/jpeg;base64,BBBB" }));
		const body = buildGoogleOmniInteractionRequest({
			model: "gemini-omni-1.1-flash",
			prompt: "The cat blinks",
			request,
			media: [{ kind: "image", mimeType: "image/jpeg", data: "BBBB" }],
		});
		expect(body.input).toEqual([
			{ type: "image", mime_type: "image/jpeg", data: "BBBB" },
			{ type: "text", text: "The cat blinks" },
		]);
	});

	it("holds for the measured token rate of the resolution", () => {
		expect(estimateGoogleOmniUsageMeters(normalizeGoogleOmniRequest(ir({ seconds: 10, size: "360p" }))))
			.toEqual({ output_video_tokens: 19310, output_text_tokens: 1000 });
		expect(estimateGoogleOmniUsageMeters(normalizeGoogleOmniRequest(ir({ seconds: 3, size: "4k" }))).output_video_tokens)
			.toBe(52128);
	});
});

describe("Gemini Interaction payloads", () => {
	it("reads usage as video, thinking and input token meters", () => {
		expect(googleInteractionUsageMeters({ usage: LIVE_USAGE })).toEqual({
			input_text_tokens: 13,
			output_video_tokens: 19310,
			output_text_tokens: 462,
		});
		expect(googleInteractionUsageMeters({
			usage: {
				total_input_tokens: 1300,
				input_tokens_by_modality: [{ modality: "text", tokens: 10 }, { modality: "image", tokens: 1290 }],
				total_output_tokens: 100,
				output_tokens_by_modality: [{ modality: "video", tokens: 100 }],
			},
		})).toEqual({ input_text_tokens: 10, input_image_tokens: 1290, output_video_tokens: 100 });
		expect(googleInteractionUsageMeters({})).toBeNull();
	});

	it("leaves non-interaction payloads alone", () => {
		const operation = { name: "models/veo/operations/1", done: false };
		expect(normalizeGoogleInteractionVideoPayload(operation)).toBe(operation);
		expect(normalizeGoogleInteractionVideoPayload(null)).toBeNull();
	});

	it("reads an in-progress interaction as a pending operation", () => {
		expect(normalizeGoogleInteractionVideoPayload({ id: "v1_abc", status: "in_progress", object: "interaction" }))
			.toMatchObject({ name: "interactions/v1_abc", done: false });
	});

	it("reads a completed interaction as a finished Veo-style operation", () => {
		const normalized = normalizeGoogleInteractionVideoPayload({
			id: "v1_abc",
			status: "completed",
			object: "interaction",
			model: "gemini-omni-1.1-flash",
			usage: LIVE_USAGE,
			response_format: { delivery: "uri", duration: "4s", resolution: "360p", type: "video" },
			steps: [
				{ type: "user_input", content: [{ type: "text", text: "A red paper boat" }] },
				{ type: "thought", signature: "sig" },
				{ type: "model_output", content: [{ type: "video", mime_type: "video/mp4", uri: "https://generativelanguage.googleapis.com/v1beta/files/79gg2cgnfxw7:download?alt=media" }] },
			],
		}) as any;
		expect(normalized.done).toBe(true);
		expect(normalized.error).toBeUndefined();
		expect(normalized.response.generateVideoResponse.generatedSamples[0].video).toEqual({
			uri: "https://generativelanguage.googleapis.com/v1beta/files/79gg2cgnfxw7:download?alt=media",
			mimeType: "video/mp4",
		});
		expect(normalized.response.videoMetadata).toEqual({ durationSeconds: 4, resolution: "360p" });
		expect(normalized.usageMeters).toEqual({ input_text_tokens: 13, output_video_tokens: 19310, output_text_tokens: 462 });
	});

	it("reads a failed interaction as an operation error", () => {
		// Shape Google returned for an https image URL it would not fetch.
		const normalized = normalizeGoogleInteractionVideoPayload({
			id: "v1_bad",
			status: "failed",
			object: "interaction",
			errors: [{ message: "There was a problem processing your request.", code: "INVALID_ARGUMENT" }],
		}) as any;
		expect(normalized).toMatchObject({ done: true, error: { status: "INVALID_ARGUMENT", message: "There was a problem processing your request." } });
	});

	it("treats a completed interaction without a file as failed", () => {
		const normalized = normalizeGoogleInteractionVideoPayload({
			id: "v1_inline",
			status: "completed",
			object: "interaction",
			steps: [{ type: "model_output", content: [{ type: "video", mime_type: "video/mp4", data: "AAAA" }] }],
		}) as any;
		expect(normalized.done).toBe(true);
		expect(normalized.error.message).toContain("without a video file");
	});

	it("reads a cancelled interaction as a cancelled operation", () => {
		expect((normalizeGoogleInteractionVideoPayload({ id: "v1_c", status: "cancelled", object: "interaction" }) as any).error)
			.toMatchObject({ code: 1, status: "CANCELLED" });
	});
});

describe("Gemini Omni pricing", () => {
	const tokenRule = (meter: string, price: string) => ({
		meter, unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD", pricing_plan: "standard", match: [],
	});
	const card: PriceCard = {
		provider: "google-ai-studio",
		model: "google/gemini-omni-flash",
		endpoint: "video.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: [
			tokenRule("input_text_tokens", "1.5"),
			tokenRule("input_image_tokens", "1.5"),
			tokenRule("input_video_tokens", "1.5"),
			tokenRule("input_audio_tokens", "1.5"),
			tokenRule("output_text_tokens", "9"),
			tokenRule("output_video_tokens", "17.5"),
		] as any,
	};

	it("charges what Google billed for the live 10-second 360p run", () => {
		const priced = computeVideoPricedUsage({
			seconds: 10,
			card,
			model: "google/gemini-omni-flash",
			requestOptions: { resolution: "360p" },
			providerUsageMeters: googleInteractionUsageMeters({ usage: LIVE_USAGE }),
		}) as any;
		// 19,310 x $17.50 + 462 x $9 + 13 x $1.50 per million tokens.
		expect(priced.pricing.total_nanos).toBe(337_925_000 + 4_158_000 + 19_500);
	});

	it("never takes token meters from request options", () => {
		const priced = computeVideoPricedUsage({
			seconds: 10,
			card,
			model: "google/gemini-omni-flash",
			requestOptions: { resolution: "360p", output_video_tokens: 1, provider_usage_meters: { output_video_tokens: 1 } },
			providerUsageMeters: { output_video_tokens: 19310 },
		}) as any;
		expect(priced.pricing.total_nanos).toBe(337_925_000);
	});
});
