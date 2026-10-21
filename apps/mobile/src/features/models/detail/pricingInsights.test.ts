import type { EffectivePricingRow, PricingHistoryRule, ProviderPricing } from "@/lib/api/models";
import {
  buildPriceHistory, effectivePriceBetween, effectivePriceSummary, effectiveRows, historyTimestamps, isSeriesVisibleByDefault, meterOptions, observedUsageByProviderPlan, RANGE_OPTIONS, summaryCutoffMs,
  weightedEffectivePrice,
} from "./pricingInsights";

const DAY = 86_400_000;
const row = (dayBucket: string, providerId: string, inputTokens: number, outputTokens: number, inputCostNanos: number, outputCostNanos: number, pricingPlan = "standard"): EffectivePricingRow => ({
  dayBucket, providerId, pricingPlan, inputTokens, outputTokens, cachedReadTokens: 0, inputCostNanos, outputCostNanos,
});

const provider = (id: string, name: string, plans: string[] = ["standard"], input = 1): ProviderPricing => ({
  provider: { api_provider_id: id, api_provider_name: name, status: "active" },
  provider_models: [{ is_active_gateway: true, endpoint: "text.generate" }],
  pricing_rules: plans.flatMap((plan) => [
    { meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: plan === "batch" ? input / 2 : input, currency: "USD", pricing_plan: plan },
    { meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: 5, currency: "USD", pricing_plan: plan },
  ]),
});

describe("effective pricing", () => {
  // Anthropic: 1M input tokens cost $0.10, 1M output tokens $0.50. Vertex: 3M input at $0.30/M.
  const rows = [
    row("2026-10-07", "anthropic", 600_000, 500_000, 60_000_000, 250_000_000),
    row("2026-10-09", "anthropic", 400_000, 500_000, 40_000_000, 250_000_000),
    row("2026-10-09", "google-vertex", 3_000_000, 0, 900_000_000, 0),
    row("2026-10-09", "google-vertex", 0, 0, 0, 0, "batch"),
    row("2026-08-01", "anthropic", 1_000_000, 0, 9_000_000_000, 0),
  ];
  const cutoff = summaryCutoffMs(rows);
  const observed = observedUsageByProviderPlan(rows, cutoff);

  test("the 30-day window ends on the latest usage day", () => {
    expect(new Date(cutoff + 29 * DAY).toISOString().slice(0, 10)).toBe("2026-10-09");
  });

  test("ignores rows without tokens and outside the window for the 30-day totals", () => {
    expect([...observed.keys()]).toEqual(["anthropic\u0000standard", "google-vertex\u0000standard"]);
    expect(observed.get("anthropic\u0000standard")?.inputTokens30d).toBe(1_000_000);
  });

  test("a provider's effective price is cost over tokens", () => {
    const summary = effectivePriceSummary(observed.get("anthropic\u0000standard")!.usageByDay, cutoff);
    expect(summary.input).toBeCloseTo(0.1);
    expect(summary.output).toBeCloseTo(0.5);
  });

  test("the model's weighted price weights each provider by the tokens it priced", () => {
    const table = effectiveRows([provider("anthropic", "Anthropic"), provider("google-vertex", "Google Vertex", ["standard", "batch"])], observed, cutoff, Date.parse("2026-10-18T00:00:00Z"));
    const weighted = weightedEffectivePrice(table, observed, cutoff);
    // (1M × $0.10 + 3M × $0.30) / 4M = $0.25
    expect(weighted.input).toBeCloseTo(0.25);
    expect(weighted.output).toBeCloseTo(0.5);
    const anthropic = table.find((entry) => entry.seriesKey === "anthropic\u0000standard")!;
    expect(anthropic.tokenSharePct).toBeCloseTo((2_000_000 / 5_000_000) * 100);
    expect(anthropic.listedInput).toBe(1);
    const batch = table.find((entry) => entry.seriesKey === "google-vertex\u0000batch")!;
    expect(batch.input).toBeNull();
    expect(batch.listedInput).toBe(0.5);
    expect(isSeriesVisibleByDefault(batch)).toBe(false);
    expect(isSeriesVisibleByDefault(anthropic)).toBe(true);
  });

  test("rolling effective price between two times from cumulative sums", () => {
    const points = [
      { time: Date.parse("2026-10-01T12:00:00Z"), inputTokens: 100, outputTokens: 0, inputCost: 1000, outputCost: 0 },
      { time: Date.parse("2026-10-05T12:00:00Z"), inputTokens: 300, outputTokens: 0, inputCost: 5000, outputCost: 0 },
    ];
    expect(effectivePriceBetween(points, Date.parse("2026-10-02T00:00:00Z"), Date.parse("2026-10-06T00:00:00Z"), true)).toBeCloseTo((4000 / 1e9 / 200) * 1e6);
    expect(effectivePriceBetween(points, Date.parse("2026-09-01T00:00:00Z"), Date.parse("2026-09-02T00:00:00Z"), true)).toBeNull();
  });
});

describe("price history", () => {
  const now = Date.parse("2026-10-18T00:00:00Z");
  const rule = (providerId: string, pricingPlan: string, pricePer1MUnits: number, effectiveFrom: string, effectiveTo: string | null, meter = "input_text_tokens"): PricingHistoryRule => ({
    providerId, pricingPlan, meter, unit: "token", unitSize: 1_000_000, pricePerUnit: pricePer1MUnits, pricePer1MUnits, priority: 100, effectiveFrom, effectiveTo, match: [], timeWindows: [],
  });
  // Gemini 4 Argon: a launch price of $4, cut to $2 on 13 Oct.
  const rules = [
    rule("google-ai-studio", "standard", 4, "2026-10-13T13:59:55Z", "2026-10-13T16:07:34Z"),
    rule("google-ai-studio", "standard", 2, "2026-10-13T16:07:34Z", "2026-12-01T00:00:00Z"),
    rule("google-ai-studio", "batch", 1, "2026-10-13T16:07:34Z", null),
    rule("google-ai-studio", "standard", 0.01, "2026-10-13T13:59:55Z", null, "native_web_search_requests"),
    { ...rule("google-ai-studio", "standard", 5, "2026-10-13T13:59:55Z", null, "credits_usd"), unit: "usd" },
  ];
  const providers = [provider("google-ai-studio", "Google AI Studio", ["standard", "batch"], 2)];
  const table = effectiveRows(providers, new Map(), Number.NEGATIVE_INFINITY, now);

  test("x positions are the range ends plus every change inside it", () => {
    const times = historyTimestamps({ range: "7d", rules, usageDays: [], nowMs: now });
    expect(times[0]).toBe(now - 7 * DAY);
    expect(times.at(-1)).toBe(now);
    expect(times).toContain(Date.parse("2026-10-13T16:07:34Z"));
    expect(times).not.toContain(Date.parse("2026-12-01T00:00:00Z"));
  });

  test("list view steps through the price in force", () => {
    const history = buildPriceHistory({ rows: table, rules, observed: new Map(), view: "listed", meter: "input_text_tokens", range: "7d", nowMs: now });
    const standard = history.points.map((point) => point.values["google-ai-studio\u0000standard"]);
    expect(standard[0]).toBeNull();
    expect(standard).toContain(4);
    expect(standard.at(-1)).toBe(2);
    expect(history.points.at(-1)?.values["google-ai-studio\u0000batch"]).toBe(1);
    expect(history.hasData).toBe(true);
  });

  test("meters list input and output first and leave out USD-denominated rules", () => {
    expect(meterOptions(rules, table)).toEqual(["input_text_tokens", "native_web_search_requests"]);
  });
});

describe("price history ranges", () => {
  test("are short enough for five to fit a phone, with full names for screen readers", () => {
    expect(RANGE_OPTIONS.map((option) => option.label)).toEqual(["1W", "1M", "3M", "1Y", "All"]);
    for (const option of RANGE_OPTIONS) {
      expect(option.label.length).toBeLessThanOrEqual(3);
      expect(option.accessibilityLabel.length).toBeGreaterThan(option.label.length);
    }
  });
});
