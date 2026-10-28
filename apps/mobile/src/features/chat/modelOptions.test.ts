import type { ModelCard } from "@/lib/api/models";
import type { ChatRoute, GatewayChatModel } from "./gatewayModels";
import { buildChatModelOptions, compareByReleaseDateDesc, defaultFavourites, groupByReleaseMonth, isNewModel, normaliseFavouriteId, pickerSections, rankModels, searchScore, toggleFavourite, type ChatModelOption } from "./modelOptions";

function option(modelId: string, overrides: Partial<ChatModelOption> = {}): ChatModelOption {
  const [orgId = "lab", ...rest] = modelId.split("/");
  return {
    modelId,
    label: rest.join("/"),
    orgId,
    orgName: orgId,
    releaseDate: "2026-01-01T00:00:00Z",
    status: "active",
    free: false,
    inputPrice: 1,
    outputPrice: 2,
    contextWindow: 128_000,
    inputModalities: ["text"],
    providerIds: [],
    providerNames: [],
    routes: [],
    ...overrides,
  };
}

const NOW = Date.parse("2026-10-18T12:00:00Z");
const filters = { free: false, new: false };

describe("ranked search (RoomModelSelector's computeOptionSearchScore)", () => {
  const gpt = option("openai/gpt-6", { label: "GPT-6", orgName: "OpenAI" });
  const gptMini = option("openai/gpt-6-mini", { label: "GPT-6 mini", orgName: "OpenAI" });
  const kimi = option("moonshotai/kimi-k3", { label: "Kimi K3", orgName: "Moonshot AI", providerIds: ["groq"], providerNames: ["Groq"] });

  test("an exact ID or name beats a prefix, which beats a match inside the name", () => {
    expect(searchScore(gpt, "openai/gpt-6")).toBeGreaterThan(searchScore(gptMini, "openai/gpt-6"));
    expect(searchScore(gpt, "gpt-6")).toBeGreaterThan(searchScore(gptMini, "gpt-6"));
    expect(rankModels([gptMini, kimi, gpt], "gpt-6").map((entry) => entry.modelId)).toEqual(["openai/gpt-6", "openai/gpt-6-mini"]);
  });

  test("labs and providers match too, and models with no match are left out", () => {
    expect(rankModels([gpt, kimi], "groq").map((entry) => entry.modelId)).toEqual(["moonshotai/kimi-k3"]);
    expect(rankModels([gpt, kimi], "moonshot").map((entry) => entry.modelId)).toEqual(["moonshotai/kimi-k3"]);
    expect(rankModels([gpt, kimi], "claude")).toEqual([]);
    expect(searchScore(gpt, "   ")).toBe(0);
  });

  test("ties go to models on Phaseo now, then to the newest", () => {
    const soon = option("openai/gpt-7", { label: "GPT-7", status: "coming_soon", releaseDate: "2026-12-01T00:00:00Z" });
    const older = option("openai/gpt-5", { label: "GPT-5", releaseDate: "2025-08-01T00:00:00Z" });
    const newer = option("openai/gpt-8", { label: "GPT-8", releaseDate: "2026-09-01T00:00:00Z" });
    // Same score for "openai": active beats coming soon (+10), then newest first.
    expect(rankModels([soon, older, newer], "openai").map((entry) => entry.label)).toEqual(["GPT-8", "GPT-5", "GPT-7"]);
  });
});

describe("favourites", () => {
  test("dated snapshots and punctuation fold into one ID, as on the website", () => {
    expect(normaliseFavouriteId("OpenAI/GPT-4o-2024-05-13")).toBe("openai/gpt-4o");
    expect(normaliseFavouriteId("google/gemini_3.8 flash")).toBe("google/gemini-3-8-flash");
  });

  test("starring appends and unstarring removes", () => {
    expect(toggleFavourite(["a/one"], "B/Two")).toEqual(["a/one", "b/two"]);
    expect(toggleFavourite(["a/one", "b/two"], "a/one")).toEqual(["b/two"]);
  });

  test("defaults are the website's featured models that the catalogue still has", () => {
    expect(defaultFavourites([option("openai/gpt-6-astra"), option("z-ai/glm-5.3"), option("other/model")])).toEqual(["z-ai/glm-5-3", "openai/gpt-6-astra"]);
  });

  test("favourites come first in the order they were starred, and leave the month groups", () => {
    const options = [
      option("a/newest", { releaseDate: "2026-10-10T00:00:00Z" }),
      option("b/middle", { releaseDate: "2026-09-15T00:00:00Z" }),
      option("c/oldest", { releaseDate: "2026-09-01T00:00:00Z" }),
    ];
    const sections = pickerSections({ options, query: "", favourites: ["c/oldest", "a/newest"], filters, nowMs: NOW });
    expect(sections.map((section) => [section.title, section.items.map((item) => item.modelId)])).toEqual([
      ["Favourites", ["c/oldest", "a/newest"]],
      ["September 2026", ["b/middle"]],
    ]);
  });
});

describe("release months", () => {
  test("newest first, undated last, ties by name", () => {
    const items = [option("x/b", { label: "B", releaseDate: null }), option("x/old", { label: "Old", releaseDate: "2025-01-01" }), option("x/a", { label: "A", releaseDate: null }), option("x/new", { label: "New", releaseDate: "2026-05-01" })];
    expect([...items].sort(compareByReleaseDateDesc).map((item) => item.label)).toEqual(["New", "Old", "A", "B"]);
  });

  test("groups by month in UTC, so a midnight release stays in its month", () => {
    const groups = groupByReleaseMonth([
      option("x/one", { releaseDate: "2026-10-01T00:00:00Z" }),
      option("x/two", { releaseDate: "2026-10-31T23:30:00Z" }),
      option("x/three", { releaseDate: "2026-09-30T23:59:00Z" }),
      option("x/four", { releaseDate: null }),
    ]);
    expect(groups.map((group) => [group.heading, group.items.length])).toEqual([["October 2026", 2], ["September 2026", 1], ["Unknown", 1]]);
  });

  test("models on Phaseo come by month, then coming-soon models by month", () => {
    const options = [
      option("x/soon", { status: "coming_soon", releaseDate: "2026-11-02T00:00:00Z" }),
      option("x/undated-soon", { status: "coming_soon", releaseDate: null }),
      option("x/oct", { releaseDate: "2026-10-02T00:00:00Z" }),
      option("x/aug", { releaseDate: "2026-08-02T00:00:00Z", status: "deprecated" }),
    ];
    expect(pickerSections({ options, query: "", favourites: [], filters, nowMs: NOW }).map((section) => [section.kind, section.title])).toEqual([
      ["month", "October 2026"],
      ["month", "August 2026"],
      ["coming-soon", "Coming soon · November 2026"],
      ["coming-soon", "Coming soon"],
    ]);
  });

  test("searching replaces the groups with one ranked list, and the Free and New filters apply", () => {
    const options = [option("x/free-one", { free: true, releaseDate: "2026-10-12T00:00:00Z" }), option("x/paid-one", { releaseDate: "2026-10-12T00:00:00Z" }), option("x/old-free", { free: true, releaseDate: "2026-01-01T00:00:00Z" })];
    expect(pickerSections({ options, query: "one", favourites: [], filters, nowMs: NOW })).toMatchObject([{ kind: "results", title: "Results: 2" }]);
    const freeNew = pickerSections({ options, query: "", favourites: [], filters: { free: true, new: true }, nowMs: NOW });
    expect(freeNew.flatMap((section) => section.items.map((item) => item.modelId))).toEqual(["x/free-one"]);
    expect(isNewModel("2026-10-10T00:00:00Z", NOW)).toBe(true);
    expect(isNewModel("2026-10-01T00:00:00Z", NOW)).toBe(false);
    expect(isNewModel("2026-09-01T00:00:00Z", NOW)).toBe(false);
  });
});

describe("options from the catalogue and the gateway", () => {
  const card = (model_id: string, overrides: Partial<ModelCard> = {}) => ({
    model_id,
    name: model_id.split("/")[1],
    organisation_id: model_id.split("/")[0],
    organisation_name: model_id.split("/")[0],
    gateway_status: "active",
    gateway_endpoints: ["text.generate"],
    gateway_input_modalities: ["text"],
    gateway_output_modalities: ["text"],
    gateway_features: [],
    gateway_tiers: [],
    gateway_provider_names: [],
    gateway_active_provider_names: [],
    context_lengths: [200_000],
    lowest_input_price: 3,
    lowest_output_price: 15,
    primary_date: "2026-03-01",
    ...overrides,
  }) as unknown as ModelCard;
  const route = (providerId: string): ChatRoute => ({ providerId, providerName: providerId, logoId: providerId, reasoning: null, serviceTiers: { supportedValues: ["standard"] }, inputPrice: 2, outputPrice: 8 });
  const gateway: GatewayChatModel[] = [
    { modelId: "lab/served", label: "Served", orgId: "lab", orgName: "Lab", releaseDate: "2026-04-01T00:00:00Z", inputModalities: ["text", "image"], routes: [route("p1"), route("p2")] },
    { modelId: "lab/gateway-only", label: "Gateway only", orgId: "lab", orgName: "Lab", releaseDate: null, inputModalities: ["text"], routes: [route("p1")] },
  ];

  test("joins catalogue facts with gateway routes, keeps free routers and drops retired models", () => {
    const options = buildChatModelOptions([
      card("lab/served"),
      card("phaseo/free", { gateway_endpoints: ["chat/completions"], lowest_input_price: 0, lowest_output_price: 0 }),
      card("lab/retired", { gateway_status: "retired" }),
      card("lab/deprecated", { gateway_status: "deprecated" }),
      card("lab/soon", { gateway_status: "coming_soon", gateway_endpoints: [] }),
      card("lab/soon-video", { gateway_status: "coming_soon", gateway_endpoints: [], gateway_output_modalities: ["video"] }),
    ], gateway);
    const byId = new Map(options.map((entry) => [entry.modelId, entry]));
    expect(byId.get("lab/served")).toMatchObject({ label: "served", contextWindow: 200_000, inputPrice: 3, releaseDate: "2026-04-01T00:00:00Z", providerIds: ["p1", "p2"] });
    expect(byId.get("lab/gateway-only")).toMatchObject({ label: "Gateway only", inputPrice: 2, outputPrice: 8, status: "active" });
    expect(byId.get("phaseo/free")).toMatchObject({ free: true, providerIds: [] });
    expect(byId.has("lab/retired")).toBe(false);
    expect(byId.has("lab/deprecated")).toBe(false);
    expect(byId.get("lab/soon")?.status).toBe("coming_soon");
    expect(byId.has("lab/soon-video")).toBe(false);
  });

  test("a deprecated model the gateway still serves stays pickable, marked deprecated", () => {
    const options = buildChatModelOptions([card("lab/served", { gateway_status: "deprecated" })], gateway);
    expect(options.find((entry) => entry.modelId === "lab/served")?.status).toBe("deprecated");
  });
});
