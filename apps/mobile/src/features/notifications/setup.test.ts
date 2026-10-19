import type { NotificationRule, RuleInput } from "@/lib/api/notifications";
import { CATEGORIES, type Category } from "./channels";
import { EMPTY_RULE } from "./rules";
import { adminWorkspaces, applySetupPlan, categoriesFor, choicesFrom, describeChoices, lowBalanceThreshold, normalizeChoices, planIsEmpty, planSetup, sameChoices, SETUP_RULE_NAMES, setupRules, setupSteps, skipStep, splitRules, STARTER_CHOICES, STARTER_RULE, type SetupChoices, type SetupState, type SetupWrites } from "./setup";

const allOn = () => Object.fromEntries(CATEGORIES.map((category) => [category, true])) as Record<Category, boolean>;
const rule = (id: string, input: Partial<RuleInput> = {}): NotificationRule => ({ ...EMPTY_RULE, ...input, id, position: 0 });
const state = (rules: NotificationRule[] = [], extra: Partial<SetupState> = {}): SetupState => ({ rules, categories: allOn(), quietHours: null, dailyCap: 10, ...extra });

/** The settings API in memory: applies writes the way the server does, and records them. */
function fakeServer(initial: SetupState) {
  let current: SetupState = JSON.parse(JSON.stringify(initial));
  let nextId = 1;
  const writes: string[] = [];
  const api: SetupWrites = {
    createRule: async (input) => { writes.push("create"); current.rules.push({ ...input, id: `created-${nextId++}`, position: current.rules.length }); },
    updateRule: async (id, input) => { writes.push(`update ${id}`); current.rules = current.rules.map((entry) => (entry.id === id ? { ...entry, ...input } : entry)); },
    deleteRule: async (id) => {
      writes.push(`delete ${id}`);
      if (!current.rules.some((entry) => entry.id === id)) throw Object.assign(new Error("Not found"), { status: 404 });
      current.rules = current.rules.filter((entry) => entry.id !== id);
    },
    updateSettings: async (patch) => {
      writes.push("settings");
      current = {
        ...current,
        categories: current.categories ? { ...current.categories, ...patch.categories } : current.categories,
        quietHours: patch.quietHours !== undefined ? patch.quietHours : current.quietHours,
        dailyCap: patch.dailyCap ?? current.dailyCap,
      };
    },
  };
  return { api, writes, get state() { return current; } };
}

async function finish(choices: SetupChoices, server: ReturnType<typeof fakeServer>, admin = true) {
  await applySetupPlan(planSetup(choices, server.state, admin), server.api);
}

const custom = [
  rule("mine-mute", { name: "No Meta", action: "mute", events: ["model_released"], labs: { mode: "only", ids: ["meta"] } }),
  rule("mine-follow", { name: null, events: ["price_changed", "provider_added", "deprecation_announced"], models: ["openai/gpt-5"] }),
];

const variants: SetupChoices[] = [
  STARTER_CHOICES,
  { ...STARTER_CHOICES, alsoAvailable: true, prices: true, deprecations: true },
  { ...STARTER_CHOICES, modelNews: "labs", labs: ["openai", "anthropic"], alsoAvailable: true, prices: true },
  { ...STARTER_CHOICES, modelNews: "models", models: ["openai/gpt-5", "google/gemini-4-argon"], prices: true, deprecations: true },
  { ...STARTER_CHOICES, modelNews: "none", deprecations: true, money: false, digest: false, quietHours: { start: "22:00", end: "07:00" }, dailyCap: 25 },
  { ...STARTER_CHOICES, modelNews: "none", security: false, traffic: false, quietHours: { start: "21:30", end: "06:45" }, dailyCap: 1 },
];

describe("round trip", () => {
  it.each(variants.map((choices, index) => [index, choices] as const))("reads back what it wrote (%i)", async (_, choices) => {
    for (const start of [state(), state(custom), state([rule("starter", STARTER_RULE)])]) {
      const server = fakeServer(start);
      await finish(choices, server);
      expect(choicesFrom(server.state)).toEqual(expect.objectContaining(normalizeChoices(choices)));
      expect(normalizeChoices(choicesFrom(server.state))).toEqual(normalizeChoices(choices));
    }
  });

  it("starts from the first switch-on's rule as every new model", () => {
    expect(STARTER_RULE).toMatchObject({ name: SETUP_RULE_NAMES.news, events: ["model_released"], labs: { mode: "all" }, enabled: true });
    expect(normalizeChoices(choicesFrom(state([rule("starter", STARTER_RULE)])))).toEqual(STARTER_CHOICES);
  });

  it("reads a switched-off rule or category as off", () => {
    const rules = setupRules({ ...STARTER_CHOICES, prices: true, deprecations: true });
    const saved = [rule("news", rules.news!), rule("prices", { ...rules.prices!, enabled: false }), rule("deps", rules.deprecations!)];
    const choices = choicesFrom(state(saved, { categories: { ...allOn(), deprecations: false, money: false } }));
    expect(choices).toMatchObject({ modelNews: "all", prices: false, deprecations: false, money: false, security: true });
  });

  it("keeps lab picks while another option is chosen, and drops them when saving", () => {
    const choices = { ...STARTER_CHOICES, modelNews: "all" as const, labs: ["openai"] };
    expect(setupRules(choices).news?.labs).toEqual({ mode: "all", ids: [] });
    expect(normalizeChoices({ ...STARTER_CHOICES, modelNews: "labs", labs: [] }).modelNews).toBe("none");
  });
});

describe("custom rules", () => {
  it("never writes to the user's own rules", async () => {
    const edited = rule("edited", { ...STARTER_RULE, inputModalities: ["image"] });
    const renamed = rule("renamed", { ...STARTER_RULE, name: "All new models" });
    const server = fakeServer(state([...custom, edited, renamed]));
    for (const choices of variants) await finish(choices, server);
    expect(server.writes.filter((write) => /mine-|edited|renamed/.test(write))).toEqual([]);
    for (const original of [...custom, edited, renamed]) expect(server.state.rules).toContainEqual(original);
  });

  it("treats a setup rule edited elsewhere as the user's own", () => {
    const edited = rule("edited", { ...setupRules({ ...STARTER_CHOICES, prices: true }).prices!, providers: { mode: "only", ids: ["groq"] } });
    expect(splitRules([edited]).custom).toEqual([edited]);
  });

  it("adopts the unchanged rule older builds made on the first switch-on", async () => {
    const legacy = rule("legacy", { ...EMPTY_RULE, name: "Every new model" });
    expect(splitRules([legacy]).owned.news).toEqual([legacy]);
    expect(choicesFrom(state([legacy])).modelNews).toBe("all");
    const server = fakeServer(state([legacy]));
    await finish({ ...STARTER_CHOICES, modelNews: "labs", labs: ["qwen"] }, server);
    expect(server.state.rules).toEqual([expect.objectContaining({ id: "legacy", name: SETUP_RULE_NAMES.news, labs: { mode: "only", ids: ["qwen"] } })]);
  });

  it("keeps a category on while one of the user's rules needs it", () => {
    const keeps = categoriesFor({ ...STARTER_CHOICES, modelNews: "none" }, custom, true);
    expect(keeps).toMatchObject({ "prices-providers": true, deprecations: true });
    expect(keeps).not.toHaveProperty("new-models");
  });

  it("never turns off a model-update category that no rule needs", () => {
    const categories = categoriesFor({ ...STARTER_CHOICES, modelNews: "none" }, [], false);
    expect(categories).toEqual({});
    expect(categoriesFor({ ...STARTER_CHOICES, alsoAvailable: true }, [], false)).toEqual({ "new-models": true, "prices-providers": true });
  });

  it("keeps a kind this build doesn't know working", () => {
    const future = rule("future", { events: ["benchmark_published"] });
    expect(categoriesFor({ ...STARTER_CHOICES, modelNews: "none" }, [future], true)).toMatchObject({ "new-models": true, "prices-providers": true, deprecations: true });
  });
});

describe("members and admins", () => {
  it("shows the workspace and digest steps only to owners and admins", () => {
    expect(setupSteps(true)).toEqual(["news", "prices", "workspaces", "digest", "quiet", "summary"]);
    expect(setupSteps(false)).toEqual(["news", "prices", "quiet", "summary"]);
  });

  it("finds the workspaces the user owns or administers", () => {
    const workspaces = [{ id: "a", name: "Acme", role: "Owner" }, { id: "b", name: "Beta", role: "member" }, { id: "c", name: "Corp", role: "admin" }, { id: "d", name: "Dev", role: null }];
    expect(adminWorkspaces(workspaces).map((workspace) => workspace.id)).toEqual(["a", "c"]);
    expect(adminWorkspaces([{ id: "b", role: "member" }])).toEqual([]);
  });

  it("writes workspace categories only for owners and admins", () => {
    const choices = { ...STARTER_CHOICES, money: false, security: false, traffic: false, digest: false };
    const member = planSetup(choices, state(), false).settings.categories ?? {};
    expect(Object.keys(member).filter((key) => ["money", "security", "traffic", "digest"].includes(key))).toEqual([]);
    expect(planSetup(choices, state(), true).settings.categories).toEqual({ money: false, security: false, traffic: false, digest: false });
  });

  it("leaves Deprecations on for workspace alerts when deprecation news is off", () => {
    expect(categoriesFor({ ...STARTER_CHOICES, deprecations: false }, [], true)).not.toHaveProperty("deprecations");
    expect(categoriesFor({ ...STARTER_CHOICES, deprecations: true }, [], true).deprecations).toBe(true);
  });

  it("uses the workspace's low-balance threshold, or $5", () => {
    expect([lowBalanceThreshold(20), lowBalanceThreshold(0), lowBalanceThreshold(null)]).toEqual([20, 5, 5]);
  });
});

describe("idempotency", () => {
  it.each(variants.map((choices, index) => [index, choices] as const))("writes nothing the second time (%i)", async (_, choices) => {
    const server = fakeServer(state(custom));
    await finish(choices, server);
    const after = server.writes.length;
    expect(planIsEmpty(planSetup(choices, server.state, true))).toBe(true);
    await finish(choices, server);
    expect(server.writes.length).toBe(after);
  });

  it("writes nothing when nothing changed", () => {
    const current = state([rule("starter", STARTER_RULE)]);
    expect(planIsEmpty(planSetup(choicesFrom(current), current, true))).toBe(true);
  });

  it("removes duplicates left by a create whose answer was lost", async () => {
    const choices = { ...STARTER_CHOICES, prices: true };
    const prices = setupRules(choices).prices!;
    const server = fakeServer(state([rule("starter", STARTER_RULE), rule("p1", prices), rule("p2", prices)]));
    await finish(choices, server);
    expect(server.writes).toEqual(["delete p2"]);
    expect(server.state.rules.map((entry) => entry.id)).toEqual(["starter", "p1"]);
  });

  it("updates setup's rule in place rather than adding another", async () => {
    const server = fakeServer(state([rule("starter", STARTER_RULE)], { categories: { ...allOn(), "prices-providers": false } }));
    await finish({ ...STARTER_CHOICES, alsoAvailable: true }, server);
    // "Now on Phaseo" also matches provider launches, which arrive under Prices and providers.
    expect(server.writes).toEqual(["update starter", "settings"]);
    expect(server.state.rules).toHaveLength(1);
    expect(server.state.categories?.["prices-providers"]).toBe(true);
  });

  it("counts a rule that's already gone as deleted", async () => {
    const server = fakeServer(state());
    await applySetupPlan({ remove: ["gone"], update: [], create: [], settings: {} }, server.api);
    expect(server.writes).toEqual(["delete gone"]);
  });

  it("matches IDs the way the server stores them, in lower case", () => {
    const saved = state([rule("news", { ...setupRules({ ...STARTER_CHOICES, modelNews: "labs", labs: ["openai"] }).news! })]);
    expect(planIsEmpty(planSetup({ ...STARTER_CHOICES, modelNews: "labs", labs: ["OpenAI"] }, saved, false))).toBe(true);
  });

  it("leaves categories out for servers without them", () => {
    expect(planSetup({ ...STARTER_CHOICES, money: false }, state([], { categories: null }), true).settings).not.toHaveProperty("categories");
  });
});

describe("leaving and skipping", () => {
  it("counts only changes that would be saved", () => {
    expect(sameChoices(STARTER_CHOICES, { ...STARTER_CHOICES, labs: ["openai"] })).toBe(true);
    expect(sameChoices({ ...STARTER_CHOICES, modelNews: "labs", labs: ["a", "b"] }, { ...STARTER_CHOICES, modelNews: "labs", labs: ["b", "a"] })).toBe(true);
    expect(sameChoices(STARTER_CHOICES, { ...STARTER_CHOICES, prices: true })).toBe(false);
    expect(sameChoices(STARTER_CHOICES, { ...STARTER_CHOICES, quietHours: { start: "22:00", end: "07:00" } })).toBe(false);
  });

  it("puts back only the skipped step's choices", () => {
    const changed = { ...STARTER_CHOICES, modelNews: "labs" as const, labs: ["qwen"], prices: true, dailyCap: 30 };
    expect(skipStep(changed, STARTER_CHOICES, "news")).toEqual({ ...STARTER_CHOICES, prices: true, dailyCap: 30 });
    expect(skipStep(changed, STARTER_CHOICES, "quiet")).toEqual({ ...changed, dailyCap: 10 });
  });
});

describe("describeChoices", () => {
  const names = { lab: (id: string) => ({ openai: "OpenAI", anthropic: "Anthropic" })[id] ?? id, model: (id: string) => id.split("/")[1] ?? id };

  it("has one line per choice, owners' and admins' included", () => {
    const lines = describeChoices({ ...STARTER_CHOICES, modelNews: "labs", labs: ["openai", "anthropic"], prices: true, quietHours: { start: "22:00", end: "07:00" } }, { ...names, admin: true, lowBalance: "$5.00" });
    expect(lines.map((line) => `${line.title}: ${line.detail}`)).toEqual([
      "Model news: New models from OpenAI and Anthropic",
      "Available on Phaseo: Off",
      "Price changes: On, for models on Phaseo",
      "Deprecations and retirements: Off",
      "Money: Balance below $5.00, failed top-ups and budgets",
      "Security: API key activity and leaked keys",
      "Your traffic: Rate limits and substitutions",
      "Your Phaseo week: Sundays at 18:00",
      "Quiet hours: 22:00 to 07:00",
      "Daily limit: Up to 10 model updates a day",
    ]);
  });

  it("leaves workspace lines out for members", () => {
    const lines = describeChoices({ ...STARTER_CHOICES, modelNews: "models", models: ["openai/gpt-5"], deprecations: true }, { ...names, admin: false, lowBalance: null });
    expect(lines.map((line) => line.title)).toEqual(["Model news", "Available on Phaseo", "Price changes", "Deprecations and retirements", "Quiet hours", "Daily limit"]);
    expect(lines[0]!.detail).toBe("New providers for gpt-5");
    expect(lines[3]!.detail).toBe("On, for models you follow");
  });
});
