import type { IRDecisionsRequest } from "@core/ir";
import type { ProviderExecutor } from "@executors/types";
import { executeSystemOne } from "@executors/_shared/decisions/systemone";

export const executor: ProviderExecutor = args => {
	const ir = args.ir as IRDecisionsRequest;
	for (const question of Object.values(ir.questions)) {
		const count = question.criteria ? Object.keys(question.criteria).length : 0;
		if ((question.type === "choice" && count > 255) || (question.type === "score" && count > 10)) {
			return Promise.resolve({
				kind: "completed",
				terminal: true,
				localClientError: true,
				upstream: Response.json({
					error: "unsupported_decision_request",
					message: "Perplexity accepts at most 255 choice options or 10 score levels per question.",
					request_id: args.requestId,
				}, { status: 400 }),
				bill: { cost_cents: 0, currency: "USD" },
			});
		}
	}
	return executeSystemOne(args, "https://api.perplexity.ai/v1/decisions", "decider-27b");
};
