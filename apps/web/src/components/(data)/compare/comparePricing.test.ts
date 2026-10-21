import {
	formatServiceTierLabel,
	getRoutableProviderIds,
	headlineMeterRank,
	pickHeadlinePrice,
	preferStandardPlan,
} from "./comparePricing";

type Row = { meter: string; pricing_plan: string; price: number };
const row = (meter: string, price: number, pricing_plan = "standard"): Row => ({ meter, price, pricing_plan });
const perMillion = (price: Row) => price.price;

// GPT-5 rows one listed provider had in production on 2026-10-21.
const listedProvider = [
	row("cached_read_text_tokens", 0.125),
	row("input_image_tokens", 0),
	row("input_text_tokens", 1.25),
	row("output_reasoning_tokens", 0),
	row("output_text_tokens", 10),
];

describe("headlineMeterRank", () => {
	it("ranks text tokens first and other modalities second", () => {
		expect(headlineMeterRank("input_text_tokens", "input")).toBe(0);
		expect(headlineMeterRank("input_tokens", "input")).toBe(0);
		expect(headlineMeterRank("input_image_tokens", "input")).toBe(1);
		expect(headlineMeterRank("output_audio_tokens", "output")).toBe(1);
		expect(headlineMeterRank(null, "output")).toBe(0);
	});

	it("never counts reasoning tokens, cache writes or non-token meters", () => {
		expect(headlineMeterRank("output_reasoning_tokens", "output")).toBeNull();
		expect(headlineMeterRank("cached_write_text_tokens_5m", "cached")).toBeNull();
		expect(headlineMeterRank("cached_read_text_tokens", "input")).toBeNull();
		expect(headlineMeterRank("native_web_search_requests", "input")).toBeNull();
		expect(headlineMeterRank("input_characters", "input")).toBeNull();
		expect(headlineMeterRank("cached_read_text_tokens", "cached")).toBe(0);
	});
});

describe("pickHeadlinePrice", () => {
	it("ignores $0 image and reasoning rows when text prices exist", () => {
		expect(pickHeadlinePrice(listedProvider, "input", perMillion)?.valuePerMillion).toBe(1.25);
		expect(pickHeadlinePrice(listedProvider, "output", perMillion)?.valuePerMillion).toBe(10);
		expect(pickHeadlinePrice(listedProvider, "cached", perMillion)?.valuePerMillion).toBe(0.125);
	});

	it("falls back to other modalities for models without text meters", () => {
		const speech = [row("input_text_tokens", 1), row("output_audio_tokens", 20)];
		expect(pickHeadlinePrice(speech, "output", perMillion)?.valuePerMillion).toBe(20);
	});

	it("returns null when nothing counts", () => {
		expect(pickHeadlinePrice([row("input_characters", 100)], "input", perMillion)).toBeNull();
	});
});

describe("preferStandardPlan", () => {
	it("drops batch, flex and priority rows when standard rows exist", () => {
		const rows = [row("input_text_tokens", 1.5, "batch"), row("input_text_tokens", 3), row("input_text_tokens", 6, "priority")];
		expect(pickHeadlinePrice(preferStandardPlan(rows), "input", perMillion)?.valuePerMillion).toBe(3);
	});

	it("keeps every row when no standard plan is listed", () => {
		const rows = [row("input_text_tokens", 1.5, "batch"), row("input_text_tokens", 2, "flex")];
		expect(preferStandardPlan(rows)).toHaveLength(2);
	});
});

describe("getRoutableProviderIds", () => {
	it("keeps providers with an active gateway route", () => {
		const model = {
			compare_provider_pricing: [
				{ provider: { api_provider_id: "openai" }, provider_models: [{ is_active_gateway: true }, { is_active_gateway: false }] },
				{ provider: { api_provider_id: "listing-only" }, provider_models: [{ is_active_gateway: false }] },
				{ provider: { api_provider_id: "no-models" } },
			],
		};
		expect([...getRoutableProviderIds(model)]).toEqual(["openai"]);
		expect(getRoutableProviderIds({}).size).toBe(0);
	});
});

describe("formatServiceTierLabel", () => {
	it("capitalises tier ids for display", () => {
		expect(formatServiceTierLabel("standard")).toBe("Standard");
		expect(formatServiceTierLabel("ultra_fast")).toBe("Ultra fast");
	});
});
