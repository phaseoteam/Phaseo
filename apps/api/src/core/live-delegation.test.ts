import { describe, expect, it, vi } from "vitest";
import { LIVE_PRICE_CARD, LIVE_SEARCH_PRICE_CARD, assertLiveFinalUsage, createLiveConfig, ingestLiveUsage, liveStartEvent, liveUsageMeters, priceLiveUsage, type LiveConfig, type LiveUsage } from "./live-sessions";
import { LIVE_VOICES, liveBackendSettingsSchema } from "./live-settings";
import { loadPriceCard } from "@pipeline/pricing/loader";

vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: vi.fn() }));
const settings = liveBackendSettingsSchema.parse({ web_search: true, service_tier: "priority" });
const card = { ...LIVE_PRICE_CARD, model: "openai/gpt-5.6-luna", endpoint: "text.generate", rules:
	["standard", "priority", "flex"].flatMap((plan) => ["input_text_tokens", "cached_read_text_tokens", "cached_write_text_tokens", "output_text_tokens"].map((meter) => ({
		...LIVE_PRICE_CARD.rules[0], meter: meter as any, pricing_plan: plan, unit_size: 1e6,
		price_per_unit: plan === "priority" ? "2" : plan === "flex" ? "0.5" : "1",
	}))) };
const config: LiveConfig = { backendModel: card.model, voiceCard: LIVE_PRICE_CARD, backendCard: card, settings, searchCard: LIVE_SEARCH_PRICE_CARD };
const delegate = (id = "d1", responseId = "r1") => ({ type: "session.delegation.created", delegation: { id, target: "responses", response_id: responseId } });
const terminal = (id = "r1", delegationId = "d1", tier = "priority") => ({ type: "response.event", delegation_id: delegationId, event: { type: "response.completed", response: {
	id, model: "gpt-5.6-luna", service_tier: tier, output: [], usage: { input_tokens: 1000, output_tokens: 200, total_tokens: 1200,
		input_tokens_details: { cached_tokens: 400, cache_write_tokens: 200 }, output_tokens_details: { reasoning_tokens: 100 } },
} } });
const tool = (type = "response.output_item.done", id = "search1", delegationId = "d1") => ({ type: "response.event", delegation_id: delegationId,
	event: { type, item: { id, type: "web_search_call", status: type.endsWith("done") ? "completed" : "in_progress", action: { type: "search", query: "weather" } } } });

describe("Live delegation configuration", () => {
	it("exposes all 22 reference voices and maps supported backend settings", () => {
		expect(new Set(LIVE_VOICES).size).toBe(22);
		const configured = { ...config, settings: liveBackendSettingsSchema.parse({ instructions: "Verify facts.", max_output_tokens: 16000,
			reasoning_effort: "high", reasoning_summary: "concise", verbosity: "low", web_search: true, tool_choice: "required", parallel_tool_calls: false }) };
		expect(liveStartEvent(configured, "vesper", "Listen carefully.").session).toMatchObject({ instructions: "Listen carefully.",
			audio: { output: { voice: "vesper" } }, delegation: { type: "responses", responses: { instructions: "Verify facts.",
				max_output_tokens: 16000, reasoning: { effort: "high", summary: "concise" }, text: { verbosity: "low" },
				tools: [{ type: "web_search" }], tool_choice: "required", parallel_tool_calls: false, service_tier: "default" } } });
	});
	it.each([{ max_output_tokens: 15 }, { max_output_tokens: 32769 }, { max_output_tokens: 16.5 }, { tool_choice: "required" },
		{ reasoning_effort: "max" }, { service_tier: "auto" }, { tools: [{ type: "function" }] }, { model: "arbitrary" }, { final_cost_nanos: 0 }])("rejects unsupported or unmetered settings %j", (input) => {
		expect(liveBackendSettingsSchema.safeParse(input).success).toBe(false);
	});
	it("requires explicit requested-tier pricing and snapshots settings before provider work", async () => {
		vi.mocked(loadPriceCard).mockResolvedValue({ ...card, rules: card.rules.filter((rule) => rule.pricing_plan === "standard") });
		await expect(createLiveConfig(config.backendModel, settings)).rejects.toThrow("price_card_missing");
		vi.mocked(loadPriceCard).mockResolvedValue(card);
		const snapshot = await createLiveConfig(config.backendModel, settings);
		expect(snapshot.settings).toEqual(settings);
		expect(snapshot.searchCard).toEqual(LIVE_SEARCH_PRICE_CARD);
	});
});

describe("Live delegated usage", () => {
	it("tracks nested delegation IDs before response.created, including after reload", () => {
		let usage = ingestLiveUsage({ live_started: true }, delegate());
		usage = ingestLiveUsage(structuredClone(usage), { type: "session.closed", usage: { seconds: 5 } });
		expect(() => assertLiveFinalUsage(usage)).toThrow("response_authoritative_usage_pending");
		expect(() => assertLiveFinalUsage(ingestLiveUsage(usage, terminal()))).not.toThrow();
	});
	it("bills streamed web searches once even though terminal output is empty", () => {
		let usage = ingestLiveUsage({ live_started: true }, delegate());
		usage = ingestLiveUsage(usage, tool("response.output_item.added"));
		usage = ingestLiveUsage(structuredClone(usage), tool());
		usage = ingestLiveUsage(usage, tool());
		usage = ingestLiveUsage(usage, terminal());
		usage = ingestLiveUsage(usage, { type: "session.closed", usage: { seconds: 60 } });
		expect(() => assertLiveFinalUsage(usage)).not.toThrow();
		const bill = priceLiveUsage(usage, config) as any;
		expect(bill.pricing.total_nanos).toBe(62_400_000);
		expect(bill.live_tool_nanos).toBe(10_000_000);
		expect(bill.pricing.lines.filter((line: any) => line.component === "tool")).toEqual([expect.objectContaining({ response_id: "r1", delegation_id: "d1", tool_call_id: "search1" })]);
		expect(usage.live_responses?.[0].provider_usage).toEqual(terminal().event.response.usage);
		expect(liveUsageMeters(usage)).toMatchObject({ input_tokens: 1000, input_text_tokens: 400, cached_read_text_tokens: 400,
			cached_write_text_tokens: 200, output_tokens: 200, output_reasoning_tokens: 100, native_web_search_requests: 1 });
	});
	it("keeps multiple delegations and continued Responses separately priced", () => {
		let usage: LiveUsage = {};
		for (const [id, responseId, tier] of [["d1", "r1", "priority"], ["d2", "r2", "flex"], ["d1", "r3", "default"]]) {
			usage = ingestLiveUsage(usage, delegate(id, responseId));
			usage = ingestLiveUsage(usage, tool("response.output_item.done", `search-${responseId}`, id));
			usage = ingestLiveUsage(usage, terminal(responseId, id, tier));
		}
		expect(usage.live_responses).toHaveLength(3);
		expect(usage.live_pending_responses).toEqual([]);
		expect(priceLiveUsage(usage, config).live_backend_nanos).toBe(4_200_000);
		expect(priceLiveUsage(usage, config).live_tool_nanos).toBe(30_000_000);
	});
	it("uses the returned service tier and never silently substitutes standard prices", () => {
		const usage = ingestLiveUsage({}, terminal());
		expect(priceLiveUsage(ingestLiveUsage({}, terminal("r1", "d1", "default")), config).live_backend_nanos).toBe(1_200_000);
		expect(() => priceLiveUsage(usage, { ...config, backendCard: { ...card, rules: card.rules.filter((r) => r.pricing_plan === "standard") } })).toThrow();
		expect(() => priceLiveUsage(ingestLiveUsage({}, terminal("r1", "d1", "ultrafast")), config)).toThrow("service_tier_unknown");
		const event = terminal(); event.event.response.model = "gpt-6-astra";
		expect(() => priceLiveUsage(ingestLiveUsage({}, event), config)).toThrow("model_mismatch");
	});
	it("retains holds for missing tool completions and refuses unpriced or unknown tools", () => {
		let usage = ingestLiveUsage({}, delegate());
		usage = ingestLiveUsage(usage, tool("response.output_item.added"));
		usage = ingestLiveUsage(usage, terminal());
		expect(() => assertLiveFinalUsage(usage)).toThrow("tool_authoritative_usage_pending");
		expect(() => priceLiveUsage(usage, { ...config, searchCard: undefined })).toThrow("search_price_snapshot_missing");
		const event = tool(); event.event.item.type = "function_call";
		expect(() => ingestLiveUsage(usage, event)).toThrow("tool_not_supported");
		expect(() => ingestLiveUsage({}, tool())).toThrow("tool_identity_missing");
	});
	it("applies long-context thresholds per response, including cache tokens, without tier fallback", () => {
		const longCard = { ...card, rules: card.rules.flatMap((rule) => [
			{ ...rule, match: [{ path: "long_context_input_tokens", op: "lte" as const, value: 272000 }] },
			{ ...rule, price_per_unit: "4", match: [{ path: "long_context_input_tokens", op: "gt" as const, value: 272000 }] },
		]) };
		const event = terminal(); Object.assign(event.event.response.usage, { input_tokens: 300000, total_tokens: 300200 });
		const usage = ingestLiveUsage({}, event);
		expect(priceLiveUsage(usage, { ...config, backendCard: longCard }).live_backend_nanos).toBe(1_200_800_000);
		const uncovered = { ...card, rules: card.rules.map((rule) => ({ ...rule, match: [{ path: "long_context_input_tokens", op: "gt" as const, value: 1000000 }] })) };
		expect(() => priceLiveUsage(usage, { ...config, backendCard: uncovered })).toThrow();
	});
	it("rejects contradictory terminal usage instead of silently discarding extra charges", () => {
		const usage = ingestLiveUsage({}, terminal());
		const event = terminal(); event.event.response.usage.input_tokens += 1;
		expect(() => ingestLiveUsage(usage, event)).toThrow("usage_conflict");
	});
});
