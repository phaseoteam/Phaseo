// Purpose: Gemini Omni video on Google AI Studio through the Interactions API.
// Why: Omni is only served by POST /v1beta/interactions, not predictLongRunning, and
//      Google bills it by tokens (video output, thinking and input) rather than seconds.
// How: Validate the request, build a background interaction that returns a Files API
//      URI, and translate an Interaction into the Operation shape the video routes
//      already read, so polling, downloads and billing reuse the Veo paths.
//      Wire format checked live on 2026-11-04 (https://aistudio.google.com/docs/omni).

import type { IRVideoGenerationRequest } from "@core/ir";
import { resolveVideoOutputCount, resolveVideoSize } from "@core/video-request-options";
import { InvalidGoogleVideoRequestError } from "./request";
import { toGoogleVideoDurationSeconds } from "./shared";

export const GOOGLE_INTERACTION_NAME_PREFIX = "interactions/";

export const OMNI_RESOLUTIONS = ["360p", "720p", "1080p", "4k"] as const;
export type OmniResolution = (typeof OMNI_RESOLUTIONS)[number];

/**
 * Video output tokens Google counts per second. 720p is Google's documented
 * rate ("5,792 tokens per second of 720p video"); the others were measured on
 * 2026-11-04 and are exact multiples of it. Only used to size the wallet hold:
 * the charge uses the tokens Google reports.
 */
export const OMNI_VIDEO_TOKENS_PER_SECOND: Record<OmniResolution, number> = {
	"360p": 1931,
	"720p": 5792,
	"1080p": 8688,
	"4k": 17376,
};

/** Thinking tokens to hold for; measured runs used 130 to 460. */
const OMNI_ESTIMATED_THOUGHT_TOKENS = 1000;

export const OMNI_DEFAULT_SECONDS = 8;
const OMNI_MIN_SECONDS = 3;
const OMNI_MAX_SECONDS = 10;

export function isGoogleOmniVideoModel(model: string): boolean {
	return /^gemini-omni(?:-|$)/i.test(model.trim().replace(/^models\//i, ""));
}

export function isGoogleInteractionName(value: unknown): value is string {
	return typeof value === "string" && value.startsWith(GOOGLE_INTERACTION_NAME_PREFIX);
}

type OmniMediaSource = { kind: "image" | "video"; role: "first_frame" | "last_frame" | "reference" | "source"; source: unknown };

export type NormalizedGoogleOmniRequest = {
	seconds: number;
	resolution: OmniResolution;
	aspectRatio: "16:9" | "9:16";
	outputCount: 1;
	media: OmniMediaSource[];
	sourceVideo?: unknown;
	inputVideoDurationSeconds?: number;
	inputImageCount: number;
};

function referenceSource(reference: NonNullable<IRVideoGenerationRequest["inputReferences"]>[number]): unknown {
	return reference.url ?? reference.raw ?? (reference.data
		? `data:${reference.mimeType ?? "application/octet-stream"};base64,${reference.data}`
		: undefined);
}

function present(value: unknown): boolean {
	return value !== undefined && value !== null && value !== "";
}

export function normalizeGoogleOmniRequest(ir: IRVideoGenerationRequest): NormalizedGoogleOmniRequest {
	if (ir.inputReferences?.some((reference) => reference.type === "audio" || reference.type === "mask")) {
		throw new InvalidGoogleVideoRequestError("Gemini Omni accepts image and video inputs only.");
	}
	if (ir.generateAudio === false) {
		throw new InvalidGoogleVideoRequestError("Gemini Omni always generates audio; generate_audio cannot be false.");
	}
	if (ir.negativePrompt) {
		throw new InvalidGoogleVideoRequestError("Gemini Omni does not support negative prompts.");
	}
	if (resolveVideoOutputCount({ sampleCount: ir.sampleCount, numberOfVideos: ir.numberOfVideos }) !== 1) {
		throw new InvalidGoogleVideoRequestError("Gemini Omni generates exactly one video per request.");
	}

	const media: OmniMediaSource[] = [];
	const references = ir.inputReferences ?? [];
	for (const reference of references) {
		const source = referenceSource(reference);
		if (!present(source)) continue;
		if (reference.type === "video") {
			media.push({ kind: "video", role: "source", source });
		} else if (reference.role === "last_frame") {
			media.push({ kind: "image", role: "last_frame", source });
		} else if (reference.role === "reference") {
			media.push({ kind: "image", role: "reference", source });
		} else {
			media.push({ kind: "image", role: "first_frame", source });
		}
	}
	if (references.length === 0) {
		for (const source of [ir.inputImage, ir.input?.image, ir.inputReference]) {
			if (present(source)) media.push({ kind: "image", role: "first_frame", source });
		}
		for (const source of [ir.lastFrame, ir.input?.lastFrame]) {
			if (present(source)) media.push({ kind: "image", role: "last_frame", source });
		}
		for (const entry of [...(ir.referenceImages ?? []), ...(ir.input?.referenceImages ?? [])]) {
			const source = entry?.image ?? entry?.url ?? entry?.uri ?? entry;
			if (present(source)) media.push({ kind: "image", role: "reference", source });
		}
		for (const source of [ir.inputVideo, ir.input?.video]) {
			if (present(source)) media.push({ kind: "video", role: "source", source });
		}
	}
	const count = (role: OmniMediaSource["role"]) => media.filter((item) => item.role === role).length;
	if (count("first_frame") > 1 || count("last_frame") > 1 || count("source") > 1) {
		throw new InvalidGoogleVideoRequestError("Gemini Omni accepts at most one first frame, last frame, and source video.");
	}
	if (count("last_frame") > 0 && count("first_frame") === 0) {
		throw new InvalidGoogleVideoRequestError("Gemini Omni last-frame generation requires a first-frame image.");
	}
	// Google orders frames by position: the first image is the starting frame and
	// a second one the ending frame, so frames go first, then references, then video.
	const order: Record<OmniMediaSource["role"], number> = { first_frame: 0, last_frame: 1, reference: 2, source: 3 };
	media.sort((a, b) => order[a.role] - order[b.role]);

	const rawResolution = (resolveVideoSize({ size: ir.size, resolution: ir.resolution }) ?? "720p").toLowerCase();
	if (!(OMNI_RESOLUTIONS as readonly string[]).includes(rawResolution)) {
		throw new InvalidGoogleVideoRequestError("Gemini Omni resolution must be 360p, 720p, 1080p, or 4k.");
	}
	const seconds = toGoogleVideoDurationSeconds(ir) ?? OMNI_DEFAULT_SECONDS;
	if (!Number.isInteger(seconds) || seconds < OMNI_MIN_SECONDS || seconds > OMNI_MAX_SECONDS) {
		throw new InvalidGoogleVideoRequestError("Gemini Omni duration must be a whole number of seconds from 3 to 10.");
	}
	const aspectRatio = ir.aspectRatio ?? ir.ratio ?? "16:9";
	if (aspectRatio !== "16:9" && aspectRatio !== "9:16") {
		throw new InvalidGoogleVideoRequestError("Gemini Omni aspect ratio must be 16:9 or 9:16.");
	}
	const sourceVideo = media.find((item) => item.role === "source")?.source;

	return {
		seconds,
		resolution: rawResolution as OmniResolution,
		aspectRatio,
		outputCount: 1,
		media,
		...(sourceVideo !== undefined ? { sourceVideo } : {}),
		...(sourceVideo !== undefined && ir.inputVideoDurationSeconds != null
			? { inputVideoDurationSeconds: ir.inputVideoDurationSeconds }
			: {}),
		inputImageCount: media.filter((item) => item.kind === "image").length,
	};
}

export type OmniInlineMedia = { kind: "image" | "video"; mimeType: string; data: string };

export function buildGoogleOmniInteractionRequest(args: {
	model: string;
	prompt: string;
	request: NormalizedGoogleOmniRequest;
	media: OmniInlineMedia[];
	seed?: number;
}): Record<string, unknown> {
	const input = [
		...args.media.map((item) => ({ type: item.kind, mime_type: item.mimeType, data: item.data })),
		{ type: "text", text: args.prompt },
	];
	return {
		model: args.model,
		input: args.media.length > 0 ? input : args.prompt,
		// Background runs return at once and are polled like a Veo operation; they
		// need store=true, which also keeps the result for Google's 55 days.
		background: true,
		store: true,
		response_format: {
			type: "video",
			// A Files API URI instead of base64 in the interaction: the same download
			// path as Veo, and no multi-megabyte JSON on every status poll.
			delivery: "uri",
			duration: `${args.request.seconds}s`,
			resolution: args.request.resolution,
			aspect_ratio: args.request.aspectRatio,
		},
		...(typeof args.seed === "number" ? { generation_config: { seed: args.seed } } : {}),
	};
}

/** Token meters to hold credits for before Google reports the real counts. */
export function estimateGoogleOmniUsageMeters(request: NormalizedGoogleOmniRequest): Record<string, number> {
	return {
		output_video_tokens: request.seconds * OMNI_VIDEO_TOKENS_PER_SECOND[request.resolution],
		output_text_tokens: OMNI_ESTIMATED_THOUGHT_TOKENS,
	};
}

function finiteTokens(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/**
 * Meters from an Interaction's usage: input tokens by modality, video output
 * tokens, and thinking plus any text output as output_text_tokens (Google
 * prices both at the text output rate).
 */
export function googleInteractionUsageMeters(payload: unknown): Record<string, number> | null {
	const usage = (payload as any)?.usage;
	if (!usage || typeof usage !== "object") return null;
	const meters: Record<string, number> = {};
	const add = (meter: string, tokens: number) => {
		if (tokens > 0) meters[meter] = (meters[meter] ?? 0) + tokens;
	};
	for (const entry of Array.isArray(usage.input_tokens_by_modality) ? usage.input_tokens_by_modality : []) {
		const modality = String(entry?.modality ?? "").toLowerCase();
		const tokens = finiteTokens(entry?.tokens);
		if (modality === "image") add("input_image_tokens", tokens);
		else if (modality === "video") add("input_video_tokens", tokens);
		else if (modality === "audio") add("input_audio_tokens", tokens);
		else add("input_text_tokens", tokens);
	}
	const reportedInput = Object.values(meters).reduce((sum, tokens) => sum + tokens, 0);
	const totalInput = finiteTokens(usage.total_input_tokens);
	if (totalInput > reportedInput) add("input_text_tokens", totalInput - reportedInput);
	let videoOutput = 0;
	let otherOutput = 0;
	for (const entry of Array.isArray(usage.output_tokens_by_modality) ? usage.output_tokens_by_modality : []) {
		const tokens = finiteTokens(entry?.tokens);
		if (String(entry?.modality ?? "").toLowerCase() === "video") videoOutput += tokens;
		else otherOutput += tokens;
	}
	const totalOutput = finiteTokens(usage.total_output_tokens);
	if (totalOutput > videoOutput + otherOutput) otherOutput += totalOutput - videoOutput - otherOutput;
	add("output_video_tokens", videoOutput);
	add("output_text_tokens", otherOutput + finiteTokens(usage.total_thought_tokens));
	return Object.keys(meters).length > 0 ? meters : null;
}

function firstInteractionVideo(payload: any): { uri: string | null; mimeType: string | null } | null {
	const steps = Array.isArray(payload?.steps) ? payload.steps : [];
	for (const step of steps) {
		if (step?.type !== "model_output") continue;
		for (const content of Array.isArray(step?.content) ? step.content : []) {
			if (content?.type !== "video") continue;
			const uri = typeof content.uri === "string" && content.uri.trim() ? content.uri.trim() : null;
			const mimeType = typeof content.mime_type === "string" && content.mime_type.trim() ? content.mime_type.trim() : null;
			return { uri, mimeType };
		}
	}
	return null;
}

function parseDurationSeconds(value: unknown): number | undefined {
	if (typeof value !== "string") return undefined;
	const match = value.trim().match(/^(\d+(?:\.\d+)?)s$/);
	return match ? Number(match[1]) : undefined;
}

/**
 * Turns a Gemini Interaction into the long-running Operation shape the Google
 * video routes read (done, error, response.generateVideoResponse), keeping the
 * usage meters. Anything that is not an Interaction is returned as it is.
 */
export function normalizeGoogleInteractionVideoPayload(payload: unknown): unknown {
	const json = payload as any;
	if (!json || typeof json !== "object" || json.object !== "interaction") return payload;
	const status = String(json.status ?? "").toLowerCase();
	const name = `${GOOGLE_INTERACTION_NAME_PREFIX}${String(json.id ?? "")}`;
	const firstError = Array.isArray(json.errors) ? json.errors[0] : json.error;
	const video = firstInteractionVideo(json);
	const usageMeters = googleInteractionUsageMeters(json);
	const durationSeconds = parseDurationSeconds(json.response_format?.duration);
	const resolution = typeof json.response_format?.resolution === "string" ? json.response_format.resolution : undefined;
	const base = {
		name,
		object: "interaction",
		status,
		...(usageMeters ? { usageMeters } : {}),
		...(json.usage ? { usage: json.usage } : {}),
	};
	if (status === "in_progress" || status === "requires_action" || status === "requires_continuation" || status === "") {
		return { ...base, done: false };
	}
	if (status === "cancelled") {
		return { ...base, done: true, error: { code: 1, status: "CANCELLED", message: firstError?.message ?? "Interaction cancelled." } };
	}
	if (status === "completed" && video?.uri) {
		return {
			...base,
			done: true,
			response: {
				model: json.model,
				generateVideoResponse: { generatedSamples: [{ video: { uri: video.uri, mimeType: video.mimeType ?? "video/mp4" } }] },
				videoMetadata: {
					...(durationSeconds !== undefined ? { durationSeconds } : {}),
					...(resolution ? { resolution } : {}),
				},
			},
		};
	}
	// failed, incomplete, or completed without a downloadable video.
	return {
		...base,
		done: true,
		error: {
			code: typeof firstError?.code === "number" ? firstError.code : 13,
			status: typeof firstError?.code === "string" ? firstError.code : "INTERNAL",
			message: firstError?.message ?? (status === "completed"
				? "Gemini Omni completed without a video file."
				: `Gemini Omni interaction ended with status ${status}.`),
		},
	};
}
