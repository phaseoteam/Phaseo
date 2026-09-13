// Playground-only Live protocol and billing. Rates are snapshotted at session creation.
// https://developers.openai.com/api/docs/models/gpt-live-1
import { computeBill } from "@pipeline/pricing/engine";
import { matchesConditions } from "@pipeline/pricing/conditions";
import { loadPriceCard } from "@pipeline/pricing/loader";
import type { PriceCard } from "@pipeline/pricing/types";
import type { ProviderCandidate } from "@pipeline/before/types";
import { liveBackendSettingsSchema, type LiveBackendSettings } from "./live-settings";
export { LIVE_VOICES, LIVE_MAX_OUTPUT_TOKENS } from "./live-settings";

export const LIVE_MODEL = "openai/gpt-live-1";
export const LIVE_BACKENDS = ["openai/gpt-5.6-luna", "openai/gpt-5.6-terra"] as const;
export const LIVE_PRICE_CARD: PriceCard = {
	provider: "openai", model: LIVE_MODEL, endpoint: "audio.live", currency: "USD",
	effective_from: null, effective_to: null, version: "openai-live-2026-09-10",
	rules: [{ pricing_plan: "standard", meter: "audio_seconds", unit: "minute",
		unit_size: 60, price_per_unit: "0.05", currency: "USD", match: [], priority: 1 }],
};

export const LIVE_SEARCH_PRICE_CARD: PriceCard = { ...LIVE_PRICE_CARD, model: "web_search", endpoint: "text.generate",
	version: "openai-web-search-2026-09-10", rules: [{ pricing_plan: "standard", meter: "native_web_search_requests",
		unit: "request", unit_size: 1, price_per_unit: "0.01", currency: "USD", match: [], priority: 1 }] };
export type LiveConfig = { backendModel: string; voiceCard: PriceCard; backendCard: PriceCard;
	settings?: LiveBackendSettings; searchCard?: PriceCard };
export type LiveResponseUsage = { id: string; status: string; usage: Record<string, unknown>;
	delegation_id?: string; model?: string; service_tier?: string; provider_usage?: Record<string, unknown> };
type LiveToolCall = { id: string; response_id: string; delegation_id: string; done: boolean; status?: string };
export type LiveUsage = {
	live_started?: boolean;
	live_final?: boolean;
	live_seconds?: number;
	live_responses?: LiveResponseUsage[];
	live_pending_responses?: string[];
	live_billing_error?: string;
	live_delegations?: Record<string, string>;
	live_tool_calls?: LiveToolCall[];
};

export function isLiveModel(model: string | undefined | null): boolean {
	return model === LIVE_MODEL || model === "gpt-live-1";
}

// Live has its own model and data policy; never inherit a backend's allowlist or ZDR eligibility.
export function livePolicyCandidates(candidates: ProviderCandidate[]): ProviderCandidate[] {
	return candidates.filter((candidate) => candidate.providerId === "openai").map((candidate) => ({
		...candidate, apiModelId: LIVE_MODEL, providerModelSlug: "gpt-live-1", pricingCard: LIVE_PRICE_CARD,
		zeroDataRetention: false, dataPolicyTier: "unknown", dataPolicyConfidence: "unknown",
		promptTrainingPolicy: "unknown", effectiveDataPolicy: undefined,
	}));
}

export async function createLiveConfig(backendModel: string, requestedSettings?: unknown): Promise<LiveConfig> {
	if (!LIVE_BACKENDS.includes(backendModel as typeof LIVE_BACKENDS[number])) throw new Error("live_backend_not_supported");
	const settings = liveBackendSettingsSchema.parse(requestedSettings ?? {});
	const backendCard = await loadPriceCard("openai", backendModel, "text.generate");
	// Include default prices for a provider's documented tier fallback, but never
	// substitute standard prices for a requested tier that has no price card.
	for (const plan of new Set(["standard", settings.service_tier === "default" ? "standard" : settings.service_tier])) {
		if (!backendCard || !["input_text_tokens", "output_text_tokens", "cached_read_text_tokens", "cached_write_text_tokens"].every(
			(meter) => backendCard.rules.some((rule) => rule.meter === meter && rule.pricing_plan === plan),
		)) throw new Error("live_backend_price_card_missing");
	}
	return { backendModel, voiceCard: LIVE_PRICE_CARD, backendCard: backendCard!, settings, searchCard: LIVE_SEARCH_PRICE_CARD };
}

export function liveConfig(metadata: Record<string, unknown> | null | undefined): LiveConfig {
	const config = metadata?.live as LiveConfig | undefined;
	if (!config?.voiceCard?.rules?.length || !config.backendCard?.rules?.length || !config.backendModel) {
		throw new Error("live_price_snapshot_missing");
	}
	return config;
}

export function liveStartEvent(config: LiveConfig, voice: string, instructions?: string) {
	const settings = liveBackendSettingsSchema.parse(config.settings ?? {});
	return { type: "session.start", session: {
		model: "gpt-live-1", instructions, store: false,
		audio: { format: { type: "audio/pcm", rate: 24000 }, output: { voice } },
		delegation: { type: "responses", responses: {
			model: config.backendModel.replace(/^openai\//, ""),
			instructions: settings.instructions,
			service_tier: settings.service_tier, max_output_tokens: settings.max_output_tokens,
			tools: settings.web_search ? [{ type: "web_search" }] : [],
			tool_choice: settings.tool_choice, parallel_tool_calls: settings.parallel_tool_calls,
			...(settings.reasoning_effort || settings.reasoning_summary ? { reasoning: {
				...(settings.reasoning_effort ? { effort: settings.reasoning_effort } : {}),
				...(settings.reasoning_summary ? { summary: settings.reasoning_summary } : {}),
			} } : {}),
			...(settings.verbosity ? { text: { verbosity: settings.verbosity } } : {}),
		} },
	} };
}

function finite(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// Return a new snapshot so usage and response IDs can be checkpointed atomically.
export function ingestLiveUsage(current: LiveUsage, event: Record<string, any>): LiveUsage {
	const next = { ...current };
	if (event.type === "session.started") next.live_started = true;
	if (event.type === "session.usage.updated" || event.type === "session.closed") {
		if (!finite(event.usage?.seconds)) throw new Error("live_authoritative_usage_invalid");
		if (event.usage.seconds < (current.live_seconds ?? 0)) throw new Error("live_authoritative_usage_regressed");
		next.live_seconds = event.usage.seconds;
		if (event.type === "session.closed") next.live_final = true;
	}
	const responses = current.live_responses ?? [];
	const pending = new Set(current.live_pending_responses ?? []);
	const nested = event.type === "response.event" ? event.event : null;
	const response = nested?.response;
	const delegationId = event.type === "session.delegation.created" ? event.delegation?.id : event.delegation_id;
	const id = event.type === "session.delegation.created" ? event.delegation?.response_id : response?.id ?? nested?.response_id;
	if (event.type === "session.delegation.created" && (event.delegation?.target !== "responses" || typeof id !== "string" || !id)) {
		throw new Error("live_delegation_response_missing");
	}
	if (typeof id === "string" && typeof delegationId === "string") {
		if (Object.keys(current.live_delegations ?? {}).length >= 1024 && !current.live_delegations?.[delegationId]) throw new Error("live_delegation_limit_exceeded");
		next.live_delegations = { ...current.live_delegations, [delegationId]: id };
	}
	if (typeof id === "string" && !responses.some((item) => item.id === id)) pending.add(id);
	if (pending.size > 1024) throw new Error("live_response_limit_exceeded");
	// Lifecycle snapshots intentionally have output: []. Count native tools from
	// granular items instead, preserving their identity across replay/restarts.
	if (["response.output_item.added", "response.output_item.done"].includes(nested?.type)) {
		const item = nested.item;
		if (typeof item?.type === "string" && item.type.endsWith("_call") && item.type !== "web_search_call") throw new Error("live_tool_not_supported");
		if (item?.type === "web_search_call") {
			const responseId = id ?? next.live_delegations?.[delegationId];
			if (typeof item.id !== "string" || !item.id || typeof responseId !== "string" || typeof delegationId !== "string") throw new Error("live_tool_identity_missing");
			const calls = current.live_tool_calls ?? [];
			const previous = calls.find((call) => call.id === item.id);
			if (previous && previous.response_id !== responseId) throw new Error("live_tool_identity_conflict");
			if (!previous && calls.length >= 1024) throw new Error("live_tool_limit_exceeded");
			next.live_tool_calls = [...calls.filter((call) => call.id !== item.id), {
				id: item.id, response_id: responseId, delegation_id: delegationId,
				done: previous?.done === true || nested.type === "response.output_item.done",
				status: previous?.done ? previous.status : item.status,
			}];
		}
	}
	if (nested?.type === "error") throw new Error("live_backend_error");
	if (nested && ["response.completed", "response.incomplete", "response.failed", "response.cancelled"].includes(nested.type)) {
		if (typeof id !== "string" || !id) throw new Error("live_response_id_missing");
		const previous = responses.find((item) => item.id === id);
		if (previous && (response?.usage?.input_tokens !== previous.usage.input_tokens || response?.usage?.output_tokens !== previous.usage.output_tokens
			|| response?.usage?.input_tokens_details?.cached_tokens !== previous.usage.cached_read_text_tokens
			|| (response?.usage?.input_tokens_details?.cache_write_tokens ?? 0) !== previous.usage.cached_write_text_tokens
			|| response?.service_tier !== previous.service_tier || response?.model !== previous.model)) throw new Error("live_response_usage_conflict");
		if (!responses.some((item) => item.id === id)) {
			const raw = response?.usage;
			const cacheWrite = raw?.input_tokens_details?.cache_write_tokens ?? 0;
			if (!finite(raw?.input_tokens) || !finite(raw?.output_tokens) || !finite(raw?.input_tokens_details?.cached_tokens)
				|| !finite(cacheWrite) || raw.input_tokens_details.cached_tokens + cacheWrite > raw.input_tokens) throw new Error("live_response_authoritative_usage_missing");
			const reasoning = raw.output_tokens_details?.reasoning_tokens ?? 0;
			if (![raw.input_tokens, raw.output_tokens, raw.input_tokens_details.cached_tokens, cacheWrite, reasoning].every(Number.isSafeInteger)
				|| !finite(reasoning) || reasoning > raw.output_tokens) throw new Error("live_response_authoritative_usage_invalid");
			if (raw.total_tokens != null && raw.total_tokens !== raw.input_tokens + raw.output_tokens) throw new Error("live_response_authoritative_usage_invalid");
			if (JSON.stringify(raw).length > 16384) throw new Error("live_response_usage_limit_exceeded");
			// Reasoning tokens are included in output_tokens, and cache reads in input_tokens.
			const usage = { input_text_tokens: raw.input_tokens - raw.input_tokens_details.cached_tokens - cacheWrite,
				cached_read_text_tokens: raw.input_tokens_details.cached_tokens, output_text_tokens: raw.output_tokens,
				cached_write_text_tokens: cacheWrite,
				input_tokens: raw.input_tokens, output_tokens: raw.output_tokens, output_reasoning_tokens: reasoning };
			if (responses.length >= 1024) throw new Error("live_response_limit_exceeded");
			next.live_responses = [...responses, { id, status: nested.type, usage,
				delegation_id: typeof delegationId === "string" ? delegationId : undefined,
				model: response.model, service_tier: response.service_tier, provider_usage: structuredClone(raw) }];
		}
		pending.delete(id);
	}
	next.live_pending_responses = [...pending];
	return next;
}

export function assertLiveFinalUsage(usage: LiveUsage) {
	if (usage.live_billing_error) throw new Error("live_authoritative_usage_invalid");
	if (usage.live_started && (!usage.live_final || !finite(usage.live_seconds))) throw new Error("live_authoritative_usage_pending");
	if (usage.live_pending_responses?.length) throw new Error("live_response_authoritative_usage_pending");
	if (usage.live_tool_calls?.some((call) => !call.done)) throw new Error("live_tool_authoritative_usage_pending");
}

export function liveUsageMeters(usage: LiveUsage): Record<string, number> {
	const totals: Record<string, number> = { audio_seconds: usage.live_seconds ?? 0 };
	for (const response of usage.live_responses ?? []) {
		for (const meter of ["input_text_tokens", "cached_read_text_tokens", "cached_write_text_tokens", "output_text_tokens", "input_tokens", "output_tokens", "output_reasoning_tokens"]) {
			totals[meter] = (totals[meter] ?? 0) + Number(response.usage[meter] ?? 0);
		}
	}
	totals.native_web_search_requests = usage.live_tool_calls?.length ?? 0;
	return totals;
}

export function priceLiveUsage(usage: LiveUsage, config: LiveConfig): Record<string, unknown> {
	const price = (meters: Record<string, unknown>, card: PriceCard, tier = "default") => {
		const plan = tier === "default" ? "standard" : tier;
		// Filtering prevents the shared engine's cross-tier fallback. Unknown tier
		// or missing conditional pricing must retain the hold, never undercharge.
		const tierCard = { ...card, rules: card.rules.filter((rule) => rule.pricing_plan === plan)
			.map((rule) => ({ ...rule, pricing_plan: "standard" })) };
		if (Number(meters.native_web_search_requests ?? 0) > 0 && !tierCard.rules.some((rule) => rule.meter === "native_web_search_requests"
			&& matchesConditions(rule.match, { ...meters, endpoint: card.endpoint, service_tier: tier }))) throw new Error("live_search_price_snapshot_missing");
		const result = computeBill(meters, tierCard, { endpoint: card.endpoint, service_tier: tier }, "standard");
		const pricing = result.pricing as { total_nanos: number; lines: Record<string, unknown>[] };
		for (const meter of ["audio_seconds", "input_text_tokens", "cached_read_text_tokens", "cached_write_text_tokens", "output_text_tokens", "native_web_search_requests"]) {
			if (Number(meters[meter] ?? 0) > 0 && !pricing.lines.some((line) => line.dimension === meter)) {
				throw new Error(`live_pricing_rule_missing:${meter}`);
			}
		}
		return pricing;
	};
	const voice = price({ audio_seconds: usage.live_seconds ?? 0 }, config.voiceCard);
	let backendNanos = 0;
	const lines = voice.lines.map((line) => ({ ...line, model: LIVE_MODEL, component: "voice" }));
	for (const response of usage.live_responses ?? []) {
		if (response.model && response.model.replace(/^openai\//, "") !== config.backendModel.replace(/^openai\//, "")) throw new Error("live_response_model_mismatch");
		const tier = response.service_tier ?? config.settings?.service_tier ?? "default";
		if (!["default", "flex", "priority"].includes(tier)) throw new Error("live_response_service_tier_unknown");
		// Reasoning is retained for reporting, not passed as an additional meter.
		const { output_reasoning_tokens: _reasoning, ...billable } = response.usage;
		const priced = price(billable, config.backendCard, tier);
		backendNanos += priced.total_nanos;
		lines.push(...priced.lines.map((line) => ({ ...line, model: config.backendModel, component: "backend", response_id: response.id,
			delegation_id: response.delegation_id, service_tier: tier })));
	}
	let toolNanos = 0;
	for (const call of usage.live_tool_calls ?? []) {
		if (!config.settings?.web_search || !config.searchCard?.rules.length) throw new Error("live_search_price_snapshot_missing");
		const priced = price({ native_web_search_requests: 1 }, config.searchCard);
		toolNanos += priced.total_nanos;
		lines.push(...priced.lines.map((line) => ({ ...line, model: config.backendModel, component: "tool", tool: "web_search",
			response_id: call.response_id, delegation_id: call.delegation_id, tool_call_id: call.id })));
	}
	return { ...usage, live_voice_nanos: voice.total_nanos, live_backend_nanos: backendNanos, live_tool_nanos: toolNanos,
		pricing: { total_nanos: voice.total_nanos + backendNanos + toolNanos, lines } };
}
