import type { ChatModelOption } from "./modelOptions";
import { chatSheetSections, effortRows, effortSummary, modelControlLabel, modelSheetRows } from "./modelSheetRows";

const option = (modelId: string, releaseDate: string, more: Partial<ChatModelOption> = {}): ChatModelOption => ({
  modelId, label: modelId.split("/")[1]!, orgId: modelId.split("/")[0]!, orgName: modelId.split("/")[0]!, releaseDate, status: "active", free: false,
  inputPrice: 1, outputPrice: 2, contextWindow: 128_000, inputModalities: ["text"], providerIds: [], providerNames: [], routes: [], ...more,
});
const shape = <T,>(rows: ReturnType<typeof modelSheetRows<T>>, idOf: (item: T) => string) => rows.map((row) => (row.type === "heading" ? `# ${row.title}` : row.type === "more" ? `more ${row.hidden}` : idOf(row.item)));

describe("the model sheet's list", () => {
  const options = [
    option("anthropic/claude-opus-5-5", "2026-10-20T00:00:00Z"),
    option("openai/gpt-6-astra", "2026-10-05T00:00:00Z"),
    option("google/gemini-4-argon", "2026-09-12T00:00:00Z"),
    option("z-ai/glm-5-3", "2026-09-02T00:00:00Z", { free: true }),
    option("qwen/qwen-4", "2026-11-20T00:00:00Z", { status: "coming_soon" }),
  ];
  const nowMs = Date.parse("2026-11-01T00:00:00Z");
  const sections = (query = "", recents = ["google/gemini-4-argon", "openai/gpt-6-astra", "qwen/qwen-4"]) =>
    chatSheetSections({ options, query, favourites: ["openai/gpt-6-astra"], recents, filters: { free: false, new: false }, nowMs });
  const ids = (item: ChatModelOption) => item.modelId;

  it("puts favourites, then recent models, first, then the picker's months, and lists nothing twice", () => {
    const { pinned, rest } = sections();
    expect(shape(modelSheetRows({ pinned, rest, idOf: ids }), ids)).toEqual([
      "# Favourites", "openai/gpt-6-astra",
      // A recent favourite stays under Favourites; a model not on Phaseo yet isn't a recent pick.
      "# Recent", "google/gemini-4-argon",
      "# October 2026", "anthropic/claude-opus-5-5",
      "# September 2026", "z-ai/glm-5-3",
      "# Coming soon · November 2026", "qwen/qwen-4",
    ]);
  });

  it("shows a Show more row instead of the whole catalogue, and everything once expanded", () => {
    const { pinned, rest } = sections();
    expect(shape(modelSheetRows({ pinned, rest, idOf: ids, limit: 1 }), ids)).toEqual(["# Favourites", "openai/gpt-6-astra", "# Recent", "google/gemini-4-argon", "# October 2026", "anthropic/claude-opus-5-5", "more 2"]);
    expect(shape(modelSheetRows({ pinned, rest, idOf: ids, limit: 1, expanded: true }), ids)).not.toContain("more 2");
  });

  it("searches as the picker ranks, without the pinned sections", () => {
    const { pinned, rest } = sections("gemini");
    expect(shape(modelSheetRows({ pinned, rest, idOf: ids }), ids)).toEqual(["# Results: 1", "google/gemini-4-argon"]);
  });
});

describe("the effort rows", () => {
  const efforts = [{ id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "high", label: "High" }];

  it("mark the model's default, which is picked by storing nothing", () => {
    expect(effortRows(efforts, "medium", null)).toEqual([
      { id: "low", label: "Low", isDefault: false, selected: false },
      { id: null, label: "Medium", isDefault: true, selected: true },
      { id: "high", label: "High", isDefault: false, selected: false },
    ]);
    expect(effortRows(efforts, "medium", "high").map((row) => row.selected)).toEqual([false, false, true]);
  });

  it("lead with a Default row when the model's default isn't one of the levels", () => {
    expect(effortRows(efforts, undefined, null)[0]).toEqual({ id: null, label: "Default", isDefault: true, selected: true });
    // A stored level the model no longer offers reads as the default.
    expect(effortRows(efforts, null, "max")[0]?.selected).toBe(true);
  });

  it("are empty for a model without levels", () => {
    expect(effortRows([], "medium", "high")).toEqual([]);
    expect(effortSummary([], "medium", "high")).toBeNull();
  });
});

describe("the composer's model control", () => {
  it("shows the model and its effort, the model alone without levels, and how many more answer", () => {
    expect(modelControlLabel("Claude Opus 5.5", effortSummary([{ id: "high", label: "High" }], undefined, "high"))).toBe("Claude Opus 5.5 · High");
    expect(modelControlLabel("Claude Opus 5.5", effortSummary([{ id: "high", label: "High" }], undefined, null))).toBe("Claude Opus 5.5 · Default");
    expect(modelControlLabel("Phaseo Free", effortSummary([], undefined, null))).toBe("Phaseo Free");
    expect(modelControlLabel("GPT-6 Astra", "Medium", 2)).toBe("GPT-6 Astra · Medium +2");
  });
});
