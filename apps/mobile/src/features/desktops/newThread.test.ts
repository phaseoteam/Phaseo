import { initialChoice, newThreadModel, threadModel, threadModelLabel, type ModelList } from "./newThread";

const list: ModelList = {
  models: [
    { id: "gpt-6.1", name: "GPT-6.1", efforts: [{ id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "xhigh", label: "Extra high" }], defaultEffort: "medium" },
    { id: "gpt-6.1-mini", name: "GPT-6.1 mini" },
  ],
  selected: { model: "gpt-6.1", reasoningEffort: "low" },
};

describe("a new thread's model", () => {
  it("starts on the computer's own choice and sends nothing while that's kept", () => {
    expect(initialChoice(list)).toEqual({ model: "gpt-6.1", effort: "low" });
    expect(newThreadModel(list, initialChoice(list))).toEqual({});
  });

  it("sends only what changed, naming the model's default effort when the computer's choice set another", () => {
    expect(newThreadModel(list, { model: "gpt-6.1", effort: "xhigh" })).toEqual({ reasoningEffort: "xhigh" });
    expect(newThreadModel(list, { model: "gpt-6.1", effort: null })).toEqual({ reasoningEffort: "medium" });
    expect(newThreadModel(list, { model: "gpt-6.1-mini", effort: null })).toEqual({ model: "gpt-6.1-mini" });
    expect(newThreadModel({ ...list, selected: { model: "gpt-6.1" } }, { model: "gpt-6.1", effort: null })).toEqual({});
  });

  it("leaves the computer to choose when it couldn't list its models", () => {
    expect(newThreadModel(null, { model: "gpt-6.1", effort: "low" })).toEqual({});
    expect(newThreadModel(list, { model: "gone", effort: null })).toEqual({});
  });
});

describe("an existing thread's model", () => {
  it("shows read-only by name with its effort, or by id before the phone has the computer's list", () => {
    expect(threadModelLabel({ model: "gpt-6.1", reasoningEffort: "xhigh" }, list.models)).toBe("GPT-6.1 · Extra high");
    expect(threadModelLabel({ model: "claude-opus-5-5", reasoningEffort: "high" })).toBe("claude-opus-5-5 · High");
    expect(threadModelLabel({ model: "gpt-6.1-mini" }, list.models)).toBe("GPT-6.1 mini");
    expect(threadModelLabel({})).toBeNull();
    expect(threadModel({ model: "gpt-6.1", reasoningEffort: "xhigh" }, list.models)).toEqual({ model: "GPT-6.1", effort: "Extra high", others: 0 });
  });
});
