import { resolveCapabilityFromEndpoint } from "@/lib/config/capabilityToEndpoints";
import {
	resolveBatchPricingModelCandidates,
	resolveBatchPricingProviderCandidates,
} from "@core/batch-model-aliases";
import { reserveWalletCredits } from "@core/wallet-reservations";
import { computeBill } from "@pipeline/pricing/engine";
import { loadPriceCard } from "@pipeline/pricing/loader";

export const BATCH_RESERVATION_PREFIX = "batch_hold:";
export const BATCH_RESERVATION_MARGIN_BPS = 1_000;

export type BatchReservationRequest = {
	body: unknown;
	endpoint?: string | null;
	method?: string | null;
};

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function endpointCapability(endpoint: string | null | undefined): string[] {
	const path = text(endpoint)?.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/v1(?=\/|$)/i, "") ?? "/responses";
	return [...new Set([resolveCapabilityFromEndpoint(path), "text.generate", "batch"])];
}

function normalizedEndpoint(endpoint: string | null | undefined): string {
	const path = text(endpoint)?.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/, 1)[0] ?? "/v1/responses";
	const normalized = `/${path.replace(/^\/+/, "").replace(/\/+$/, "")}`.toLowerCase();
	return normalized.startsWith("/v1/") ? normalized : `/v1${normalized}`;
}

const TEXT_BATCH_ENDPOINTS: Record<string, ReadonlySet<string>> = {
	openai: new Set(["/v1/responses", "/v1/chat/completions"]),
	"x-ai": new Set(["/v1/responses"]),
	anthropic: new Set(["/v1/messages"]),
	"google-ai-studio": new Set(["/v1/generatecontent"]),
	mistral: new Set(["/v1/chat/completions"]),
	together: new Set(["/v1/chat/completions"]),
	groq: new Set(["/v1/chat/completions"]),
};

const UNBOUNDED_BATCH_KEYS = new Set([
	"audio",
	"image",
	"image_url",
	"input_audio",
	"input_image",
	"input_video",
	"modalities",
	"tools",
	"video",
	"web_search_options",
]);

function containsUnboundedCostDimension(value: unknown): boolean {
	if (!value || typeof value !== "object") return false;
	if (Array.isArray(value)) return value.some(containsUnboundedCostDimension);
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		if (UNBOUNDED_BATCH_KEYS.has(key.toLowerCase())) return true;
		if (containsUnboundedCostDimension(entry)) return true;
	}
	return false;
}

function textLength(value: unknown): number {
	if (typeof value === "string") return value.length;
	if (typeof value === "number" || typeof value === "boolean") return String(value).length;
	if (!value) return 0;
	if (Array.isArray(value)) return value.reduce((sum, entry) => sum + textLength(entry), 0);
	if (typeof value !== "object") return 0;
	return Object.entries(value as Record<string, unknown>).reduce((sum, [key, entry]) => {
		if (key === "metadata") return sum;
		return sum + textLength(entry);
	}, 0);
}

export function estimateInputQuadTokens(body: Record<string, unknown>): number {
	const source = Array.isArray(body.messages)
		? body.messages
		: typeof body.input === "string" || Array.isArray(body.input)
			? body.input
			: Array.isArray(body.contents)
				? body.contents
				: typeof body.prompt === "string"
					? body.prompt
					: body;
	return Math.max(1, Math.ceil(textLength(source) / 4));
}

function validatePriceableTextRequest(providerId: string, request: BatchReservationRequest, body: Record<string, unknown>): void {
	if ((text(request.method) ?? "POST").toUpperCase() !== "POST") throw new Error("batch_method_not_supported");
	const allowed = TEXT_BATCH_ENDPOINTS[providerId];
	if (!allowed || !allowed.has(normalizedEndpoint(request.endpoint))) throw new Error("batch_endpoint_not_supported");
	if (containsUnboundedCostDimension(body)) throw new Error("batch_unbounded_cost_dimension_not_supported");
}

function maximumOutputTokens(body: Record<string, unknown>): number {
	const candidates = [
		body.max_output_tokens,
		body.max_tokens,
		(body.generationConfig as any)?.maxOutputTokens,
		(body.generation_config as any)?.max_output_tokens,
	];
	for (const value of candidates) {
		const parsed = Number(value);
		if (Number.isFinite(parsed) && parsed > 0 && parsed <= 1_000_000) return Math.ceil(parsed);
	}
	throw new Error("batch_max_output_tokens_required");
}

async function quotedRequestCost(providerId: string, request: BatchReservationRequest): Promise<number> {
	if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw new Error("invalid_batch_reservation_body");
	const body = request.body as Record<string, unknown>;
	validatePriceableTextRequest(providerId, request, body);
	const model = text(body.model);
	if (!model) throw new Error("missing_batch_reservation_model");
	let card: Awaited<ReturnType<typeof loadPriceCard>> | null = null;
	for (const capability of endpointCapability(request.endpoint)) {
		for (const pricingProvider of resolveBatchPricingProviderCandidates(providerId)) {
			for (const candidate of resolveBatchPricingModelCandidates(providerId, model)) {
				card = await loadPriceCard(pricingProvider, candidate, capability);
				if (card) break;
			}
			if (card) break;
		}
		if (card) break;
	}
	if (!card) throw new Error("batch_reservation_price_card_missing");
	const inputTokensUpperBound = estimateInputQuadTokens(body);
	const outputTokensUpperBound = maximumOutputTokens(body);
	const priced = computeBill({
		input_tokens: inputTokensUpperBound,
		output_tokens: outputTokensUpperBound,
		input_text_tokens: inputTokensUpperBound,
		output_text_tokens: outputTokensUpperBound,
		total_tokens: inputTokensUpperBound + outputTokensUpperBound,
	}, card, { pricing_plan: "batch", service_tier: "batch" }, "batch");
	const estimatedNanos = Math.max(0, Math.ceil(Number((priced as any)?.pricing?.total_nanos ?? 0) || 0));
	return Math.ceil((estimatedNanos * (10_000 + BATCH_RESERVATION_MARGIN_BPS)) / 10_000);
}

export async function reserveBatchCredits(args: {
	workspaceId: string;
	requestId: string;
	providerId: string;
	requests: BatchReservationRequest[];
}): Promise<{ reservationId: string; reservedNanos: number; status: string; held: boolean }> {
	if (args.requests.length === 0) throw new Error("batch_reservation_requests_required");
	if (args.requests.length > 10_000) throw new Error("batch_request_limit_exceeded");
	let reservedNanos = 0;
	for (const request of args.requests) reservedNanos += await quotedRequestCost(args.providerId, request);
	if (reservedNanos <= 0) throw new Error("batch_reservation_zero_cost");
	const reservationId = `${BATCH_RESERVATION_PREFIX}${args.requestId}`;
	const result = await reserveWalletCredits({
		workspaceId: args.workspaceId,
		reservationId,
		amountNanos: reservedNanos,
		holdRefId: args.requestId,
	});
	return {
		reservationId,
		reservedNanos,
		status: result.status,
		held: result.status === "held" && (result.applied || result.alreadyApplied),
	};
}
