import type { IRDecisionsRequest } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { executeSystemOne } from "@executors/_shared/decisions/systemone";

function invalidRequest(args: ExecutorExecuteArgs, message: string): Promise<ExecutorResult> {
	return Promise.resolve({
		kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_decision_request", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	});
}

function invalidImage(part: unknown): boolean {
	if (!part || typeof part !== "object" || Array.isArray(part)) return false;
	const record = part as Record<string, unknown>;
	if (record.type !== "image_url") return false;
	const image = record.image_url;
	if (!image || typeof image !== "object" || Array.isArray(image)) return true;
	const url = (image as Record<string, unknown>).url;
	return typeof url !== "string" || !/^data:image\/(png|jpeg|webp);base64,(?=[A-Za-z0-9+/])(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/i.test(url);
}

export const executor: ProviderExecutor = args => {
	const ir = args.ir as IRDecisionsRequest;
	const parts = Array.isArray(ir.state) ? ir.state : [ir.state];
	if (parts.some(invalidImage)) {
		return invalidRequest(args, "Perplexity image state requires PNG, JPEG, or WebP base64 data URLs.");
	}
	for (const question of Object.values(ir.questions)) {
		const count = question.criteria ? Object.keys(question.criteria).length : 0;
		if ((question.type === "choice" && count > 255) || (question.type === "score" && count > 10)) {
			return invalidRequest(args, "Perplexity accepts at most 255 choice options or 10 score levels per question.");
		}
	}
	return executeSystemOne(args, "https://api.perplexity.ai/v1/decisions", "decider-27b");
};
