import type { IRVideoGenerationRequest } from "@core/ir";
export function mapBflVideo(ir: IRVideoGenerationRequest) {
	const options = ir.providerParams ?? {};
	if (Object.keys(options).some((key) => !["mode", "draft", "safety_tolerance", "version"].includes(key))) throw new Error("Unsupported FLUX 3 provider option.");
	if (ir.seed != null || ir.negativePrompt != null || ir.cameraFixed != null || ir.enhancePrompt != null) throw new Error("FLUX 3 does not support seed, negative prompt, camera fixed, or prompt enhancement controls.");
	if ((ir.sampleCount ?? ir.numberOfVideos ?? 1) !== 1) throw new Error("FLUX 3 accepts one output per request.");
	if ((ir.frameRate ?? ir.fps ?? 24) !== 24) throw new Error("FLUX 3 supports 24 fps.");
	const refs = ir.inputReferences ?? [];
	if (refs.some((ref) => ref.type !== "image" && ref.type !== "video")) throw new Error("FLUX 3 accepts image keyframes or a source video.");
	const media = (ref: (typeof refs)[number]): string => {
		if (ref.url) return ref.url;
		if (ref.data && ref.mimeType) return `data:${ref.mimeType};base64,${ref.data}`;
		throw new Error("FLUX 3 references need a URL or inline data with a MIME type.");
	};
	const images = refs.filter((ref) => ref.type === "image").map(media);
	const videos = refs.filter((ref) => ref.type === "video").map(media);
	for (const value of [ir.inputReference, ir.inputImage, ir.input?.image, ir.lastFrame, ir.input?.lastFrame]) {
		if (typeof value === "string" && !images.includes(value)) images.push(value);
	}
	for (const value of [ir.inputVideo, ir.input?.video]) {
		if (typeof value === "string" && !videos.includes(value)) videos.push(value);
	}
	if (images.length > 10 || videos.length > 1 || (images.length && videos.length)) throw new Error("FLUX 3 accepts up to ten keyframes or one source video, separately.");
	const mode = videos.length ? "v2v" : images.length ? "i2v" : "t2v";
	if (options.mode != null && options.mode !== mode) throw new Error("FLUX 3 mode must match the supplied media; draft enhancement requires a separate contract.");
	const seconds = Number(ir.durationSeconds ?? ir.duration ?? ir.seconds ?? 5);
	if (!Number.isInteger(seconds) || seconds < 5 || seconds > (mode === "v2v" ? 15 : 20)) throw new Error("FLUX 3 requires 5–20 whole seconds, or 5–15 for continuation.");
	const resolution = ir.resolution ?? ir.size ?? "hd";
	if (!["hd", "fhd"].includes(resolution)) throw new Error("FLUX 3 resolution must be hd or fhd.");
	const draft = options.draft ?? false;
	if (typeof draft !== "boolean" || (draft && resolution !== "hd")) throw new Error("FLUX 3 drafts require hd resolution and a boolean draft option.");
	const ratio = ir.aspectRatio ?? ir.ratio ?? "auto";
	if (!["auto", "21:9", "2:1", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(ratio)) throw new Error("Unsupported FLUX 3 aspect ratio.");
	if (options.version != null && options.version !== "latest") throw new Error("FLUX 3 currently supports version latest.");
	if (options.safety_tolerance != null && (!Number.isInteger(options.safety_tolerance) || options.safety_tolerance < 0 || options.safety_tolerance > 4)) throw new Error("FLUX 3 safety_tolerance must be an integer from 0 to 4.");
	return { seconds, resolution, mode, draft, body: { ...options, mode, prompt: ir.prompt, duration: seconds, resolution, aspect_ratio: ratio, draft,
		generate_audio: ir.generateAudio ?? true, ...(images.length ? { keyframes: images.length === 1 ? images[0] : images } : {}), ...(videos.length ? { start_video: videos[0] } : {}) } };
}
