import type { IRVideoGenerationRequest } from "@core/ir";

export const deepinfraVideoModels = ["ByteDance/Seedance-1.5-Pro", "ByteDance/Seedance-2.0", "google/veo-3.1", "google/veo-3.1-fast"];

export function mapDeepinfraVideo(ir: IRVideoGenerationRequest, model: string) {
	if (!deepinfraVideoModels.includes(model)) throw new Error("Unsupported DeepInfra video model.");
	const veo = model.startsWith("google/");
	const secondGeneration = model === "ByteDance/Seedance-2.0";
	const options = ir.providerParams ?? {};
	const allowed = veo ? ["person_generation"] : secondGeneration ? ["watermark", "return_last_frame"] : ["watermark"];
	if (Object.keys(options).some(key => !allowed.includes(key))) throw new Error("Unsupported DeepInfra video provider option.");
	if (!ir.prompt) throw new Error("A video prompt is required.");
	if ((ir.sampleCount ?? ir.numberOfVideos ?? 1) !== 1) throw new Error("One video output is supported per job.");
	if (ir.inputVideo || ir.input?.video || ir.inputReferences?.some(ref => ref.type !== "image")) throw new Error("This route supports text and image inputs only.");
	if (ir.frameRate != null || ir.fps != null || ir.quality != null) throw new Error("Frame rate and quality are not supported by this native endpoint.");
	const seconds = Number(ir.seconds ?? ir.durationSeconds ?? ir.duration ?? (veo ? 8 : 5));
	if (!Number.isInteger(seconds) || (veo ? seconds !== 8 : seconds < 4 || seconds > (secondGeneration ? 15 : 12))) throw new Error("Unsupported native video duration.");
	const resolution = ir.resolution ?? ir.size ?? "720p";
	if (!(veo ? ["720p", "1080p"] : ["480p", "720p", "1080p"]).includes(resolution)) throw new Error("Unsupported video resolution.");
	const aspectRatio = ir.aspectRatio ?? ir.ratio ?? "16:9";
	if (!(veo ? ["16:9", "9:16"] : ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]).includes(aspectRatio)) throw new Error("Unsupported video aspect ratio.");
	if (ir.seed != null && (!Number.isInteger(ir.seed) || ir.seed < (veo ? 0 : -1) || ir.seed > 4294967295)) throw new Error("Invalid video seed.");
	if ((!veo && (ir.negativePrompt != null || ir.enhancePrompt != null)) || ((veo || secondGeneration) && ir.cameraFixed != null)) throw new Error("Unsupported native video control.");
	if (options.person_generation != null && !["allow_adult", "dont_allow"].includes(options.person_generation)) throw new Error("Invalid person_generation.");
	for (const key of ["watermark", "return_last_frame"]) if (options[key] != null && typeof options[key] !== "boolean") throw new Error(`Invalid ${key}.`);
	const body: Record<string, unknown> = { ...options, prompt: ir.prompt, resolution, aspect_ratio: aspectRatio, generate_audio: ir.generateAudio ?? true };
	if (veo) { body.sample_count = 1; if (ir.negativePrompt != null) body.negative_prompt = ir.negativePrompt; if (ir.enhancePrompt != null) body.enhance_prompt = ir.enhancePrompt; }
	else { body.duration = seconds; if (ir.cameraFixed != null) body.camera_fixed = ir.cameraFixed; }
	if (ir.seed != null) body.seed = ir.seed;
	const images: Array<string | Blob> = [];
	for (const value of [ir.inputReference, ir.inputImage, ir.input?.image, ir.lastFrame, ir.input?.lastFrame]) {
		if (value != null) { if (typeof value !== "string" && !(value instanceof Blob)) throw new Error("Unsupported image reference."); if (!images.includes(value)) images.push(value); }
	}
	for (const ref of ir.inputReferences ?? []) {
		const value = ref.url ?? (ref.data && ref.mimeType ? `data:${ref.mimeType};base64,${ref.data}` : undefined);
		if (!value) throw new Error("Image references require a URL or inline data.");
		if (!images.includes(value)) images.push(value);
	}
	if (images.length > (veo ? 1 : 2)) throw new Error("Too many image keyframes for this route.");
	return { body, images, seconds, resolution, aspectRatio, veo };
}

export async function deepinfraTokenHash(token: string): Promise<string> {
	const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export function deepinfraVideoResult(payload: any) {
	const state = payload?.inference_status?.status;
	const result = payload?.results ?? payload;
	if (state === "failed" || result?.status === "error") return { status: "failed" as const };
	if (result?.status === "cancelled") return { status: "cancelled" as const };
	if (state !== "succeeded") throw new Error("A terminal DeepInfra result is required.");
	const cost = payload.inference_status.cost;
	if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) throw new Error("Missing native video cost.");
	const videos = result.videos ?? (result.video_url ? [result.video_url] : []);
	if (!Array.isArray(videos) || videos.length !== 1 || typeof videos[0] !== "string") throw new Error("Expected one generated video URL.");
	const url = new URL(videos[0], "https://api.deepinfra.com");
	if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid video output URL.");
	return { status: "completed" as const, cost, downloadUrl: url.toString() };
}
