import { labFilterName, notificationTarget, targetForHref } from "./links";

describe("targetForHref", () => {
  it("opens model pages", () => {
    expect(targetForHref("/models/openai/gpt-6-astra")).toEqual({ kind: "model", id: "openai/gpt-6-astra" });
    expect(targetForHref("/models/openai/gpt-oss-120b:free")).toEqual({ kind: "model", id: "openai/gpt-oss-120b:free" });
    expect(targetForHref("/models/openai/gpt-6-astra/pricing?ref=push#top")).toEqual({ kind: "model", id: "openai/gpt-6-astra" });
  });

  it("opens a lab as Models filtered to it", () => {
    expect(targetForHref("/labs/deepseek")).toEqual({ kind: "lab", slug: "deepseek" });
    expect(targetForHref("/organisations/deepseek/models")).toEqual({ kind: "lab", slug: "deepseek" });
  });

  it("opens provider pages", () => {
    expect(targetForHref("/providers/groq")).toEqual({ kind: "provider", id: "groq" });
    expect(targetForHref("/api-providers/groq")).toEqual({ kind: "provider", id: "groq" });
  });

  it("opens Home for / and anything it doesn't know", () => {
    for (const href of ["/", "/models", "/models/openai", "/labs", "/pricing", "/settings/keys"]) {
      expect(targetForHref(href)).toEqual({ kind: "home" });
    }
  });

  it("decodes encoded parts", () => {
    expect(targetForHref("/models/qwen/qwen3.8-max%400902")).toEqual({ kind: "model", id: "qwen/qwen3.8-max@0902" });
  });
});

describe("notificationTarget", () => {
  it("follows href, as single pushes do", () => {
    expect(notificationTarget({ href: "/models/openai/gpt-6-astra", kind: "model_released", category: "new-models", modelId: "openai/gpt-6-astra", group: null }))
      .toEqual({ kind: "model", id: "openai/gpt-6-astra" });
    expect(notificationTarget({ href: "/", kind: "test", modelId: null })).toEqual({ kind: "home" });
  });

  it("opens the lab's models for a release summary, whatever the href", () => {
    expect(notificationTarget({ href: "/models/deepseek/deepseek-v5", group: { key: "release:deepseek", count: 12 } })).toEqual({ kind: "lab", slug: "deepseek" });
    expect(notificationTarget({ href: "/models/openai/gpt-6-astra", group: { key: "release:openai:2026-10-19", count: 2 } })).toEqual({ kind: "lab", slug: "openai" });
  });

  it("opens the provider for a provider summary, and the model for repeated price changes", () => {
    expect(notificationTarget({ href: "/models/meta/muse-wonder-1.0", group: { key: "provider:groq", count: 4 } })).toEqual({ kind: "provider", id: "groq" });
    expect(notificationTarget({ href: "/", group: { key: "price:openai/gpt-6-astra", count: 3 } })).toEqual({ kind: "model", id: "openai/gpt-6-astra" });
  });

  it("treats a group of one, or an unknown group, as a single push", () => {
    expect(notificationTarget({ href: "/models/openai/gpt-6-astra", group: { key: "release:openai", count: 1 } })).toEqual({ kind: "model", id: "openai/gpt-6-astra" });
    expect(notificationTarget({ href: "/providers/groq", group: { key: "weather:rain", count: 5 } })).toEqual({ kind: "provider", id: "groq" });
    expect(notificationTarget({ href: "/labs/openai", group: "release:openai" })).toEqual({ kind: "lab", slug: "openai" });
  });

  it("falls back to modelId, and to nothing without either", () => {
    expect(notificationTarget({ modelId: "anthropic/claude-haiku-5.5" })).toEqual({ kind: "model", id: "anthropic/claude-haiku-5.5" });
    expect(notificationTarget({ href: "https://phaseo.app/models/a/b" })).toBeNull();
    expect(notificationTarget({})).toBeNull();
    expect(notificationTarget(null)).toBeNull();
  });
});

describe("labFilterName", () => {
  const models = [
    { model_id: "deepseek/deepseek-v5", organisation_id: "deepseek", organisation_name: "DeepSeek" },
    { model_id: "meta/muse-wonder-1.0", organisation_id: "meta", organisation_name: null },
    { model_id: "mistral/mistral-large-3", organisation_id: null, organisation_name: "Mistral AI" },
  ];

  it("finds the display name the Labs filter uses", () => {
    expect(labFilterName(models, "deepseek")).toBe("DeepSeek");
    expect(labFilterName(models, "meta")).toBe("meta");
    expect(labFilterName(models, "mistral")).toBe("Mistral AI");
  });

  it("is null for a lab the catalogue doesn't have", () => {
    expect(labFilterName(models, "newlab")).toBeNull();
  });
});
