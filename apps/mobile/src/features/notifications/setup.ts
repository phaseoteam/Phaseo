import type { Workspace } from "@/lib/api/account";
import type { NotificationRule, RuleInput, SettingsPatch } from "@/lib/api/notifications";
import type { Category } from "./channels";
import { EMPTY_RULE, listNames } from "./rules";

/**
 * The notification setup walkthrough: its choices, and what they map to (setup's own rules,
 * categories, quiet hours and the daily limit). Pure, so the mapping can be tested;
 * NotificationSetup.tsx is the flow.
 *
 * Setup owns the rules it names (SETUP_RULE_NAMES) while they keep the shape it writes. Every other
 * rule, including a setup rule the user has edited or renamed, is the user's own and is never changed.
 */

export type ModelNews = "all" | "labs" | "models" | "none";
export type QuietHours = { start: string; end: string } | null;

export type SetupChoices = {
  modelNews: ModelNews;
  /** Picks for "labs" and "models". Kept while another option is chosen, so switching back finds them. */
  labs: string[];
  models: string[];
  /** Also when a model becomes available on Phaseo. */
  alsoAvailable: boolean;
  /** For followed models when model news is "models", otherwise for any model on Phaseo. */
  prices: boolean;
  deprecations: boolean;
  money: boolean;
  security: boolean;
  traffic: boolean;
  digest: boolean;
  quietHours: QuietHours;
  dailyCap: number;
};

/** What setup reads: the settings GET, or any state shaped like it. */
export type SetupState = {
  rules: NotificationRule[];
  /** Null on servers before push v2, which have no categories. */
  categories: Partial<Record<Category, boolean>> | null | undefined;
  quietHours?: QuietHours;
  dailyCap: number;
};

export type SetupStep = "news" | "prices" | "workspaces" | "digest" | "quiet" | "summary";

export type SetupRole = "news" | "prices" | "deprecations";
const SETUP_ROLES: SetupRole[] = ["news", "prices", "deprecations"];

export const SETUP_RULE_NAMES: Record<SetupRole, string> = {
  news: "Setup: Model news",
  prices: "Setup: Price changes",
  deprecations: "Setup: Deprecations",
};

/** The low-balance push uses the workspace's own threshold, or this without one. */
export const DEFAULT_LOW_BALANCE_USD = 5;

/** What the first switch-on starts with: every new model, and the server's other defaults. */
export const STARTER_CHOICES: SetupChoices = {
  modelNews: "all",
  labs: [],
  models: [],
  alsoAvailable: false,
  prices: false,
  deprecations: false,
  money: true,
  security: true,
  traffic: true,
  digest: true,
  quietHours: null,
  dailyCap: 10,
};

const sorted = (values: string[]) => [...new Set(values)].sort();

/** Drops what the chosen options don't use. Labs or models with nothing picked mean no model news. */
export function normalizeChoices(choices: SetupChoices): SetupChoices {
  const modelNews = (choices.modelNews === "labs" && !choices.labs.length) || (choices.modelNews === "models" && !choices.models.length) ? "none" : choices.modelNews;
  return {
    ...choices,
    modelNews,
    labs: modelNews === "labs" ? choices.labs : [],
    models: modelNews === "models" ? choices.models : [],
    alsoAvailable: modelNews !== "none" && choices.alsoAvailable,
  };
}

/** Whether two sets of choices would save the same thing, so leaving can ask only when it loses something. */
export function sameChoices(a: SetupChoices, b: SetupChoices) {
  const key = (choices: SetupChoices) => {
    const c = normalizeChoices(choices);
    return JSON.stringify([c.modelNews, sorted(c.labs), sorted(c.models), c.alsoAvailable, c.prices, c.deprecations, c.money, c.security, c.traffic, c.digest, c.quietHours?.start ?? null, c.quietHours?.end ?? null, c.dailyCap]);
  };
  return key(a) === key(b);
}

const STEP_FIELDS: Record<SetupStep, (keyof SetupChoices)[]> = {
  news: ["modelNews", "labs", "models", "alsoAvailable"],
  prices: ["prices", "deprecations"],
  workspaces: ["money", "security", "traffic"],
  digest: ["digest"],
  quiet: ["quietHours", "dailyCap"],
  summary: [],
};

/** Skip: this step's choices go back to how setup found them. */
export function skipStep(choices: SetupChoices, initial: SetupChoices, step: SetupStep): SetupChoices {
  return { ...choices, ...Object.fromEntries(STEP_FIELDS[step].map((field) => [field, initial[field]])) };
}

/** The rules setup wants, by role; null where a choice is off. */
export function setupRules(choices: SetupChoices): Record<SetupRole, RuleInput | null> {
  const c = normalizeChoices(choices);
  const follows = c.modelNews === "models";
  // Followed models are already out, so their news is new providers rather than releases.
  const newsEvents = [follows ? "provider_added" : "model_released", ...(c.alsoAvailable ? ["gateway_available"] : [])];
  const scoped = (role: SetupRole, events: string[]): RuleInput => ({ ...EMPTY_RULE, name: SETUP_RULE_NAMES[role], events, ...(follows ? { models: c.models } : { onlyOnPhaseo: true }) });
  return {
    news: c.modelNews === "none" ? null : {
      ...EMPTY_RULE,
      name: SETUP_RULE_NAMES.news,
      events: newsEvents,
      labs: c.modelNews === "labs" ? { mode: "only", ids: c.labs } : { mode: "all", ids: [] },
      models: follows ? c.models : [],
    },
    prices: c.prices ? scoped("prices", ["price_changed"]) : null,
    deprecations: c.deprecations ? scoped("deprecations", ["deprecation_announced"]) : null,
  };
}

/** The rule setup creates on the first switch-on, so notifications send something before setup is done. */
export const STARTER_RULE = setupRules(STARTER_CHOICES).news!;

/** A rule's content, order-free, for comparing what's saved with what setup would write. The server lowercases IDs. */
function ruleKey(rule: RuleInput) {
  const ids = (values: string[]) => sorted(values.map((value) => value.toLowerCase()));
  const scope = (value: RuleInput["labs"]) => [value.mode, value.mode === "all" ? [] : ids(value.ids)];
  return JSON.stringify([rule.name ?? null, rule.enabled, rule.action, sorted(rule.events), scope(rule.labs), scope(rule.providers), ids(rule.models), sorted(rule.inputModalities), sorted(rule.outputModalities), rule.onlyOnPhaseo, rule.includeFreeVariants]);
}

/** The choices one setup rule stands for, read from its own fields. */
function readRule(role: SetupRole, rule: RuleInput): SetupChoices {
  const follows = rule.models.length > 0;
  if (role !== "news") return { ...STARTER_CHOICES, modelNews: follows ? "models" : "all", models: rule.models, [role]: true };
  return {
    ...STARTER_CHOICES,
    modelNews: follows ? "models" : rule.labs.mode === "only" ? "labs" : "all",
    labs: rule.labs.mode === "only" ? rule.labs.ids : [],
    models: rule.models,
    alsoAvailable: rule.events.includes("gateway_available"),
  };
}

/** The role of a rule setup wrote and nobody has changed since (switching it off doesn't count). */
function ownRole(rule: NotificationRule): SetupRole | null {
  const role = SETUP_ROLES.find((key) => SETUP_RULE_NAMES[key] === rule.name);
  if (!role) return null;
  const expected = setupRules(readRule(role, rule))[role];
  return expected && ruleKey(expected) === ruleKey({ ...rule, enabled: true }) ? role : null;
}

// Before setup, the app's first switch-on made this rule. Left unchanged, it's what setup's "Every new model" is.
const LEGACY_STARTER = ruleKey({ ...EMPTY_RULE, name: "Every new model" });

/** Setup's own rules by role (oldest first), and the user's own rules, which setup keeps as they are. */
export function splitRules(rules: NotificationRule[]) {
  const owned: Record<SetupRole, NotificationRule[]> = { news: [], prices: [], deprecations: [] };
  const custom: NotificationRule[] = [];
  for (const rule of rules) {
    const role = ownRole(rule);
    if (role) owned[role].push(rule);
    else custom.push(rule);
  }
  const legacy = owned.news.length ? -1 : custom.findIndex((rule) => ruleKey({ ...rule, enabled: true }) === LEGACY_STARTER);
  if (legacy >= 0) owned.news.push(...custom.splice(legacy, 1));
  return { owned, custom };
}

// Where each kind setup's rules listen for arrives. (Provider launches, which "now on Phaseo" rules
// also match, arrive under Prices and providers; setup leaves that to the user's switch.)
const KIND_CATEGORY: Record<string, Category> = {
  model_released: "new-models",
  gateway_available: "new-models",
  provider_added: "prices-providers",
  price_changed: "prices-providers",
  deprecation_announced: "deprecations",
};

/**
 * Where setup starts: the current rules and settings. A switched-off rule reads as off, and so does
 * one whose category is off, so finishing without changes never switches that category back on.
 */
export function choicesFrom(state: SetupState): SetupChoices {
  const { owned } = splitRules(state.rules);
  const on = (category: Category) => state.categories?.[category] !== false;
  const [news, prices, deprecations] = SETUP_ROLES.map((role) => owned[role][0] ?? null);
  const read = news ? readRule("news", news) : null;
  // Followed-model news is new providers, which arrive under Prices and providers.
  const newsOn = Boolean(read && news!.enabled && on(read.modelNews === "models" ? "prices-providers" : "new-models"));
  return {
    modelNews: newsOn ? read!.modelNews : "none",
    labs: read?.labs ?? [],
    // Followed models from whichever setup rule has them, so the model picker opens with them.
    models: [news, prices, deprecations].find((rule) => rule?.models.length)?.models ?? [],
    alsoAvailable: Boolean(read?.alsoAvailable && on("new-models")),
    prices: Boolean(prices?.enabled && on("prices-providers")),
    deprecations: Boolean(deprecations?.enabled && on("deprecations")),
    money: on("money"),
    security: on("security"),
    traffic: on("traffic"),
    digest: on("digest"),
    quietHours: state.quietHours ?? null,
    dailyCap: state.dailyCap,
  };
}

/**
 * The categories setup writes. It turns on the category each of its own rules arrives in, so a choice
 * made here isn't blocked by a switch turned off earlier (and a choice reads as off while its category
 * is off, see choicesFrom). It never turns one off, and the user's own rules don't count: those are
 * the user's settings, a rule added later would be blocked, and Deprecations also carries workspace
 * alerts about models a workspace uses. Money, Security, Your traffic and Digest only reach owners and
 * admins, so only theirs are written.
 */
export function categoriesFor(choices: SetupChoices, admin: boolean): Partial<Record<Category, boolean>> {
  const result: Partial<Record<Category, boolean>> = {};
  for (const rule of Object.values(setupRules(choices))) for (const kind of rule?.events ?? []) result[KIND_CATEGORY[kind]!] = true;
  return admin ? { ...result, money: choices.money, security: choices.security, traffic: choices.traffic, digest: choices.digest } : result;
}

export type SetupPlan = {
  remove: string[];
  update: { id: string; rule: RuleInput }[];
  create: RuleInput[];
  settings: SettingsPatch;
};

const sameQuiet = (a: QuietHours, b: QuietHours) => (a && b ? a.start === b.start && a.end === b.end : a === b);

/**
 * The writes that take `state` to `choices`, and nothing more, so finishing twice writes once. Setup
 * keeps its oldest rule per role and rewrites it in place; duplicates (a create whose answer was lost)
 * are removed. The user's own rules are never in the plan.
 */
export function planSetup(choices: SetupChoices, state: SetupState, admin: boolean): SetupPlan {
  const { owned } = splitRules(state.rules);
  const wanted = setupRules(choices);
  const plan: SetupPlan = { remove: [], update: [], create: [], settings: {} };
  for (const role of SETUP_ROLES) {
    const [keep, ...extra] = owned[role];
    const rule = wanted[role];
    plan.remove.push(...extra.map((entry) => entry.id));
    if (!rule) {
      if (keep) plan.remove.push(keep.id);
    } else if (!keep) {
      plan.create.push(rule);
    } else if (ruleKey(keep) !== ruleKey(rule)) {
      plan.update.push({ id: keep.id, rule });
    }
  }
  // Servers without categories reject them.
  if (state.categories) {
    const current = state.categories;
    const changed = Object.entries(categoriesFor(choices, admin)).filter(([category, value]) => (current[category as Category] ?? true) !== value);
    if (changed.length) plan.settings.categories = Object.fromEntries(changed);
  }
  if (!sameQuiet(choices.quietHours, state.quietHours ?? null)) plan.settings.quietHours = choices.quietHours;
  if (choices.dailyCap !== state.dailyCap) plan.settings.dailyCap = choices.dailyCap;
  return plan;
}

export const planIsEmpty = (plan: SetupPlan) => !plan.remove.length && !plan.update.length && !plan.create.length && !Object.keys(plan.settings).length;

export type SetupWrites = {
  createRule(rule: RuleInput): Promise<unknown>;
  updateRule(id: string, rule: RuleInput): Promise<unknown>;
  deleteRule(id: string): Promise<unknown>;
  updateSettings(patch: SettingsPatch): Promise<unknown>;
};

/** Runs a plan. Deletes go first, so replacing setup's rules never meets the 50-rule limit. */
export async function applySetupPlan(plan: SetupPlan, writes: SetupWrites) {
  for (const id of plan.remove) {
    // Already gone (deleted on another phone, or an earlier try): that's what was wanted.
    await writes.deleteRule(id).catch((error: unknown) => { if ((error as { status?: unknown })?.status !== 404) throw error; });
  }
  for (const { id, rule } of plan.update) await writes.updateRule(id, rule);
  for (const rule of plan.create) await writes.createRule(rule);
  if (Object.keys(plan.settings).length) await writes.updateSettings(plan.settings);
}

/** Workspaces the user owns or administers: workspace alerts and the digest go only to them. */
export function adminWorkspaces<T extends Pick<Workspace, "role">>(workspaces: T[]): T[] {
  return workspaces.filter((workspace) => ["owner", "admin"].includes(String(workspace.role ?? "").toLowerCase()));
}

/** The steps shown. Members skip the workspace alerts and the digest, which never reach them. */
export function setupSteps(admin: boolean): SetupStep[] {
  return admin ? ["news", "prices", "workspaces", "digest", "quiet", "summary"] : ["news", "prices", "quiet", "summary"];
}

export function lowBalanceThreshold(thresholdUsd: number | null | undefined) {
  return thresholdUsd != null && thresholdUsd > 0 ? thresholdUsd : DEFAULT_LOW_BALANCE_USD;
}

export type SetupLine = { step: SetupStep; title: string; detail: string };

/** The summary: one line per choice, each linked to the step that sets it. */
export function describeChoices(choices: SetupChoices, options: { admin: boolean; lab(id: string): string; model(id: string): string; lowBalance: string | null }): SetupLine[] {
  const c = normalizeChoices(choices);
  const scope = c.modelNews === "models" ? "for models you follow" : "for models on Phaseo";
  const news = { all: "Every new model", labs: `New models from ${listNames(c.labs.map(options.lab))}`, models: `New providers for ${listNames(c.models.map(options.model))}`, none: "Off" }[c.modelNews];
  const lines: SetupLine[] = [{ step: "news", title: "Model news", detail: news }];
  if (c.modelNews !== "none") lines.push({ step: "news", title: "Available on Phaseo", detail: c.alsoAvailable ? "Also when a model becomes available" : "Off" });
  lines.push(
    { step: "prices", title: "Price changes", detail: c.prices ? `On, ${scope}` : "Off" },
    { step: "prices", title: "Deprecations and retirements", detail: c.deprecations ? `On, ${scope}` : "Off" },
  );
  if (options.admin) {
    lines.push(
      { step: "workspaces", title: "Money", detail: c.money ? `${options.lowBalance ? `Balance below ${options.lowBalance}` : "Low balance"}, failed top-ups and budgets` : "Off" },
      { step: "workspaces", title: "Security", detail: c.security ? "API key activity and leaked keys" : "Off" },
      { step: "workspaces", title: "Your traffic", detail: c.traffic ? "Rate limits and substitutions" : "Off" },
      { step: "digest", title: "Your Phaseo week", detail: c.digest ? "Sundays at 18:00" : "Off" },
    );
  }
  lines.push(
    { step: "quiet", title: "Quiet hours", detail: c.quietHours ? `${c.quietHours.start} to ${c.quietHours.end}` : "Off" },
    { step: "quiet", title: "Daily limit", detail: `Up to ${c.dailyCap} model updates a day` },
  );
  return lines;
}
