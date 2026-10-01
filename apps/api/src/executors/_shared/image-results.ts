import type { IRImageGenerationRequest, IRImageGenerationResponse } from "@core/ir";
import type { ExecutorUpstreamTiming } from "@executors/types";
import { fetchPublicMedia } from "@core/public-media-fetch";

export function imageBytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	return btoa(binary);
}

export async function imageInputUrl(image: string | Blob): Promise<string> {
	if (typeof image === "string") return image;
	if (image.size > 10 * 1024 * 1024) throw new Error("Input image exceeds 10 MB.");
	return `data:${image.type || "image/png"};base64,${imageBytesToBase64(new Uint8Array(await image.arrayBuffer()))}`;
}

export function unsupportedImageOption(ir: IRImageGenerationRequest): string | undefined {
	for (const key of ["mask", "quality", "partialImages", "outputCompression", "background", "moderation", "inputFidelity", "style"] as const) {
		if (ir[key] !== undefined) return key;
	}
	if (ir.stream) return "stream";
	if (ir.outputFormat && ir.outputFormat !== "png") return "outputFormat";
	if (ir.responseFormat && !["url", "b64_json"].includes(ir.responseFormat)) return "responseFormat";
	return undefined;
}

export async function imageResultData(urls: string[], responseFormat?: string, upstreamTiming?: ExecutorUpstreamTiming): Promise<IRImageGenerationResponse["data"]> {
	const data: IRImageGenerationResponse["data"] = [];
	for (const url of urls) {
		if (responseFormat === "b64_json") {
			const image = await fetchPublicMedia({ url, maxBytes: 20 * 1024 * 1024, upstreamTiming });
			data.push({ b64Json: imageBytesToBase64(image.bytes) });
		} else data.push({ url });
	}
	return data;
}
