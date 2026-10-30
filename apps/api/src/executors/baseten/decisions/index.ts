import type { IRDecisionsRequest } from "@core/ir";
import { BodyLimitExceededError, readStreamTextWithLimit } from "@core/bounded-stream";
import type { ExecutorExecuteArgs, ProviderExecutor } from "@executors/types";
import { executeSystemOne } from "@executors/_shared/decisions/systemone";
import { openAICompatUrl } from "@providers/openai-compatible/config";

const models = new Set([
	"decision-models/baseten-elephant-9b-latest",
	"decision-models/baseten-mammoth-27b-latest",
	"decision-models/baseten-joey-2b-latest",
]);
const imageUrl = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;
// Baseten fetches HTTPS images itself, but only from S3, Cloud Storage, and Azure Blob Storage.
const imageHosts = /(^|\.)(s3([.-][a-z0-9-]+)*\.amazonaws\.com|storage\.googleapis\.com|blob\.core\.windows\.net)$/;

function hostedImage(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:" && parsed.port === "" && imageHosts.test(parsed.hostname);
	} catch {
		return false;
	}
}

// Baseten reads images only from user message parts under state.messages
// (https://docs.baseten.co/reference/inference-api/system-one#image-inputs).
function imageState(ir: IRDecisionsRequest): { messages: unknown[] } | string {
	const urls = (ir.images ?? []).map(image => typeof image === "string" ? image : `data:${image.content_type};base64,${image.base64}`);
	if (urls.length > 16) return "Baseten Decisions accepts at most 16 images.";
	if (urls.some(url => !imageUrl.test(url) && !hostedImage(url))) {
		return "Baseten Decisions images must be PNG, JPEG, or WebP base64 data URLs, or HTTPS URLs on Amazon S3, Google Cloud Storage, or Azure Blob Storage.";
	}
	const input = ir.decisionContext?.input;
	if (input && typeof input !== "string") {
		const parts = input.flatMap(message => typeof message.content === "string" ? [] : message.content);
		if (parts.some(part => part.type === "input_image" && part.detail != null && part.detail !== "auto")) {
			return "Baseten Decisions supports only the auto image detail.";
		}
		return { messages: input.map(message => ({ role: "user", content: typeof message.content === "string"
			? message.content : message.content.map(part => part.type === "input_text"
				? { type: "text", text: part.text }
				: { type: "image_url", image_url: { url: (part as { image_url: string }).image_url } }) })) };
	}
	if (ir.state && typeof ir.state === "object" && "messages" in ir.state) {
		return "Baseten Decisions cannot combine images with a state.messages conversation; put the images in the messages.";
	}
	return { messages: [{ role: "user", content: [
		{ type: "text", text: typeof ir.state === "string" ? ir.state : JSON.stringify(ir.state) },
		...urls.map(url => ({ type: "image_url", image_url: { url } })),
	] }] };
}

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRDecisionsRequest;
	const raw = ir.rawRequest;
	const model = args.providerModelSlug?.trim();
	const parts = Array.isArray(ir.state) ? ir.state : [ir.state];
	const generationControls = ["temperature", "top_p", "max_tokens", "max_output_tokens", "max_completion_tokens", "reasoning", "reasoning_effort"];
	let message: string | undefined;
	let state = ir.state;
	if (!model || !models.has(model)) {
		message = "Baseten Decisions requires a configured Elephant-1, Mammoth-1, or Joey-1 upstream model.";
	} else if (ir.audio?.length || ir.videos?.length ||
		parts.some(part => part && typeof part === "object" && part.type === "image_url") ||
		raw?.stream === true || raw?.tools != null || raw?.tool_choice != null ||
		raw?.safety_identifier != null || ir.decisionContext?.safety_identifier != null ||
		raw?.service_tier != null || generationControls.some(name => raw?.[name] != null) ||
		(ir.providerOptions && Object.keys(ir.providerOptions).length > 0)) {
		message = "Baseten Decisions accepts text, JSON evidence, and inline images only; audio, video, streaming, tools, safety_identifier, generation controls, and provider options are unsupported.";
	} else if (ir.images?.length) {
		const result = imageState(ir);
		if (typeof result === "string") message = result;
		else state = result;
	}
	if (!message) {
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
	const upstreamArgs: ExecutorExecuteArgs = state === ir.state ? args : { ...args, ir: { ...ir, state } };
	// Baseten accepts Bearer authentication on System One as well as Api-Key.
	const result = await executeSystemOne(upstreamArgs, openAICompatUrl(args.providerId, "/systemone"), model);
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
		rawResponse: { upstream_status: 422, body: payload },
		upstream: Response.json({ error: "invalid_decision_request", message: validation.error,
			request_id: args.requestId }, { status: 400 }) };
};
