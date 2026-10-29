import type { ModelActivityRow, ModelDetail, ProviderTrendPoint } from "@/lib/api/models";
import { formatLongCount, lineage, modalityTags, parseTypes, relativeDateLabel } from "./about";
import { activityDays, lastUtcDays } from "./activity";
import { buildFaq, joinList, pricingHighlights } from "./faq";
import { averageUptime, performanceView, selectProviderTrend, trendSeries, uptimeHours } from "./performance";

const usage = (dayBucket: string, values: Partial<ModelActivityRow>): ModelActivityRow => ({
  dayBucket, providerId: "anthropic", requests: 0, successRequests: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, inputTextTokens: 0, outputTextTokens: 0, cachedReadTokens: 0, cachedReadTextTokens: 0, ...values,
});

describe("activity", () => {
  const now = new Date("2026-10-18T06:00:00Z");

  test("thirty UTC days ending today", () => {
    const days = lastUtcDays(30, now);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-09-19");
    expect(days.at(-1)).toBe("2026-10-18");
  });

  test("completion excludes reasoning, providers add up, and today gets a projected pace", () => {
    const days = activityDays([
      usage("2026-10-07", { inputTokens: 619, outputTokens: 13, successRequests: 1 }),
      usage("2026-10-07", { providerId: "google-vertex", inputTokens: 100, outputTokens: 50, reasoningTokens: 30, successRequests: 2 }),
      usage("2026-10-18", { inputTokens: 100, outputTokens: 0, successRequests: 4 }),
      usage("2026-01-01", { inputTokens: 999 }),
    ], "tokens", now);
    const oct7 = days.find((day) => day.day === "2026-10-07")!;
    expect(oct7).toMatchObject({ prompt: 719, reasoning: 30, completion: 33, requests: 3 });
    const today = days.at(-1)!;
    expect(today.isToday).toBe(true);
    // A quarter of the UTC day has passed, so 100 tokens so far projects to 400.
    expect(today.projected).toBeCloseTo(300);
    expect(activityDays([usage("2026-10-18", { successRequests: 4 })], "requests", now).at(-1)!.projected).toBeCloseTo(12);
  });
});

describe("performance and uptime", () => {
  const point = (provider: string, bucket: string, values: Partial<ProviderTrendPoint>): ProviderTrendPoint => ({ provider, providerName: provider, bucket, requests: 100, ...values });

  test("hourly provider points when they span three days or less", () => {
    const hourly = [point("a", "2026-10-14T00:00:00Z", {}), point("a", "2026-10-15T00:00:00Z", {})];
    const daily = [{ ...point("a", "", {}), bucket: undefined, day: "2026-10-14" }];
    expect(selectProviderTrend(hourly, daily).resolution).toBe("hour");
    expect(selectProviderTrend([point("a", "2026-10-10T00:00:00Z", {}), point("a", "2026-10-15T00:00:00Z", {})], daily).resolution).toBe("day");
  });

  test("series are the busiest providers with usable values, capped at three", () => {
    const data = ["a", "b", "c", "d"].flatMap((provider, index) => [point(provider, "2026-10-14T00:00:00Z", { requests: 10 * (index + 1), avgThroughput: 40 + index }), point(provider, "2026-10-14T01:00:00Z", { requests: 10, avgThroughput: 0 })]);
    const series = trendSeries(data, "throughput", 3);
    expect(series.map((entry) => entry.provider)).toEqual(["d", "c", "b"]);
    expect(series[0]!.points).toHaveLength(1);
    expect(series[0]!.average).toBe(43);
  });

  test("a single provider is drawn as P10, P50 and P90 bands", () => {
    const metrics = {
      summary: { totalRequests: 0 }, hourly: [], successSeries: [], qualitySeries: [],
      providerHourly7d: [point("a", "2026-10-16T00:00:00Z", { avgThroughput: 40 })],
      providerDaily7d: [],
      providerPercentileDaily7d: [10, 50, 90, 99].map((percentile) => ({ ...point("a", "", { avgThroughput: percentile }), bucket: undefined, day: "2026-10-16", percentile })),
    } as unknown as Parameters<typeof performanceView>[0];
    const view = performanceView(metrics, 3);
    expect(view.usesPercentiles).toBe(true);
    expect([...new Set(view.data.map((entry) => entry.provider))]).toEqual(["percentile-10", "percentile-50", "percentile-90"]);
  });

  test("hours without requests count as 100%, as on the website", () => {
    const hours = uptimeHours([{ bucket: "2026-10-18T05:00:00Z", overallSuccessPct: 50, worstProviderSuccessPct: 50, worstProviderRequests: 4, providerCount: 1, requests: 4 }], new Date("2026-10-18T06:30:00Z"));
    expect(hours).toHaveLength(24);
    expect(hours.at(-1)!.bucket).toBe("2026-10-18T06:00:00.000Z");
    expect(hours.at(-2)!.overall).toBe(50);
    expect(averageUptime(hours.map((hour) => hour.overall))).toBeCloseTo((23 * 100 + 50) / 24);
    expect(averageUptime(uptimeHours([], new Date()).map((hour) => hour.overall))).toBe(100);
  });
});

describe("about", () => {
  test("modalities parse like the website's About section", () => {
    expect(parseTypes("text,image")).toEqual(["text", "image"]);
    expect(parseTypes(["Speech to text", "embedding", "tts"])).toEqual(["audio_stt", "embeddings", "audio_tts"]);
    expect(modalityTags(["image", "text", "code"]).map((tag) => tag.label)).toEqual(["Text", "Image", "Code"]);
  });

  test("counts and relative dates", () => {
    expect(formatLongCount(1_800_000_000_000)).toBe("1.8 trillion");
    expect(formatLongCount("70000000000")).toBe("70 billion");
    expect(formatLongCount(0)).toBeNull();
    expect(relativeDateLabel("2026-10-07T18:00:00Z", new Date("2026-10-18T10:00:00Z"))).toBe("11 days ago");
    expect(relativeDateLabel("2026-11-08", new Date("2026-10-18T10:00:00Z"))).toBe("in 3 weeks");
  });

  test("related models come from the timeline, named from the catalogue when the API has no name", () => {
    const events = [
      { date: "2025-10-15", eventType: "PreviousModel", modelId: "anthropic/claude-haiku-4.5", modelName: "Claude Haiku 4.5" },
      { date: "2026-12-01", eventType: "FutureModel", modelId: "anthropic/claude-haiku-6", modelName: "anthropic/claude-haiku-6" },
    ];
    const related = lineage(events, null, (id) => (id === "anthropic/claude-haiku-6" ? "Claude Haiku 6" : null));
    expect(related.previous).toEqual({ modelId: "anthropic/claude-haiku-4.5", modelName: "Claude Haiku 4.5" });
    expect(related.next?.modelName).toBe("Claude Haiku 6");
    expect(lineage([], "openai/gpt-4-1").previous?.modelName).toBe("GPT 4.1");
  });
});

describe("FAQ", () => {
  const model = {
    id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", status: "Available", organisation: { name: "Anthropic" }, organisation_id: "anthropic",
    release_date: "2026-10-07T18:00:00+00:00", input_types: "text,image", output_types: "text", input_modalities: [], output_modalities: [], family_id: "anthropic/claude-5.5",
    model_details: [{ detail_name: "input_context_length", detail_value: 1000000 }],
  } as unknown as ModelDetail;
  const pricing = [{
    provider: { api_provider_id: "anthropic", api_provider_name: "Anthropic" },
    provider_models: [],
    pricing_rules: [
      { meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: 0.1, currency: "USD", pricing_plan: "standard" },
      { meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: 0.5, currency: "USD", pricing_plan: "standard" },
      { meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: 0.25, currency: "USD", pricing_plan: "batch" },
    ],
  }];
  const items = buildFaq({
    model, description: "Claude Haiku 5.5 is Anthropic's fastest current model", benchmarkCount: 3, activeProviderCount: 1, isGatewayActive: true, showProviders: true, pricing,
    related: { previous: { modelId: "anthropic/claude-haiku-4.5", modelName: "Claude Haiku 4.5" }, next: null },
    gateway: { aliases: [], acceptedModelIdentifiers: [], providers: [], activeProviders: [], comingSoonProviders: [], supportedParametersByEndpoint: { "chat.completions": [{ param_id: "tools", provider_count_supported: 1 }] } },
  });

  test("asks the website's ten questions in its order", () => {
    expect(items.map((item) => item.question)).toEqual([
      "What is Claude Haiku 5.5?",
      "What is the context length of Claude Haiku 5.5?",
      "How much does Claude Haiku 5.5 cost?",
      "What providers serve Claude Haiku 5.5, and can I use it via API?",
      "Does Claude Haiku 5.5 support tool calling?",
      "Does Claude Haiku 5.5 support structured outputs?",
      "What models are related to Claude Haiku 5.5?",
      "What benchmark results are available for Claude Haiku 5.5?",
      "What modalities does Claude Haiku 5.5 support?",
      "When was Claude Haiku 5.5 released?",
    ]);
  });

  test("answers come from the same data", () => {
    const text = (key: string) => items.find((item) => item.key === key)!.answer.map((part) => (typeof part === "string" ? part : part.text)).join("");
    expect(text("model")).toBe("Claude Haiku 5.5 is Anthropic's fastest current model.");
    expect(text("contextLength")).toBe("Claude Haiku 5.5 has a recorded input context length of 1,000,000 tokens.");
    expect(text("cost")).toContain("Input text tokens at $0.10 per million tokens and Output text tokens at $0.50 per million tokens");
    expect(text("toolCalling")).toMatch(/^Yes\./);
    expect(text("structuredOutputs")).toMatch(/^Phaseo does not currently have enough/);
    expect(text("modalities")).toBe("Claude Haiku 5.5 accepts these input modalities: Text and Image. Claude Haiku 5.5 can produce these output modalities: Text.");
    expect(text("releaseDate")).toBe("Claude Haiku 5.5 was released on 7 Oct 2026.");
  });

  test("cost highlights skip non-standard tiers and lists join like Intl.ListFormat", () => {
    expect(pricingHighlights(pricing as never)).toHaveLength(2);
    expect(joinList(["A", "B", "C"])).toBe("A, B, and C");
    expect(joinList(["A", "B"])).toBe("A and B");
  });
});
