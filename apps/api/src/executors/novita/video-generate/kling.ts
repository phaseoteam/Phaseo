import type { IRVideoGenerationRequest } from "@core/ir";

const MODELS = new Set([
	"kling-v3.0-std-t2v", "kling-v3.0-std-i2v",
	"kling-v3.0-pro-t2v", "kling-v3.0-pro-i2v",
]);
const TIERS = new Set(["kling-v3.0-std", "kling-v3.0-pro"]);

export function isKlingModel(model: string): boolean {
	return MODELS.has(model) || TIERS.has(model);
}

export function resolveKlingEndpoint(ir: IRVideoGenerationRequest, model: string): string {
	if (!TIERS.has(model)) return model;
	return `${model}-${ir.inputReference || ir.inputImage ? "i2v" : "t2v"}`;
}

// Novita's reviewed Kling wire contract; callers cannot supply an endpoint.
export function buildKlingRequest(ir: IRVideoGenerationRequest, model: string) {
	const seconds = Number(ir.durationSeconds ?? ir.duration ?? ir.seconds ?? 5);
	const image = typeof ir.inputReference === "string" ? ir.inputReference
		: typeof ir.inputImage === "string" ? ir.inputImage : undefined;
	const lastImage = typeof ir.lastFrame === "string" ? ir.lastFrame : undefined;
	const imageToVideo = model.endsWith("-i2v");
	const ratio = ir.aspectRatio ?? "16:9";
	const options = ir.providerParams ?? {};
	if ([ir.inputReference, ir.inputImage, ir.lastFrame].some(value => value !== undefined && typeof value !== "string")) throw new Error("Novita Kling image frames must be URL strings.");
	if (!MODELS.has(model)) throw new Error("Unsupported Novita Kling model.");
	if (!Number.isInteger(seconds) || seconds < 3 || seconds > 15) throw new Error("Novita Kling 3.0 requires 3–15 seconds.");
	if ((ir.sampleCount ?? ir.numberOfVideos ?? 1) !== 1) throw new Error("Novita Kling supports one output.");
	if (imageToVideo !== Boolean(image)) throw new Error(imageToVideo ? "This model requires a first image frame." : "This model only accepts text input.");
	if (lastImage && !imageToVideo) throw new Error("An ending frame requires an image-to-video model.");
	if (ir.inputVideo || ir.inputReferences?.some(ref => ref.type !== "image" || !["first_frame", "last_frame"].includes(ref.role ?? "")) || ir.referenceImages?.length) throw new Error("Only first and last image frames are supported.");
	if ((ir.inputReferences?.filter(ref => ref.role === "first_frame").length ?? 0) > 1 || (ir.inputReferences?.filter(ref => ref.role === "last_frame").length ?? 0) > 1) throw new Error("Only one first and one last frame are supported.");
	if (ir.providerOptions && Object.keys(ir.providerOptions).length || ir.compressionQuality !== undefined || ir.personGeneration !== undefined || ir.enhancePrompt !== undefined || ir.resizeMode !== undefined || ir.frameRate !== undefined || ir.fps !== undefined || ir.cameraFixed !== undefined || ir.outputStorageUri !== undefined || ir.callbackUrl !== undefined) throw new Error("Unsupported Novita Kling video controls.");
	if (ir.size || ir.resolution || ir.seed !== undefined || ir.quality) throw new Error("Novita Kling does not expose size, resolution, seed, or quality controls.");
	if (imageToVideo && ir.aspectRatio) throw new Error("Image-to-video derives its aspect ratio from the first frame.");
	if (!["16:9", "9:16", "1:1"].includes(ratio)) throw new Error("Unsupported Novita Kling aspect ratio.");
	if (ir.prompt.length > 2500 || (ir.negativePrompt?.length ?? 0) > 2500) throw new Error("Novita Kling prompts must not exceed 2500 characters.");
	if (Object.keys(options).some(key => key !== "cfg_scale")) throw new Error("Unsupported Novita Kling provider option.");
	if (options.cfg_scale !== undefined && (typeof options.cfg_scale !== "number" || !Number.isFinite(options.cfg_scale) || options.cfg_scale < 0 || options.cfg_scale > 1)) throw new Error("cfg_scale must be between 0 and 1.");
	const generateAudio = ir.generateAudio ?? false;
	return {
		seconds, image, ratio, generateAudio,
		body: {
			prompt: ir.prompt, duration: seconds, sound: generateAudio,
			...(imageToVideo ? { image } : { aspect_ratio: ratio }),
			...(lastImage ? { end_image: lastImage } : {}),
			...(ir.negativePrompt !== undefined ? { negative_prompt: ir.negativePrompt } : {}),
			...(options.cfg_scale !== undefined ? { cfg_scale: options.cfg_scale } : {}),
		},
	};
}
