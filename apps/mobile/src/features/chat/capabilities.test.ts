import { getRouteReasoningEffortSupport, modelReasoningSupport, modelServiceTierSupport, resolveReasoningEffort, routeReasoningSupport, routeServiceTierSupport, serviceTierOptions } from "./capabilities";
import { chatErrorPresentation } from "./errors";

describe("reasoning effort support (the website's reasoningEffortSupport.ts)", () => {
  test("reads supported values from a route's params, preferring the effort parameter", () => {
    // The shape /api/_web/gateway/models returns (aion-labs/aion-2.0).
    const params = [
      { param_id: "reasoning", provider_default: "medium" },
      { param_id: "reasoning_effort", values: ["none", "low", "medium", "high"], supported_values: ["none", "low", "medium", "high"], provider_default: "medium" },
    ];
    expect(getRouteReasoningEffortSupport(params)).toEqual({ supportedValues: ["none", "low", "medium", "high"], defaultValue: "medium" });
    expect(routeReasoningSupport({ "text.generate": params, "image.generate": [] })).toEqual({ supportedValues: ["none", "low", "medium", "high"], defaultValue: "medium" });
  });

  test("reads the legacy object form, and nothing when no values are listed", () => {
    expect(getRouteReasoningEffortSupport({ reasoning: { effort: { enum: ["high", "LOW", "bogus"] } } })).toEqual({ supportedValues: ["low", "high"] });
    expect(getRouteReasoningEffortSupport([{ param_id: "reasoning" }])).toBeNull();
    expect(routeReasoningSupport(null)).toBeNull();
  });

  test("on Auto only efforts every provider accepts are offered; one provider offers its own", () => {
    const routes = [
      { providerId: "a", reasoning: { supportedValues: ["low" as const, "medium" as const, "high" as const, "xhigh" as const] }, serviceTiers: null },
      { providerId: "b", reasoning: { supportedValues: ["low" as const, "medium" as const, "high" as const] }, serviceTiers: null },
    ];
    expect(modelReasoningSupport(routes, "auto")?.supportedValues).toEqual(["low", "medium", "high"]);
    expect(modelReasoningSupport(routes, "a")?.supportedValues).toEqual(["low", "medium", "high", "xhigh"]);
    expect(modelReasoningSupport([], "auto")).toBeNull();
  });

  test("an unsupported effort falls back to the default, then medium, then the first", () => {
    expect(resolveReasoningEffort("max", { supportedValues: ["low", "high"], defaultValue: "high" })).toBe("high");
    expect(resolveReasoningEffort("max", { supportedValues: ["low", "medium"] })).toBe("medium");
    expect(resolveReasoningEffort("max", { supportedValues: ["low", "high"] })).toBe("low");
    expect(resolveReasoningEffort("instant", null)).toBe("medium");
  });
});

describe("service tier support (the website's serviceTierSupport.ts)", () => {
  test("a route's listed tiers win; fast means priority; unknown tiers are ignored", () => {
    expect(routeServiceTierSupport({ serviceTiers: ["standard", "fast", "flex", "batch"] })).toEqual({ supportedValues: ["standard", "priority", "flex"] });
    expect(routeServiceTierSupport({ serviceTiers: [] })).toEqual({ supportedValues: ["standard"] });
    expect(routeServiceTierSupport({ capabilities: ["text.generate"] })).toEqual({ supportedValues: ["standard"] });
  });

  test("tiers are offered only where every candidate route sells them", () => {
    const routes = [
      { providerId: "openai", reasoning: null, serviceTiers: { supportedValues: ["standard" as const, "priority" as const, "ultrafast" as const] } },
      { providerId: "azure", reasoning: null, serviceTiers: { supportedValues: ["standard" as const] } },
    ];
    expect(serviceTierOptions(modelServiceTierSupport(routes, "auto"))).toEqual(["standard"]);
    expect(serviceTierOptions(modelServiceTierSupport(routes, "openai"))).toEqual(["standard", "priority", "ultrafast"]);
    expect(serviceTierOptions(null)).toEqual(["standard"]);
  });
});

describe("error notices (the website's chatRequestErrorPresentation.ts)", () => {
  test("credit, sign-in, busy and stream errors get their own next steps", () => {
    expect(chatErrorPresentation({ code: "insufficient_credits", status: 402 })).toMatchObject({ kind: "payment", canRetry: false });
    expect(chatErrorPresentation({ code: "signed_out", status: 401 })).toMatchObject({ kind: "authentication" });
    expect(chatErrorPresentation({ code: "rate_limited", status: 429 })).toMatchObject({ kind: "rate-limit", canRetry: true, canChooseModel: true });
    expect(chatErrorPresentation({ code: "stream_dropped", status: null })).toMatchObject({ kind: "stream", canRetry: true });
    expect(chatErrorPresentation({ code: "max_output_tokens", status: null })).toMatchObject({ kind: "stream", canOpenSettings: true });
    expect(chatErrorPresentation({ code: null, status: null })).toMatchObject({ kind: "generic", title: "Request failed" });
  });
});
