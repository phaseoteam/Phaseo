import type { ProviderQuirks } from "../../quirks/types";
import { minimaxQuirks } from "../minimax/quirks";

function unsupported(field: string): never {
	throw Object.assign(new Error(`Vertex open model does not support ${field}`), { code: "unsupported_parameter", param: field });
}

// Vertex hosts open models behind its OpenAI wire format with native thinking controls.
export const vertexOpenModelQuirks: ProviderQuirks = {
	transformRequest: ({ request, ir, model }) => {
		const slug = String(model ?? "").toLowerCase();
		const reasoning = ir.reasoning;
		if (!reasoning) return;
		if (reasoning.maxTokens !== undefined) unsupported("reasoning.max_tokens");
		if (reasoning.summary !== undefined) unsupported("reasoning.summary");
		if (slug.startsWith("openai/gpt-oss-")) {
			const effort = reasoning.effort ?? (reasoning.enabled === true ? "medium" : undefined);
			if (reasoning.enabled === false || (effort !== undefined && !["low", "medium", "high"].includes(effort))) unsupported("reasoning.effort");
			if (effort) request.reasoning_effort = effort;
			return;
		}
		if (reasoning.effort !== undefined && reasoning.effort !== "none") unsupported("reasoning.effort");
		const enabled = reasoning.effort === "none" ? false : reasoning.enabled;
		if (enabled === undefined) return;
		if (slug === "deepseek-ai/deepseek-v3.2-maas") {
			request.chat_template_kwargs = { thinking: enabled };
		} else if (slug.startsWith("zai-org/glm-")) {
			request.chat_template_kwargs = { enable_thinking: enabled };
		} else if (slug.includes("thinking-maas") || slug === "minimaxai/minimax-m2-maas") {
			if (!enabled) unsupported("reasoning.enabled");
		} else if (enabled) unsupported("reasoning.enabled");
	},
	extractReasoning: minimaxQuirks.extractReasoning,
	transformStreamChunk: args => {
		if (typeof args.chunk?.model === "string") args.accumulated.vertexModel = args.chunk.model;
		if (String(args.accumulated.vertexModel ?? "").startsWith("minimaxai/")) {
			minimaxQuirks.transformStreamChunk?.(args);
		}
	},
};
