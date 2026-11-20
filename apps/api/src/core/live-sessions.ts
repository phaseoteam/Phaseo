// GPT Live protocol and billing for playground and API sessions. Rates are snapshotted at session creation.
// https://developers.openai.com/api/docs/models/gpt-live-1
// https://developers.openai.com/api/docs/guides/voice-latency-cost?api=live#voice-session-costs
import { computeBill } from "@pipeline/pricing/engine";
import { matchesConditions } from "@pipeline/pricing/conditions";
import { loadPriceCard } from "@pipeline/pricing/loader";
import type { PriceCard } from "@pipeline/pricing/types";
import type { ProviderCandidate } from "@pipeline/before/types";
import { liveBackendSettingsSchema, type LiveBackendSettings } from "./live-settings";
export { LIVE_VOICES, LIVE_MAX_OUTPUT_TOKENS } from "./live-settings";

export const LIVE_MODEL = "openai/gpt-live-1";
export const LIVE_MODELS = [LIVE_MODEL, "openai/gpt-live-1.1"] as const;
export type LiveModel = typeof LIVE_MODELS[number];
export const LIVE_BACKENDS = ["openai/gpt-5.6-luna", "openai/gpt-5.6-terra"] as const;

export const LIVE_SEARCH_PRICE_CARD: PriceCard = { provider: "openai", model: "web_search", endpoint: "text.generate",
	currency: "USD", effective_from: null, effective_to: null, version: "openai-web-search-2026-09-10", rules: [{ pricing_plan: "standard", meter: "native_web_search_requests",
		unit: "request", unit_size: 1, price_per_unit: "0.01", currency: "USD", match: [], priority: 1 }] };
// voiceCard is the Live model's audio.realtime card from the catalogue. Sessions created before
// that hold a fixed card on the audio_seconds meter (unit_size 60), and still settle on it.
export type LiveConfig = { backendModel: string; voiceCard: PriceCard; backendCard: PriceCard;
	settings?: LiveBackendSettings; searchCard?: PriceCard };
export type LiveResponseUsage = { id: string; status: string; usage: Record<string, unknown>;
	delegation_id?: string; model?: string; service_tier?: string; provider_usage?: Record<string, unknown> };
type LiveToolCall = { id: string; response_id: string; delegation_id: string; done: boolean; status?: string };
export type LiveUsage = {
	live_started?: boolean;
	live_final?: boolean;
	live_seconds?: number;
	// OpenAI's split of live_seconds into active and paused (standby) time. Paused time only
	// accrues on WebRTC sessions with a wake policy. Absent when an event doesn't carry a
	// consistent split; then all of live_seconds is billed as active.
	live_active_seconds?: number;
	live_paused_seconds?: number;
	// Why the latest split was ignored, for billing review.
	live_usage_split_ignored?: string;
	live_responses?: LiveResponseUsage[];
	live_pending_responses?: string[];
	live_billing_error?: string;
	// WebRTC: the longest sideband gap past OpenAI's 3 s replay. Events in it (a whole delegated
	// response) may never have been seen, so the usage is never complete, only a lower bound.
	live_sideband_gap_ms?: number;
	live_delegations?: Record<string, string>;
	live_tool_calls?: LiveToolCall[];
	// Client-executed function calls the backend made; only these may receive an output.
	live_function_call_ids?: string[];
};

/** The canonical Live model for an ID given with or without the openai/ prefix. */
export function liveModelId(model: string | undefined | null): LiveModel | null {
	const trimmed = model?.trim();
	if (!trimmed) return null;
	const canonical = trimmed.startsWith("openai/") ? trimmed : `openai/${trimmed}`;
	return (LIVE_MODELS as readonly string[]).includes(canonical) ? canonical as LiveModel : null;
}

export function isLiveModel(model: string | undefined | null): boolean {
	return liveModelId(model) !== null;
}

// Live has its own model and data policy; never inherit a backend's allowlist or ZDR eligibility.
export function livePolicyCandidates(candidates: ProviderCandidate[], model: string = LIVE_MODEL): ProviderCandidate[] {
	const liveModel = liveModelId(model) ?? LIVE_MODEL;
	return candidates.filter((candidate) => candidate.providerId === "openai").map((candidate) => ({
		...candidate, apiModelId: liveModel, providerModelSlug: liveModel.replace(/^openai\//, ""), pricingCard: null,
		zeroDataRetention: false, dataPolicyTier: "unknown", dataPolicyConfidence: "unknown",
		promptTrainingPolicy: "unknown", effectiveDataPolicy: undefined,
	}));
}

export async function createLiveConfig(liveModel: string, backendModel: string, requestedSettings?: unknown): Promise<LiveConfig> {
	const model = liveModelId(liveModel);
	if (!model) throw new Error("live_model_not_supported");
	if (!LIVE_BACKENDS.includes(backendModel as typeof LIVE_BACKENDS[number])) throw new Error("live_backend_not_supported");
	const settings = liveBackendSettingsSchema.parse(requestedSettings ?? {});
	// Only active time is required up front: without a standby price, paused time is billed as active.
	const voiceCard = await loadPriceCard("openai", model, "audio.realtime");
	if (!voiceCard?.rules.some((rule) => rule.meter === "audio_minutes" && rule.pricing_plan === "standard")) {
		throw new Error("live_price_card_missing");
	}
	const backendCard = await loadPriceCard("openai", backendModel, "text.generate");
	// Include default prices for a provider's documented tier fallback, but never
	// substitute standard prices for a requested tier that has no price card.
	for (const plan of new Set(["standard", settings.service_tier === "default" ? "standard" : settings.service_tier])) {
		if (!backendCard || !["input_text_tokens", "output_text_tokens", "cached_read_text_tokens", "cached_write_text_tokens_30m"].every(
			(meter) => backendCard.rules.some((rule) => rule.meter === meter && rule.pricing_plan === plan),
		)) throw new Error("live_backend_price_card_missing");
	}
	return { backendModel, voiceCard, backendCard: backendCard!, settings, searchCard: LIVE_SEARCH_PRICE_CARD };
}

export function liveConfig(metadata: Record<string, unknown> | null | undefined): LiveConfig {
	const config = metadata?.live as LiveConfig | undefined;
	if (!config?.voiceCard?.rules?.length || !config.backendCard?.rules?.length || !config.backendModel) {
		throw new Error("live_price_snapshot_missing");
	}
	return config;
}

export function liveStartEvent(config: LiveConfig, voice: string, instructions?: string, model: string = LIVE_MODEL) {
	const settings = liveBackendSettingsSchema.parse(config.settings ?? {});
	const liveModel = liveModelId(model);
	if (!liveModel) throw new Error("live_model_not_supported");
	return { type: "session.start", session: {
		model: liveModel.replace(/^openai\//, ""), instructions, store: false,
		audio: { format: { type: "audio/pcm", rate: 24000 }, output: { voice } },
		delegation: { type: "responses", responses: {
			model: config.backendModel.replace(/^openai\//, ""),
			instructions: settings.instructions,
			service_tier: settings.service_tier, max_output_tokens: settings.max_output_tokens,
			tools: [...(settings.web_search ? [{ type: "web_search" }] : []), ...settings.tools],
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

// OpenAI reports whole seconds, so allow for rounding between the split and the total.
const LIVE_SPLIT_TOLERANCE_SECONDS = 1;

// Return a new snapshot so usage and response IDs can be checkpointed atomically.
export function ingestLiveUsage(current: LiveUsage, event: Record<string, any>): LiveUsage {
	const next = { ...current };
	if (event.type === "session.started") next.live_started = true;
	if (event.type === "session.usage.updated" || event.type === "session.closed") {
		if (!finite(event.usage?.seconds)) throw new Error("live_authoritative_usage_invalid");
		if (event.usage.seconds < (current.live_seconds ?? 0)) throw new Error("live_authoritative_usage_regressed");
		next.live_seconds = event.usage.seconds;
		// The split is not monotonic (active_seconds can drop between updates, as OpenAI credits
		// back initialization time), so the latest event wins; session.closed is final.
		delete next.live_active_seconds; delete next.live_paused_seconds; delete next.live_usage_split_ignored;
		const { active_seconds: active, paused_seconds: paused } = event.usage;
		if (finite(active) && finite(paused)) {
			if (Math.abs(active + paused - event.usage.seconds) <= LIVE_SPLIT_TOLERANCE_SECONDS) {
				next.live_active_seconds = active;
				next.live_paused_seconds = paused;
			} else next.live_usage_split_ignored = `active ${active} + paused ${paused} != seconds ${event.usage.seconds}`;
		} else if (active != null || paused != null) next.live_usage_split_ignored = "incomplete split";
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
		// Function calls are run by the client and cost only the backend tokens
		// already counted on the response; other tool types are never configured.
		if (typeof item?.type === "string" && item.type.endsWith("_call") && item.type !== "web_search_call"
			&& item.type !== "function_call") throw new Error("live_tool_not_supported");
		if (item?.type === "function_call" && nested.type === "response.output_item.done" && typeof item.call_id === "string" && item.call_id) {
			const calls = current.live_function_call_ids ?? [];
			if (!calls.includes(item.call_id)) {
				if (calls.length >= 1024) throw new Error("live_tool_limit_exceeded");
				next.live_function_call_ids = [...calls, item.call_id];
			}
		}
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
			|| JSON.stringify(cacheWritesByLifetime(response?.usage?.input_tokens_details))
				!== JSON.stringify([Number(previous.usage.cached_write_text_tokens_30m ?? 0), Number(previous.usage.cached_write_text_tokens_12h ?? 0)])
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
			const [write30m, write12h] = cacheWritesByLifetime(raw.input_tokens_details);
			if (![write30m, write12h].every((value) => Number.isSafeInteger(value) && value >= 0) || write30m + write12h !== cacheWrite) {
				throw new Error("live_response_authoritative_usage_invalid");
			}
			// Reasoning tokens are included in output_tokens, and cache reads in input_tokens.
			const usage = { input_text_tokens: raw.input_tokens - raw.input_tokens_details.cached_tokens - cacheWrite,
				cached_read_text_tokens: raw.input_tokens_details.cached_tokens, output_text_tokens: raw.output_tokens,
				cached_write_text_tokens_30m: write30m, ...(write12h ? { cached_write_text_tokens_12h: write12h } : {}),
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

// OpenAI prices cache writes by lifetime. Live can't ask for the 12-hour cache, so writes
// without a breakdown are the default 30-minute writes.
function cacheWritesByLifetime(details: { cache_write_tokens?: number; cache_write_tokens_details?: { ttl_30m_tokens?: number; ttl_12h_tokens?: number } } | undefined): [number, number] {
	const write12h = details?.cache_write_tokens_details?.ttl_12h_tokens ?? 0;
	return [details?.cache_write_tokens_details?.ttl_30m_tokens ?? (details?.cache_write_tokens ?? 0) - write12h, write12h];
}

export function assertLiveFinalUsage(usage: LiveUsage) {
	if (usage.live_billing_error) throw new Error("live_authoritative_usage_invalid");
	if (usage.live_started && (!usage.live_final || !finite(usage.live_seconds))) throw new Error("live_authoritative_usage_pending");
	if (usage.live_pending_responses?.length) throw new Error("live_response_authoritative_usage_pending");
	if (usage.live_tool_calls?.some((call) => !call.done)) throw new Error("live_tool_authoritative_usage_pending");
	// Checked last: a drain for pending work still runs first. No later event can fill the gap.
	if (typeof usage.live_sideband_gap_ms === "number" && usage.live_sideband_gap_ms > 0) throw new Error("live_sideband_continuity_gap");
}

// Reported usage, matching what priceLiveUsage bills with the session's voice card: without a
// standard standby price, paused time is reported inside the active meter. Without a card, the
// split is reported as OpenAI gave it. The raw split stays in the live_* fields.
export function liveUsageMeters(usage: LiveUsage, voiceCard?: PriceCard | null): Record<string, number> {
	const { active, standby } = liveBilledSeconds(usage, voiceCard ? hasStandbyPrice(voiceCard) : true);
	const totals: Record<string, number> = { audio_seconds: active, audio_minutes: active / 60,
		...(standby ? { standby_audio_minutes: standby / 60 } : {}) };
	for (const response of usage.live_responses ?? []) {
		for (const meter of ["input_text_tokens", "cached_read_text_tokens", "cached_write_text_tokens_30m", "cached_write_text_tokens_12h", "output_text_tokens", "input_tokens", "output_tokens", "output_reasoning_tokens"]) {
			totals[meter] = (totals[meter] ?? 0) + Number(response.usage[meter] ?? 0);
		}
	}
	totals.native_web_search_requests = usage.live_tool_calls?.length ?? 0;
	return totals;
}

// Stored usage with its voice meters rebuilt from the live_* fields. A standby meter from an
// earlier rebuild is dropped first, so it can't survive on a card that bills paused time as active.
export function withLiveUsageMeters<T extends Record<string, unknown>>(usage: T, voiceCard?: PriceCard | null): Omit<T, "standby_audio_minutes"> & Record<string, number> {
	const { standby_audio_minutes: _stale, ...rest } = usage;
	return { ...rest, ...liveUsageMeters(usage as LiveUsage, voiceCard) };
}

// Active and paused seconds. The split never bills more than OpenAI's total, and without a
// usable split all of the total is active.
function liveSecondsSplit(usage: LiveUsage): { active: number; paused: number } {
	const seconds = usage.live_seconds ?? 0;
	if (!finite(usage.live_active_seconds) || !finite(usage.live_paused_seconds)) return { active: seconds, paused: 0 };
	const active = Math.min(usage.live_active_seconds, seconds);
	return { active, paused: Math.min(usage.live_paused_seconds, seconds - active) };
}

// Seconds as unrounded minutes, as for other per-minute realtime meters. A card without a
// standby price (including snapshots taken before Live was priced from the catalogue, on
// audio_seconds) bills paused time at the active rate: never free, never a failed settlement.
function liveVoiceMeters(usage: LiveUsage, card: PriceCard): Record<string, number> {
	const hasStandby = hasStandbyPrice(card);
	const { active, standby: paused } = liveBilledSeconds(usage, hasStandby);
	const standby = hasStandby ? { standby_audio_minutes: paused / 60 } : {};
	// price() keeps only standard-plan rules, so pick the active meter from those.
	if (card.rules.some((rule) => rule.meter === "audio_seconds" && rule.pricing_plan === "standard")) return { audio_seconds: active, ...standby };
	return { audio_minutes: active / 60, ...standby };
}

// Only the standard plan is priced for voice, so only its standby rule counts.
function hasStandbyPrice(card: PriceCard): boolean {
	return card.rules.some((rule) => rule.meter === "standby_audio_minutes" && rule.pricing_plan === "standard");
}

// Seconds billed as active and as standby. Without a standby price, all of OpenAI's total is
// active (not active + paused, which may be up to a second short of it).
function liveBilledSeconds(usage: LiveUsage, hasStandby: boolean): { active: number; standby: number } {
	if (!hasStandby) return { active: usage.live_seconds ?? 0, standby: 0 };
	const { active, paused } = liveSecondsSplit(usage);
	return { active, standby: paused };
}

/** The voice card snapshotted on a Live session, if there is one. */
export function liveVoiceCard(metadata: Record<string, unknown> | null | undefined): PriceCard | null {
	const card = (metadata?.live as Partial<LiveConfig> | undefined)?.voiceCard;
	return card && Array.isArray(card.rules) ? card : null;
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
		for (const meter of ["audio_seconds", "audio_minutes", "standby_audio_minutes", "input_text_tokens", "cached_read_text_tokens", "cached_write_text_tokens_30m", "cached_write_text_tokens_12h", "output_text_tokens", "native_web_search_requests"]) {
			if (Number(meters[meter] ?? 0) > 0 && !pricing.lines.some((line) => line.dimension === meter)) {
				throw new Error(`live_pricing_rule_missing:${meter}`);
			}
		}
		return pricing;
	};
	const voice = price(liveVoiceMeters(usage, config.voiceCard), config.voiceCard);
	let backendNanos = 0;
	const lines = voice.lines.map((line) => ({ ...line, model: config.voiceCard.model, component: "voice" }));
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
