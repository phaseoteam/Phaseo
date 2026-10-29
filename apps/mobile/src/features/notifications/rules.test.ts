import { availableEventKinds, describeRule, EMPTY_RULE, EVENT_LABELS, savableEvents, validateRule } from "./rules";

const names = { lab: (id: string) => ({ qwen: "Qwen", meta: "Meta", google: "Google" })[id] ?? id, provider: (id: string) => id, model: (id: string) => id.split("/")[1] ?? id };

describe("describeRule", () => {
  it("describes the all-labs default", () => {
    expect(describeRule(EMPTY_RULE, names)).toBe("Notify me about new models.");
  });

  it("describes all labs except a few", () => {
    expect(describeRule({ ...EMPTY_RULE, events: ["model_released", "price_changed"], labs: { mode: "except", ids: ["qwen", "meta"] }, onlyOnPhaseo: true }, names))
      .toBe("Notify me about new models and price changes from any lab except Qwen and Meta, only on Phaseo.");
  });

  it("describes a mute rule for chosen labs", () => {
    expect(describeRule({ ...EMPTY_RULE, action: "mute", events: ["deprecation_announced"], labs: { mode: "only", ids: ["google"] } }, names))
      .toBe("Never notify me about deprecations and retirements from Google.");
  });

  it("names followed models instead of labs", () => {
    expect(describeRule({ ...EMPTY_RULE, events: ["price_changed"], models: ["openai/gpt-5", "anthropic/claude-haiku-5.5"] }, names))
      .toBe("Notify me about price changes for gpt-5 and claude-haiku-5.5.");
  });
});

describe("provider_launched", () => {
  const legacyKinds = ["model_released", "gateway_available", "price_changed", "deprecation_announced", "provider_added"];

  it("has a label and a phrase", () => {
    expect(EVENT_LABELS.provider_launched).toMatchObject({ title: "New providers on Phaseo", description: "A provider joins Phaseo with its models" });
    expect(describeRule({ ...EMPTY_RULE, events: ["provider_launched"] }, names)).toBe("Notify me about new providers on Phaseo.");
  });

  it("is offered only by servers that list it", () => {
    expect(availableEventKinds([...legacyKinds, "provider_launched"])).toContain("provider_launched");
    expect(availableEventKinds(legacyKinds)).toEqual(legacyKinds);
    expect(availableEventKinds(undefined)).toEqual(legacyKinds);
  });

  it("is left out when saving to a server that would reject it", () => {
    expect(savableEvents(["model_released", "provider_launched"], legacyKinds)).toEqual(["model_released"]);
    expect(savableEvents(["model_released", "provider_launched"], null)).toEqual(["model_released"]);
    expect(savableEvents(["model_released", "provider_launched"], [...legacyKinds, "provider_launched"])).toEqual(["model_released", "provider_launched"]);
  });

  it("keeps kinds the server knows and this build doesn't", () => {
    expect(savableEvents(["model_released", "benchmark_published"], [...legacyKinds, "benchmark_published"])).toEqual(["model_released", "benchmark_published"]);
    expect(describeRule({ ...EMPTY_RULE, events: ["benchmark_published"] }, names)).toBe("Notify me about other updates.");
  });
});

describe("validateRule", () => {
  it("requires labs when the rule is limited to some", () => {
    expect(validateRule({ ...EMPTY_RULE, labs: { mode: "only", ids: [] } })).toBe("Pick the labs to include.");
    expect(validateRule({ ...EMPTY_RULE, labs: { mode: "except", ids: ["qwen"] } })).toBeNull();
  });
});
