import { activeSectionAt, modelAccessLayout, modelPageSections, scrollTargetFor, supportsProvenanceVerification } from "./sections";

const live = { subscriptionOnly: false, showBenchmarks: true, showSubscriptions: false, status: "Available", isGatewayActive: true, showProviders: true, showVerification: false };

describe("model page sections", () => {
  test("a live model lists the website's sections in its order", () => {
    expect(modelPageSections(live)).toEqual(["providers", "performance", "pricing", "benchmarks", "activity", "apps", "uptime", "about", "faq"]);
  });

  test("a model not live on the gateway drops the traffic sections", () => {
    expect(modelPageSections({ ...live, isGatewayActive: false, showBenchmarks: false })).toEqual(["providers", "about", "faq"]);
  });

  test("subscription-only models put subscriptions first and hide providers", () => {
    const layout = modelAccessLayout({ hasSubscriptions: true, hasApiProviders: false });
    expect(layout).toEqual({ subscriptionOnly: true, canUseApi: false, showProviders: false });
    expect(modelPageSections({ ...live, subscriptionOnly: true, showSubscriptions: true, showProviders: layout.showProviders })).toEqual(["subscriptions", "benchmarks", "about", "faq"]);
  });

  test("retired models keep the archive sections only", () => {
    expect(modelPageSections({ ...live, status: "Retired", showSubscriptions: true })).toEqual(["benchmarks", "about", "subscriptions", "faq"]);
  });

  test("image and audio generators get Verification before About", () => {
    expect(supportsProvenanceVerification(["text", "image"])).toBe(true);
    expect(supportsProvenanceVerification(["audio_tts"])).toBe(true);
    expect(supportsProvenanceVerification(["text", "embeddings"])).toBe(false);
    expect(modelPageSections({ ...live, showVerification: true }).slice(-3)).toEqual(["verification", "about", "faq"]);
  });

  test("announced models with no providers still show the providers section", () => {
    expect(modelAccessLayout({ hasSubscriptions: false, hasApiProviders: false, status: "Announced" }).showProviders).toBe(true);
    expect(modelAccessLayout({ hasSubscriptions: null, hasApiProviders: false }).canUseApi).toBe(false);
  });
});

describe("section offsets", () => {
  const offsets = [{ id: "providers", y: 600 }, { id: "pricing", y: 1800 }, { id: "performance", y: 1200 }];

  test("the active section is the last one above the reading line", () => {
    expect(activeSectionAt(offsets, 0, 150)).toBe("providers");
    expect(activeSectionAt(offsets, 1100, 150)).toBe("performance");
    expect(activeSectionAt(offsets, 1700, 150)).toBe("pricing");
    expect(activeSectionAt([], 100, 150)).toBeNull();
  });

  test("jumping leaves the heading just under the pinned menu", () => {
    expect(scrollTargetFor(1200, 56)).toBe(1136);
    expect(scrollTargetFor(20, 56)).toBe(0);
  });
});
