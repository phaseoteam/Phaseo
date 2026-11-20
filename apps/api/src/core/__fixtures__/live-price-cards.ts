import type { PriceCard } from "@pipeline/pricing/types";

// The shape loadPriceCard builds from the GPT Live audio.realtime SKU (v2_pricing_sku_meters, 2026-11-19).
export const LIVE_VOICE_CARD: PriceCard = {
	provider: "openai", model: "openai/gpt-live-1", endpoint: "audio.realtime", currency: "USD",
	effective_from: "2026-11-19T20:10:22.712Z", effective_to: null, version: "2026-11-19T20:10:22.712Z",
	rules: [
		{ pricing_plan: "standard", meter: "audio_minutes", unit: "minute", unit_size: 1, price_per_unit: "0.05",
			currency: "USD", match: [], priority: 10 },
		{ pricing_plan: "standard", meter: "standby_audio_minutes", unit: "minute", unit_size: 1, price_per_unit: "0.02",
			currency: "USD", match: [], priority: 20 },
	],
};

// The fixed card sessions created before the catalogue card were snapshotted with.
export const LEGACY_LIVE_VOICE_CARD: PriceCard = {
	provider: "openai", model: "openai/gpt-live-1", endpoint: "audio.live", currency: "USD",
	effective_from: null, effective_to: null, version: "openai-live-2026-09-10",
	rules: [{ pricing_plan: "standard", meter: "audio_seconds", unit: "minute",
		unit_size: 60, price_per_unit: "0.05", currency: "USD", match: [], priority: 1 }],
};
