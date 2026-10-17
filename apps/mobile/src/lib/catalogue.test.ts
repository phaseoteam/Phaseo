import type { ModelCard } from "./api/models";
import { DEFAULT_FILTERS, filterModels, isFree, searchScore } from "./catalogue";

function card(model_id: string, overrides: Partial<ModelCard> = {}): ModelCard {
  return {
    model_id,
    name: model_id.split("/")[1],
    organisation_name: model_id.split("/")[0],
    gateway_status: "active",
    gateway_endpoints: [],
    gateway_input_modalities: ["text"],
    gateway_output_modalities: ["text"],
    gateway_features: [],
    gateway_tiers: [],
    gateway_provider_names: [],
    gateway_active_provider_names: [],
    primary_timestamp: 0,
    ...overrides,
  } as ModelCard;
}

describe("searchScore", () => {
  it("ranks the exact model above its variants", () => {
    const base = card("openai/gpt-5", { name: "GPT-5" });
    const mini = card("openai/gpt-5-mini", { name: "GPT-5 mini" });
    expect(searchScore(base, "gpt-5")).toBeGreaterThan(searchScore(mini, "gpt-5"));
  });

  it("requires every term to match", () => {
    const model = card("anthropic/claude-haiku-5.5", { name: "Claude Haiku 5.5", organisation_name: "Anthropic" });
    expect(searchScore(model, "anthropic haiku")).toBeGreaterThan(0);
    expect(searchScore(model, "anthropic sonnet")).toBe(0);
  });

  it("matches across punctuation", () => {
    const model = card("deepseek/deepseek-v4.1-flash", { name: "DeepSeek V4.1 Flash" });
    expect(searchScore(model, "v41flash")).toBeGreaterThan(0);
  });
});

describe("filterModels", () => {
  const models = [
    card("openai/a", { primary_timestamp: 3, organisation_name: "OpenAI" }),
    card("google/b", { primary_timestamp: 5, organisation_name: "Google", gateway_input_modalities: ["text", "image"] }),
    card("meta/c", { primary_timestamp: 4, organisation_name: "Meta", gateway_status: "retired" }),
    card("qwen/d:free", { primary_timestamp: 1, organisation_name: "Qwen", lowest_input_price: 0, lowest_output_price: 0 }),
  ];

  it("hides retired models and sorts newest first by default", () => {
    expect(filterModels(models, DEFAULT_FILTERS).map((model) => model.model_id)).toEqual(["google/b", "openai/a", "qwen/d:free"]);
  });

  it("filters by organisation, modality and free", () => {
    expect(filterModels(models, { ...DEFAULT_FILTERS, organisations: ["OpenAI", "Qwen"] }).map((model) => model.model_id)).toEqual(["openai/a", "qwen/d:free"]);
    expect(filterModels(models, { ...DEFAULT_FILTERS, inputModalities: ["image"] }).map((model) => model.model_id)).toEqual(["google/b"]);
    expect(filterModels(models, { ...DEFAULT_FILTERS, availability: "free" }).map((model) => model.model_id)).toEqual(["qwen/d:free"]);
  });

  it("treats zero-priced gateway models as free", () => {
    expect(isFree(models[3]!)).toBe(true);
    expect(isFree(models[0]!)).toBe(false);
  });
});
