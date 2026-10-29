import type { ProviderPricing } from "@/lib/api/models";
import { isRoutable, priceLines, providerLabel, sortByRoutable } from "./pricing";

const tier = (op: "gt" | "lte") => [{ op, path: "long_context_input_tokens", value: 100000, or_group: 1, and_index: 1 }];
const rule = (meter: string, price: number, op: "gt" | "lte", plan = "standard") =>
  ({ meter, unit: "token", unit_size: 1_000_000, price_per_unit: price, pricing_plan: plan, match: tier(op) });

const anthropic = {
  provider: { api_provider_id: "anthropic", api_provider_name: "Anthropic", offer_label: null },
  pricing_rules: [
    rule("input_text_tokens", 0.5, "gt"), rule("input_text_tokens", 0.1, "lte"), rule("input_text_tokens", 0.05, "lte", "batch"),
    rule("output_text_tokens", 0.5, "lte"), rule("output_text_tokens", 2.5, "gt"),
    rule("cached_write_text_tokens_5m", 0.125, "lte"),
  ],
} as unknown as ProviderPricing;

describe("priceLines", () => {
  it("shows the normal price, with the long-context price separately", () => {
    const lines = priceLines(anthropic);
    expect(lines.map((line) => [line.label, line.value, line.longContext])).toEqual([
      ["Input", "$0.1", { value: "$0.5", above: "100K" }],
      ["Output", "$0.5", { value: "$2.5", above: "100K" }],
      ["Cache write (5 min)", "$0.125", null],
    ]);
  });

  it("keeps plans apart", () => {
    expect(priceLines(anthropic, "batch").map((line) => line.value)).toEqual(["$0.05"]);
  });

  it("reads OpenAI's input_tokens tiers too (GPT-6.1 Sol, Ultrafast, 2026-10-18)", () => {
    const openaiRule = (meter: string, price: number, op: "gt" | "lte") =>
      ({ meter, unit: "token", unit_size: 1_000_000, price_per_unit: price, pricing_plan: "ultrafast", match: [{ op, path: "input_tokens", value: 272000 }] });
    const openai = {
      provider: { api_provider_id: "openai", api_provider_name: "OpenAI", offer_label: null },
      pricing_rules: [openaiRule("input_text_tokens", 12, "lte"), openaiRule("input_text_tokens", 24, "gt"), openaiRule("output_text_tokens", 60, "lte"), openaiRule("output_text_tokens", 90, "gt")],
    } as unknown as ProviderPricing;
    expect(priceLines(openai, "ultrafast").map((line) => [line.label, line.value, line.longContext])).toEqual([
      ["Input", "$12", { value: "$24", above: "272K" }],
      ["Output", "$60", { value: "$90", above: "272K" }],
    ]);
  });
});

describe("sortByRoutable", () => {
  it("puts providers Phaseo routes to first and keeps priced-but-inactive ones after", () => {
    const provider = (id: string, active: boolean[]) =>
      ({ provider: { api_provider_id: id }, provider_models: active.map((is_active_gateway) => ({ is_active_gateway })), pricing_rules: [] }) as unknown as ProviderPricing;
    const sorted = sortByRoutable([provider("amazon-bedrock", [false]), provider("anthropic", [true]), provider("azure", []), provider("google-vertex", [false, true])]);
    expect(sorted.map((entry) => [entry.provider.api_provider_id, isRoutable(entry)])).toEqual([
      ["anthropic", true], ["google-vertex", true], ["amazon-bedrock", false], ["azure", false],
    ]);
  });
});

describe("providerLabel", () => {
  it("adds the offer label to tell same-named routes apart", () => {
    expect(providerLabel({ api_provider_id: "google-vertex-eu", api_provider_name: "Google Vertex", offer_label: "EU" } as ProviderPricing["provider"])).toBe("Google Vertex (EU)");
    expect(providerLabel({ api_provider_id: "anthropic", api_provider_name: "Anthropic", offer_label: null } as ProviderPricing["provider"])).toBe("Anthropic");
  });
});
