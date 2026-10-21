import type { IRDecisionsRequest } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { executeSystemOne } from "@executors/_shared/decisions/systemone";
import { openAICompatUrl } from "@providers/openai-compatible/config";

const models = new Set([
	"decision-models/baseten-elephant-9b-latest",
	"decision-models/baseten-mammoth-27b-latest",
]);

export const executor: ProviderExecutor = args => {
	const ir = args.ir as IRDecisionsRequest;
	const raw = ir.rawRequest;
	const model = args.providerModelSlug?.trim();
	const parts = Array.isArray(ir.state) ? ir.state : [ir.state];
	const generationControls = ["temperature", "top_p", "max_tokens", "max_output_tokens", "max_completion_tokens", "reasoning", "reasoning_effort"];
	let message: string | undefined;
	if (!model || !models.has(model)) {
		message = "Baseten Decisions requires a configured Elephant-1 or Mammoth-1 upstream model.";
	} else if (ir.images?.length || ir.audio?.length || ir.videos?.length ||
		parts.some(part => part && typeof part === "object" && part.type === "image_url") ||
		raw?.stream === true || raw?.tools != null || raw?.tool_choice != null ||
		raw?.safety_identifier != null || ir.decisionContext?.safety_identifier != null ||
		raw?.service_tier != null || generationControls.some(name => raw?.[name] != null) ||
		(ir.providerOptions && Object.keys(ir.providerOptions).length > 0)) {
		message = "Baseten Decisions accepts text and JSON evidence only; media, streaming, tools, safety_identifier, generation controls, and provider options are unsupported.";
	} else {
		for (const question of Object.values(ir.questions)) {
			const count = question.criteria ? Object.keys(question.criteria).length : 0;
			if (question.type === "box" ||
				(question.type === "choice" && (count < 1 || count > 255)) ||
				(question.type === "score" && (count < 2 || count > 10))) {
				message = "Baseten Decisions supports predicates, 1–255 choices, or 2–10 score levels.";
			}
		}
	}
	if (message || !model) return Promise.resolve({
		kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_decision_request", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	});
	// Baseten accepts Bearer authentication on System One as well as Api-Key.
	return executeSystemOne(args, openAICompatUrl(args.providerId, "/systemone"), model);
};
