import { describe, expect, it, vi } from "vitest";
import type { PriceCard, PriceRule } from "@pipeline/pricing/types";
import { LIVE_SEARCH_PRICE_CARD, priceLiveUsage, type LiveConfig } from "./live-sessions";
import { LEGACY_LIVE_VOICE_CARD, LIVE_VOICE_CARD } from "./__fixtures__/live-price-cards";
import { liveBackendSettingsSchema } from "./live-settings";
import { buildSessionEndedEvent } from "./realtime-session-events";
import { normalizeRealtimeUsage, priceRealtimeUsage, realtimeBilledMeters, type RealtimeProvider } from "./realtime-sessions";

vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: vi.fn() }));

const card = (meters: string[], model = "test-model"): PriceCard => ({
	provider: "test", model, endpoint: "audio.realtime", currency: "USD", effective_from: null, effective_to: null, version: null,
	rules: meters.map((meter) => ({ pricing_plan: "standard", meter: meter as PriceRule["meter"], unit: meter.includes("minutes") ? "minute" : "token",
		unit_size: meter.includes("minutes") ? 1 : 1_000_000, price_per_unit: "1", currency: "USD", match: [], priority: 1 })),
});
const TOKEN_METERS = ["input_text_tokens", "input_audio_tokens", "output_text_tokens", "output_audio_tokens", "cached_read_text_tokens", "cached_read_audio_tokens"];

// Usage as the relay stored it for real production calls on 2026-11-04 and 2026-11-05.
const calls: Array<{ provider: RealtimeProvider; meters: string[]; usage: Record<string, unknown> }> = [
	{ provider: "openai", meters: TOKEN_METERS, usage: { input_text_tokens: 110, input_audio_tokens: 86, output_text_tokens: 102, output_audio_tokens: 116,
		cached_read_text_tokens: 64, cached_read_audio_tokens: 64, received_audio_ms: 9540.04, provider_response_completed: true } },
	{ provider: "google-ai-studio", meters: TOKEN_METERS, usage: { audio_ms: 8540.0625, input_audio_ms: 8540.0625, input_text_tokens: 179, input_audio_tokens: 411,
		output_audio_tokens: 71, provider_response_completed: true } },
	{ provider: "spacex-ai", meters: realtimeBilledMeters("spacex-ai"), usage: { audio_ms: 12156, session_audio_ms: 12156, input_audio_ms: 9640.04,
		output_audio_ms: 5730, provider_response_completed: true } },
	{ provider: "elevenlabs", meters: realtimeBilledMeters("elevenlabs"), usage: { audio_ms: 14578, session_audio_ms: 14578, provider_audio_ms: 14578,
		input_audio_ms: 9940.04, output_audio_ms: 1760, input_text_tokens: 593, output_text_tokens: 11, provider_cost_status: "reconciled" } },
	{ provider: "mistral", meters: realtimeBilledMeters("mistral"), usage: { input_audio_ms: 8740 } },
];

// The GPT Live call with web search on 2026-11-05: 11 s of voice, one backend response, two searches.
const live = { live_started: true, live_final: true, live_seconds: 11, live_pending_responses: [],
	live_responses: [{ id: "resp_1", status: "response.completed", model: "gpt-5.6-luna", service_tier: "default", delegation_id: "d1",
		usage: { input_text_tokens: 129, cached_read_text_tokens: 0, cached_write_text_tokens_30m: 5041, output_text_tokens: 526,
			input_tokens: 5170, output_tokens: 526, output_reasoning_tokens: 395 } }],
	live_tool_calls: [{ id: "ws_1", response_id: "resp_1", delegation_id: "d1", done: true }, { id: "ws_2", response_id: "resp_1", delegation_id: "d1", done: true }] };
const liveConfig: LiveConfig = { backendModel: "openai/gpt-5.6-luna", voiceCard: LIVE_VOICE_CARD, searchCard: LIVE_SEARCH_PRICE_CARD,
	settings: liveBackendSettingsSchema.parse({ web_search: true }),
	backendCard: { ...card(["input_text_tokens", "cached_read_text_tokens", "cached_write_text_tokens_30m", "cached_write_text_tokens_12h", "output_text_tokens"], "openai/gpt-5.6-luna"), endpoint: "text.generate" } };

/** The quantity of each billed meter, with per-minute meters in seconds as session.ended reports them. */
function billedQuantities(priced: Record<string, unknown>) {
	const totals: Record<string, number> = {};
	for (const line of (priced.pricing as { lines: Array<{ dimension: string; quantity: number }> }).lines) {
		if (!(Number(line.quantity) > 0)) continue;
		// Standby is reported in minutes on its own meter.
		const minutes = /(^|_)audio_minutes$/.test(line.dimension) && line.dimension !== "standby_audio_minutes";
		const key = minutes ? "audio_seconds" : line.dimension;
		totals[key] = (totals[key] ?? 0) + Number(line.quantity) * (minutes ? 60 : 1);
	}
	return totals;
}

const ended = (usage: Record<string, unknown>) => buildSessionEndedEvent({ sessionId: "rt_test", end: { reason: "client_requested", initiatedBy: "client" },
	durationSeconds: 1, usage, costNanos: 1, estimated: false, billingStatus: "settled" }).usage;

describe("session.ended usage", () => {
	it.each(calls)("accounts for every meter $provider bills", ({ provider, meters, usage }) => {
		const normalized = normalizeRealtimeUsage(usage);
		const billed = billedQuantities(priceRealtimeUsage(normalized, card(meters), provider));
		expect(Object.keys(billed).length).toBeGreaterThan(0);
		const reported = ended(normalized);
		for (const [meter, quantity] of Object.entries(billed)) expect({ meter, quantity: reported[meter] }).toEqual({ meter, quantity: expect.closeTo(quantity, 6) });
	});

	it("accounts for GPT Live's voice, backend tokens including cache writes, and web searches", () => {
		const normalized = normalizeRealtimeUsage(live);
		const billed = billedQuantities(priceLiveUsage(normalized, liveConfig));
		expect(billed).toMatchObject({ audio_seconds: 11, cached_write_text_tokens_30m: 5041, native_web_search_requests: 2 });
		expect(ended(normalized)).toEqual(billed);
	});

	// OpenAI's final split on a 22 s WebRTC call: 11 s active, 11 s paused.
	const split = { ...live, live_seconds: 22, live_active_seconds: 11, live_paused_seconds: 11 };
	const activeOnlyCard: PriceCard = { ...LIVE_VOICE_CARD, rules: LIVE_VOICE_CARD.rules.filter((rule) => rule.meter === "audio_minutes") };
	it.each([
		["a catalogue card with standby", LIVE_VOICE_CARD, { audio_seconds: 11, standby_audio_minutes: 11 / 60 }],
		["a catalogue card without standby", activeOnlyCard, { audio_seconds: 22 }],
		["a legacy audio_seconds snapshot", LEGACY_LIVE_VOICE_CARD, { audio_seconds: 22 }],
	])("reports GPT Live voice as billed with %s", (_name, voiceCard, voice) => {
		const config = { ...liveConfig, voiceCard };
		const normalized = normalizeRealtimeUsage(split, { live: config });
		const billed = billedQuantities(priceLiveUsage(normalized, config));
		expect(billed).toMatchObject(voice);
		expect(ended(normalized)).toEqual(billed);
		if (voiceCard === LIVE_VOICE_CARD) expect(normalized).toMatchObject({ audio_seconds: 11, standby_audio_minutes: 11 / 60 });
		else expect(normalized).not.toHaveProperty("standby_audio_minutes");
		// The raw provider split is kept either way.
		expect(normalized).toMatchObject({ live_active_seconds: 11, live_paused_seconds: 11 });
		// Re-normalizing stored usage with the session's card drops a stale standby meter.
		expect(normalizeRealtimeUsage({ ...split, standby_audio_minutes: 11 / 60 }, { live: config })).toEqual(normalized);
	});
});
