import { sidebarMove } from "@/components/shell/navigation";
import { DEFAULT_FILTERS, type CatalogueFilters } from "@/lib/catalogue";
import { labFilterName, labFilters, notificationRoute, notificationTarget, openLabModels, targetForHref, type OpenLabDeps } from "./links";

describe("notificationRoute", () => {
  it("pushes a model release or price change over whatever is showing", () => {
    expect(notificationRoute(notificationTarget({ href: "/models/openai/gpt-6-astra", kind: "model_released" })!)).toEqual({ href: "/models/openai/gpt-6-astra", open: "push" });
    expect(notificationRoute({ kind: "provider", id: "groq cloud" })).toEqual({ href: "/providers/groq%20cloud", open: "push" });
  });

  it("opens Models for a lab summary or anything else, as the sidebar would", () => {
    expect(notificationRoute(notificationTarget({ href: "/", group: { key: "release:deepseek", count: 12 } })!)).toEqual({ href: "/models", open: "screen" });
    expect(notificationRoute(notificationTarget({ href: "/", kind: "test" })!)).toEqual({ href: "/models", open: "screen" });
  });

  it("opens an approval or needs-you tap on its thread in Code, with the Code list and Chat behind it", () => {
    const route = notificationRoute(notificationTarget({ desktopId: "desk-1", chatId: "c2" })!);
    expect(route).toEqual({ href: "/code/desk-1/c2", open: "screen" });
    // Pushed over Chat (the thread opens with `withAnchor`, so the Code list is under it).
    expect(sidebarMove("/chat/abc", route.href, true, ["/chat"])).toBe("push");
    // A tap that launched the app arrives before `/` has redirected to Chat.
    expect(sidebarMove("/", route.href, true, ["/"])).toBe("push");
    // From another thread it takes that one's place over the same list; from Models, Code takes Models' place.
    expect(sidebarMove("/code/desk-1/c1", route.href, true, ["/chat", "/code"])).toBe("replace");
    expect(sidebarMove("/models/openai/gpt-6-astra", route.href, true, ["/chat", "/models"])).toBe("replace");
  });
});

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

  it("opens Models, where Home's releases now are, for / and anything it doesn't know", () => {
    for (const href of ["/", "/models", "/models/openai", "/labs", "/pricing", "/settings/keys"]) {
      expect(targetForHref(href)).toEqual({ kind: "models" });
    }
  });

  it("decodes encoded parts", () => {
    expect(targetForHref("/models/qwen/qwen3.8-max%400902")).toEqual({ kind: "model", id: "qwen/qwen3.8-max@0902" });
  });
});

describe("notificationTarget", () => {
  it("opens the chat a computer's notification is about", () => {
    expect(notificationTarget({ desktopId: "desk-1", chatId: "c2" })).toEqual({ kind: "desktop-chat", desktopId: "desk-1", chatId: "c2" });
  });

  it("follows href, as single pushes do", () => {
    expect(notificationTarget({ href: "/models/openai/gpt-6-astra", kind: "model_released", category: "new-models", modelId: "openai/gpt-6-astra", group: null }))
      .toEqual({ kind: "model", id: "openai/gpt-6-astra" });
    expect(notificationTarget({ href: "/", kind: "test", modelId: null })).toEqual({ kind: "models" });
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

describe("openLabModels", () => {
  const cachedModels = [{ model_id: "openai/gpt-6-astra", organisation_id: "openai", organisation_name: "OpenAI" }];
  const freshModels = [...cachedModels, { model_id: "newlab/first-model", organisation_id: "newlab", organisation_name: "New Lab" }];
  // Someone browsing with their own filters when the notification is tapped.
  const previous: CatalogueFilters = { ...DEFAULT_FILTERS, query: "claude", availability: "free", organisations: ["Anthropic"], sort: "price" };

  function setup(refresh: OpenLabDeps["refresh"]) {
    let filters = previous;
    const events: string[] = [];
    const deps: OpenLabDeps = {
      cached: cachedModels,
      refresh: async () => { events.push("refresh"); return refresh(); },
      filters: { get: () => filters, set: (next) => { filters = next; events.push(`set:${next.organisations.join(",") || `query=${next.query}`}`); } },
      navigate: () => { events.push(`navigate with ${filters.organisations.join(",") || `query=${filters.query}`}`); },
    };
    return { deps, events, filters: () => filters, setFilters: (next: CatalogueFilters) => { filters = next; } };
  }

  it("filters to a cached lab before opening Models, without a refresh", async () => {
    const { deps, events, filters } = setup(async () => freshModels);
    await openLabModels("openai", deps);
    expect(events).toEqual(["set:OpenAI", "navigate with OpenAI"]);
    expect(filters()).toEqual(labFilters("OpenAI", "openai"));
  });

  it("shows a cleared slug search before waiting for fresh data, then the lab once it lands", async () => {
    let land!: (models: typeof freshModels) => void;
    const { deps, events, filters } = setup(() => new Promise((resolve) => { land = resolve; }));
    const opening = openLabModels("newlab", deps);
    // Still waiting on the refresh: the user already sees the slug search, not their old filters.
    expect(events).toEqual(["set:query=newlab", "navigate with query=newlab", "refresh"]);
    expect(filters()).toEqual({ ...DEFAULT_FILTERS, query: "newlab" });
    land(freshModels);
    await opening;
    expect(filters()).toEqual({ ...DEFAULT_FILTERS, organisations: ["New Lab"] });
  });

  it("keeps the slug search when the refresh fails or doesn't find the lab", async () => {
    for (const refresh of [async () => { throw new Error("offline"); }, async () => cachedModels]) {
      const { deps, filters } = setup(refresh);
      await openLabModels("newlab", deps);
      expect(filters()).toEqual({ ...DEFAULT_FILTERS, query: "newlab" });
    }
  });

  it("leaves filters the user changed while it waited", async () => {
    let land!: (models: typeof freshModels) => void;
    const { deps, filters, setFilters } = setup(() => new Promise((resolve) => { land = resolve; }));
    const opening = openLabModels("newlab", deps);
    const typed = { ...DEFAULT_FILTERS, query: "new lab first" };
    setFilters(typed);
    land(freshModels);
    await opening;
    expect(filters()).toBe(typed);
  });

  it("works without a cached catalogue", async () => {
    const { deps, events, filters } = setup(async () => freshModels);
    await openLabModels("openai", { ...deps, cached: null });
    expect(events[0]).toBe("set:query=openai");
    expect(filters()).toEqual({ ...DEFAULT_FILTERS, organisations: ["OpenAI"] });
  });
});
