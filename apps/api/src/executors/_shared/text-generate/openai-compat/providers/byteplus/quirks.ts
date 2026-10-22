// BytePlus ModelArk request/response compatibility for current Seed models.
import type { ProviderQuirks } from "../../quirks/types";

function thinkingType(ir: any): "enabled" | "disabled" | undefined {
	const reasoning = ir?.reasoning;
	if (!reasoning || typeof reasoning !== "object") return undefined;
	if (reasoning.enabled === false || reasoning.effort === "none") return "disabled";
	if (reasoning.enabled === true || (typeof reasoning.effort === "string" && reasoning.effort !== "none")) {
		return "enabled";
	}
	return undefined;
}

export function applyBytePlusRequestQuirks(request: any, ir: any): void {
	const type = thinkingType(ir);
	if (type) request.thinking = { type };
	for (const item of request.input ?? request.input_items ?? request.messages ?? []) {
		for (const part of Array.isArray(item?.content) ? item.content : []) {
			// ModelArk takes video as `input_video` with a string `video_url`.
			if ((part?.type === "input_video" || part?.type === "video_url") && part.video_url && typeof part.video_url === "object") {
				part.type = "input_video";
				part.video_url = part.video_url.url;
			}
		}
	}
}

export const bytePlusQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir }) => applyBytePlusRequestQuirks(request, ir),
	extractReasoning: ({ choice, rawContent }) => {
		const reasoning = choice?.message?.reasoning_content ?? choice?.reasoning_content;
		return {
			main: rawContent,
			reasoning: typeof reasoning === "string" && reasoning.length > 0 ? [reasoning] : [],
		};
	},
};
