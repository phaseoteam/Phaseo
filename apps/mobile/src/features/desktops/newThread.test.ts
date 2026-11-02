import { choiceIn, choiceLabel, initialChoice, newThreadModel, sheetTabs, tabOf, threadModel, threadModelLabel, threadSheetRows, type ModelList, type ThreadSheetRow } from "./newThread";

const codex = [
  { id: "gpt-6.1", name: "GPT-6.1", efforts: [{ id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "xhigh", label: "Extra high" }], defaultEffort: "medium" },
  { id: "gpt-6.1-mini", name: "GPT-6.1 mini" },
  { id: "gpt-5", name: "GPT-5", legacy: true as const },
];

/** What a computer from before agents sent: one agent's models. */
const old: ModelList = { models: codex.slice(0, 2), selected: { model: "gpt-6.1", reasoningEffort: "low" } };

/** A computer with Phaseo, Codex and Claude Code, where Claude Code isn't signed in. */
const list: ModelList = {
  models: codex,
  selected: { harness: "codex", model: "gpt-6.1", reasoningEffort: "low" },
  agents: [
    { harness: "phaseo", name: "Phaseo", source: "phaseo", accountId: "acc", models: [
      { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", releaseDate: "2026-09-10" },
      { id: "openai/gpt-6.1", name: "GPT-6.1", releaseDate: "2026-10-02" },
      { id: "google/gemini-4", name: "Gemini 4", releaseDate: "2026-10-20" },
      { id: "mystery/model", name: "Mystery" },
    ] },
    { harness: "codex", name: "Codex", source: "local", models: codex },
    { harness: "claude", name: "Claude Code", source: "local", models: [], error: "Not signed in on the computer." },
  ],
  favourites: ["codex:gpt-6.1-mini", "phaseo:google/gemini-4"],
  permissionMode: "accept-edits",
};
const shape = (rows: ThreadSheetRow[]) => rows.map((row) => (row.type === "heading" ? `# ${row.title}` : row.type === "model" ? row.item.model.id : row.type === "note" ? `! ${row.text}` : `+ ${row.label ?? row.hidden}`));

describe("a new thread's model on a computer that lists agents", () => {
  it("starts on the computer's choice, in its agent's tab", () => {
    expect(initialChoice(list)).toEqual({ harness: "codex", model: "gpt-6.1", effort: "low" });
    expect(sheetTabs(list)).toEqual(["phaseo", "local"]);
    expect(tabOf(list, initialChoice(list))).toBe("local");
    expect(choiceLabel(list, initialChoice(list))).toEqual({ model: "GPT-6.1", effort: "Low", others: 0 });
  });

  it("names the agent, model and effort, the model's default by name", () => {
    expect(newThreadModel(list, initialChoice(list))).toEqual({ harness: "codex", model: "gpt-6.1", reasoningEffort: "low" });
    expect(newThreadModel(list, { harness: "codex", model: "gpt-6.1", effort: null })).toEqual({ harness: "codex", model: "gpt-6.1", reasoningEffort: "medium" });
    expect(newThreadModel(list, { harness: "phaseo", accountId: "acc", model: "openai/gpt-6.1", effort: null })).toEqual({ harness: "phaseo", accountId: "acc", model: "openai/gpt-6.1" });
    // A model its agent didn't list, or an effort the model doesn't offer, isn't sent.
    expect(newThreadModel(list, { harness: "claude", model: "claude-opus-5-5", effort: null })).toEqual({});
    expect(newThreadModel(list, { harness: "codex", model: "gpt-6.1-mini", effort: "high" })).toEqual({ harness: "codex", model: "gpt-6.1-mini" });
  });

  it("keeps a pick across modes while it's still offered", () => {
    const pick = { harness: "phaseo", accountId: "acc", model: "google/gemini-4", effort: null };
    expect(choiceIn(list, pick)).toBe(pick);
    expect(choiceIn({ ...list, agents: list.agents!.slice(1) }, pick)).toEqual(initialChoice(list));
  });

  it("lists Phaseo's models after the window's favourites, by release month, newest first", () => {
    expect(shape(threadSheetRows({ list, tab: "phaseo" }))).toEqual([
      "# Favourites", "google/gemini-4",
      "# October 2026", "google/gemini-4", "openai/gpt-6.1",
      "# September 2026", "anthropic/claude-sonnet-5",
      "# Other", "mystery/model",
    ]);
  });

  it("lists each agent's models under its name, older ones folded, and says why an agent has none", () => {
    expect(shape(threadSheetRows({ list, tab: "local" }))).toEqual([
      "# Favourites", "gpt-6.1-mini",
      "# Codex", "gpt-6.1", "gpt-6.1-mini", "+ 1 older",
      "! Claude Code: Not signed in on the computer.",
    ]);
    expect(shape(threadSheetRows({ list, tab: "local", olderOpen: ["codex"] })).slice(2, 7)).toEqual(["# Codex", "gpt-6.1", "gpt-6.1-mini", "gpt-5", "+ Hide older models"]);
  });

  it("searches the tab's models, older ones included", () => {
    expect(shape(threadSheetRows({ list, tab: "local", query: "gpt-5" }))).toEqual(["# Results", "gpt-5"]);
    expect(shape(threadSheetRows({ list, tab: "phaseo", query: "gemini" }))).toEqual(["# Results", "google/gemini-4"]);
  });
});

describe("a new thread's model on a computer from before agents", () => {
  it("shows its models as one agent and sends only what changed", () => {
    expect(initialChoice(old)).toEqual({ harness: "", model: "gpt-6.1", effort: "low" });
    expect(sheetTabs(old)).toEqual(["local"]);
    expect(newThreadModel(old, initialChoice(old))).toEqual({});
    expect(newThreadModel(old, { harness: "", model: "gpt-6.1", effort: "xhigh" })).toEqual({ reasoningEffort: "xhigh" });
    expect(newThreadModel(old, { harness: "", model: "gpt-6.1", effort: null })).toEqual({ reasoningEffort: "medium" });
    expect(newThreadModel(old, { harness: "", model: "gpt-6.1-mini", effort: null })).toEqual({ model: "gpt-6.1-mini" });
    expect(newThreadModel({ ...old, selected: { model: "gpt-6.1" } }, { harness: "", model: "gpt-6.1", effort: null })).toEqual({});
  });

  it("leaves the computer to choose when it couldn't list its models", () => {
    expect(newThreadModel(null, { harness: "", model: "gpt-6.1", effort: "low" })).toEqual({});
    expect(newThreadModel(old, { harness: "", model: "gone", effort: null })).toEqual({});
  });
});

describe("an existing thread's model", () => {
  it("shows read-only by name with its effort, or by id before the phone has the computer's list", () => {
    expect(threadModelLabel({ model: "gpt-6.1", reasoningEffort: "xhigh" }, codex)).toBe("GPT-6.1 · Extra high");
    expect(threadModelLabel({ model: "claude-opus-5-5", reasoningEffort: "high" })).toBe("claude-opus-5-5 · High");
    expect(threadModelLabel({ model: "gpt-6.1-mini" }, codex)).toBe("GPT-6.1 mini");
    expect(threadModelLabel({})).toBeNull();
    expect(threadModel({ model: "gpt-6.1", reasoningEffort: "xhigh" }, codex)).toEqual({ model: "GPT-6.1", effort: "Extra high", others: 0 });
  });
});
