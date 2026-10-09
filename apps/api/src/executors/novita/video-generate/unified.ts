import type { IRVideoGenerationRequest } from "@core/ir";
import { buildKlingRequest } from "./kling";

const MODELS = new Set(["kling2.5_turbo_pro", "kling2.1_master"]);

export function isUnifiedKlingModel(model: string): boolean {
	return MODELS.has(model);
}

// Reviewed against Novita's video-unify-api/config on 2026-10-07.
// Keep the allowlist local: that discovery endpoint also lists retired models.
export function buildUnifiedKlingRequest(ir: IRVideoGenerationRequest, model: string) {
	if (!MODELS.has(model)) throw new Error("Unsupported Novita unified video model.");
	const imageToVideo = Boolean(ir.inputReference || ir.inputImage);
	const options = ir.providerParams ?? {};
	if (Object.keys(options).some(key => key !== "guidance_scale")) throw new Error("Only guidance_scale is supported for this Novita model.");
	if (ir.generateAudio === true || ir.lastFrame || ir.inputReferences?.some(ref => ref.role === "last_frame")) throw new Error("This Novita model does not support audio or an ending frame.");
	const request = buildKlingRequest({ ...ir, providerParams: options.guidance_scale === undefined ? {} : { cfg_scale: options.guidance_scale } }, `kling-v3.0-std-${imageToVideo ? "i2v" : "t2v"}`);
	if (![5, 10].includes(request.seconds)) throw new Error("This Novita model requires 5 or 10 seconds.");
	return {
		...request,
		body: {
			model: `${model}_${imageToVideo ? "i2v" : "t2v"}`, prompt: ir.prompt, duration: String(request.seconds),
			...(imageToVideo ? { image: request.image } : { aspect_ratio: request.ratio }),
			...(ir.negativePrompt !== undefined ? { negative_prompt: ir.negativePrompt } : {}),
			...(options.guidance_scale !== undefined ? { guidance_scale: options.guidance_scale } : {}),
		},
	};
}
