import { describeRule, EMPTY_RULE, validateRule } from "./rules";

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

describe("validateRule", () => {
  it("requires labs when the rule is limited to some", () => {
    expect(validateRule({ ...EMPTY_RULE, labs: { mode: "only", ids: [] } })).toBe("Pick the labs to include.");
    expect(validateRule({ ...EMPTY_RULE, labs: { mode: "except", ids: ["qwen"] } })).toBeNull();
  });
});
