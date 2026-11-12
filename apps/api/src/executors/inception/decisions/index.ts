// Mercury Decide uses the typed-question contract, with text/JSON evidence only.
import type { IRDecisionsRequest } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { executeSystemOne } from "@executors/_shared/decisions/systemone";
import { openAICompatUrl } from "@providers/openai-compatible/config";

export const executor: ProviderExecutor = args => {
	const ir = args.ir as IRDecisionsRequest;
	const parts = Array.isArray(ir.state) ? ir.state : [ir.state];
	let message: string | undefined;
	const raw = ir.rawRequest;
	if (raw?.stream === true || raw?.tools != null || raw?.tool_choice != null ||
		raw?.safety_identifier != null || ir.decisionContext?.safety_identifier != null) {
		message = "Mercury Decide does not support streaming, tools, or safety_identifier.";
	}
	if (ir.images?.length || parts.some(part => part && typeof part === "object" && part.type === "image_url")) {
		message = "Mercury Decide accepts text and JSON evidence only.";
	}
	for (const question of Object.values(ir.questions)) {
		const count = question.criteria ? Object.keys(question.criteria).length : 0;
		if ((question.type === "choice" && count > 255) || (question.type === "score" && count > 10)) {
			message = "Mercury Decide accepts at most 255 choice options or 10 score levels per question.";
		}
	}
	if (message) return Promise.resolve({
		kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_decision_request", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	});
	return executeSystemOne(args, openAICompatUrl(args.providerId, "/decisions"), "mercury-decide");
};
