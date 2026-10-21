import type { IRDecisionsRequest } from "@core/ir";
import { BodyLimitExceededError, readStreamTextWithLimit } from "@core/bounded-stream";
import type { ProviderExecutor } from "@executors/types";
import { executeSystemOne } from "@executors/_shared/decisions/systemone";
import { openAICompatUrl } from "@providers/openai-compatible/config";

const models = new Set([
	"decision-models/baseten-elephant-9b-latest",
	"decision-models/baseten-mammoth-27b-latest",
]);

export const executor: ProviderExecutor = async args => {
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
		// Baseten counts Unicode code points, rather than UTF-16 code units.
		if (typeof ir.state === "string" && ir.state.length > 50_000) {
			let characters = 0;
			for (let index = 0; index < ir.state.length; index++) {
				if (ir.state.codePointAt(index)! > 0xffff) index++;
				if (++characters > 50_000) {
					message = "Baseten Decisions state must not exceed 50,000 characters.";
					break;
				}
			}
		}
		for (const question of Object.values(ir.questions)) {
			const count = question.criteria ? Object.keys(question.criteria).length : 0;
			if (question.type === "box" ||
				(question.type === "choice" && (count < 1 || count > 255)) ||
				(question.type === "score" && (count < 2 || count > 10))) {
				message = "Baseten Decisions supports predicates, 1–255 choices, or 2–10 score levels.";
			}
		}
	}
	if (message || !model) return {
		kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_decision_request", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	};
	// Baseten accepts Bearer authentication on System One as well as Api-Key.
	const result = await executeSystemOne(args, openAICompatUrl(args.providerId, "/systemone"), model);
	if (result.upstream.status !== 422) return result;

	// Structured state formatting and prompt tokenization are provider-owned.
	// Preserve known input-limit errors as client errors without guessing either.
	let responseBody: string;
	try {
		responseBody = await readStreamTextWithLimit(result.upstream.body, 64 * 1024);
	} catch (error) {
		if (!(error instanceof BodyLimitExceededError)) throw error;
		return { ...result, upstream: Response.json({ error: "invalid_decisions_response",
			message: "Baseten returned an oversized validation error.", request_id: args.requestId }, { status: 502 }) };
	}
	const restored = { ...result, upstream: new Response(responseBody, { status: 422, headers: result.upstream.headers }) };
	let payload: unknown;
	try { payload = JSON.parse(responseBody); } catch { return restored; }
	if (!payload || typeof payload !== "object") return restored;
	const validation = payload as { error?: unknown; error_type?: unknown };
	if (validation.error_type !== "Validation" || typeof validation.error !== "string" ||
		!(/^(?:State exceeds \d+ characters|OneJev prompt has \d+ tokens, exceeding max_len \d+; prompts are never truncated)$/.test(validation.error))) return restored;
	return { ...result, terminal: true, localClientError: true,
		upstream: Response.json({ error: "invalid_decision_request", message: validation.error,
			request_id: args.requestId }, { status: 400 }) };
};
