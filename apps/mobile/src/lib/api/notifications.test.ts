import { parseNotificationSettings } from "./notifications";

const rule = {
  id: "8f0c4c39-6a52-4b8e-9d3e-0c8f6b6c2a11",
  name: "Every new model",
  enabled: true,
  action: "notify",
  events: ["model_released"],
  labs: { mode: "all", ids: [] },
  providers: { mode: "all", ids: [] },
  models: [],
  inputModalities: [],
  outputModalities: [],
  onlyOnPhaseo: false,
  includeFreeVariants: false,
  position: 0,
};

// What today's server returns: no categories, five event kinds.
const today = { enabled: true, quietHours: null, dailyCap: 10, deviceRegistered: true, rules: [rule], eventKinds: ["model_released", "gateway_available", "price_changed", "deprecation_announced", "provider_added"] };

describe("parseNotificationSettings", () => {
  it("reads today's server, with no categories", () => {
    const settings = parseNotificationSettings(today);
    expect(settings.categories).toBeNull();
    expect(settings.eventKinds).not.toContain("provider_launched");
    expect(settings.rules).toHaveLength(1);
  });

  it("fills in default categories from a push v2 server", () => {
    const settings = parseNotificationSettings({ ...today, categories: { money: false }, eventKinds: [...today.eventKinds, "provider_launched"] });
    expect(settings.categories).toMatchObject({ money: false, digest: true, "new-models": true });
    expect(settings.eventKinds).toContain("provider_launched");
  });

  it("keeps rules whose kinds this build doesn't know", () => {
    const settings = parseNotificationSettings({ ...today, rules: [{ ...rule, events: ["provider_launched", "benchmark_published"] }] });
    expect(settings.rules[0]?.events).toEqual(["provider_launched", "benchmark_published"]);
  });
});
