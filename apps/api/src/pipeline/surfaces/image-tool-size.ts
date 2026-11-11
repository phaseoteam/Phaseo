// Purpose: Map the image tool's aspect ratio onto GPT Image sizes, which take no aspect_ratio.

export function isGptImageModel(model: string): boolean {
	return /(^|\/)(gpt-image-|chatgpt-image-)/i.test(model.trim());
}

/**
 * GPT Image's sizes for an aspect ratio: square, landscape (1536x1024) or portrait (1024x1536).
 * Returns undefined for "auto" or an unreadable ratio, which leaves the size to the model.
 */
export function gptImageSizeForAspectRatio(aspectRatio: string): string | undefined {
	const match = /^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/i.exec(aspectRatio);
	if (!match) return undefined;
	const ratio = Number(match[1]) / Number(match[2]);
	if (!Number.isFinite(ratio) || ratio <= 0) return undefined;
	if (Math.abs(ratio - 1) < 0.1) return "1024x1024";
	return ratio > 1 ? "1536x1024" : "1024x1536";
}
