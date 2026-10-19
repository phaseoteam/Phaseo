import { EVENT_KINDS, LEGACY_EVENT_KINDS, type EventKind, type NotificationRule, type RuleInput, type ScopeMode } from "@/lib/api/notifications";
import { modalityLabel } from "@/lib/format";

export const EVENT_LABELS: Record<EventKind, { title: string; phrase: string; description: string }> = {
  model_released: { title: "New models", phrase: "new models", description: "A model is released and listed on Phaseo" },
  gateway_available: { title: "Now on Phaseo", phrase: "models becoming available on Phaseo", description: "You can start calling a model through Phaseo" },
  price_changed: { title: "Price changes", phrase: "price changes", description: "A provider changes a model's price" },
  deprecation_announced: { title: "Deprecations", phrase: "deprecations and retirements", description: "A model is deprecated or gets a retirement date" },
  provider_added: { title: "New providers", phrase: "new providers for a model", description: "Another provider starts serving a model" },
  provider_launched: { title: "New providers on Phaseo", phrase: "new providers on Phaseo", description: "A provider joins Phaseo with its models" },
};

export function isEventKind(kind: string): kind is EventKind {
  return (EVENT_KINDS as readonly string[]).includes(kind);
}

/** The kinds the rule editor offers: the ones both this app and the server know (servers list theirs in `eventKinds`). */
export function availableEventKinds(serverKinds: readonly string[] | null | undefined): EventKind[] {
  const known: readonly string[] = serverKinds?.length ? serverKinds : LEGACY_EVENT_KINDS;
  return EVENT_KINDS.filter((kind) => known.includes(kind));
}

/** A rule's kinds that the server accepts. It rejects a rule with any kind it doesn't know, such as provider_launched before push v2. */
export function savableEvents(events: string[], serverKinds: readonly string[] | null | undefined): string[] {
  const known: readonly string[] = serverKinds?.length ? serverKinds : LEGACY_EVENT_KINDS;
  return events.filter((kind) => known.includes(kind));
}

export const EMPTY_RULE: RuleInput = {
  name: null,
  enabled: true,
  action: "notify",
  events: ["model_released"],
  labs: { mode: "all", ids: [] },
  providers: { mode: "all", ids: [] },
  models: [],
  inputModalities: [],
  outputModalities: [],
  onlyOnPhaseo: false,
  includeFreeVariants: false,
};

export type RuleTemplate = { key: string; title: string; description: string; rule: RuleInput; pick?: "labs" | "models" };

export const RULE_TEMPLATES: RuleTemplate[] = [
  { key: "all-new", title: "Every new model", description: "From any lab", rule: { ...EMPTY_RULE } },
  { key: "labs", title: "New models from labs I choose", description: "Only the labs you pick", rule: { ...EMPTY_RULE, events: ["model_released", "gateway_available"], labs: { mode: "only", ids: [] } }, pick: "labs" },
  { key: "except", title: "Every lab except some", description: "All new models, minus the labs you pick", rule: { ...EMPTY_RULE, labs: { mode: "except", ids: [] } }, pick: "labs" },
  { key: "follow", title: "Models I follow", description: "Price changes, new providers and deprecations", rule: { ...EMPTY_RULE, events: ["price_changed", "provider_added", "deprecation_announced"] }, pick: "models" },
  { key: "prices", title: "Price changes on Phaseo", description: "Any model you can call through Phaseo", rule: { ...EMPTY_RULE, events: ["price_changed"], onlyOnPhaseo: true } },
  { key: "mute", title: "Mute something", description: "Never notify me about chosen labs or models", rule: { ...EMPTY_RULE, action: "mute", events: ["model_released", "gateway_available", "price_changed", "deprecation_announced", "provider_added"], labs: { mode: "only", ids: [] } }, pick: "labs" },
];

function list(names: string[], max = 3) {
  if (names.length <= max) return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "";
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

function scope(mode: ScopeMode, ids: string[], noun: string, name: (id: string) => string) {
  if (mode === "all" || !ids.length) return mode === "only" && !ids.length ? `no ${noun}s yet` : `any ${noun}`;
  const names = list(ids.map(name));
  return mode === "only" ? names : `any ${noun} except ${names}`;
}

/** One plain sentence describing a rule, shown in the list and live in the editor. */
export function describeRule(rule: RuleInput | NotificationRule, names: { lab(id: string): string; provider(id: string): string; model(id: string): string }) {
  // Kinds from a newer server that this build has no words for are left out.
  const phrases = rule.events.filter(isEventKind).map((event) => EVENT_LABELS[event].phrase);
  const events = list(phrases.length ? phrases : ["other updates"], EVENT_KINDS.length);
  const parts = [`${rule.action === "mute" ? "Never notify me about" : "Notify me about"} ${events}`];
  if (rule.models.length) parts.push(`for ${list(rule.models.map(names.model))}`);
  else if (rule.labs.mode !== "all" || rule.labs.ids.length) parts.push(`from ${scope(rule.labs.mode, rule.labs.ids, "lab", names.lab)}`);
  if (rule.providers.mode !== "all" && rule.providers.ids.length) parts.push(`served by ${scope(rule.providers.mode, rule.providers.ids, "provider", names.provider)}`);
  const modalities = [...rule.inputModalities.map((value) => `${modalityLabel(value).toLowerCase()} input`), ...rule.outputModalities.map((value) => `${modalityLabel(value).toLowerCase()} output`)];
  if (modalities.length) parts.push(`with ${list(modalities)}`);
  return `${parts.join(" ")}${rule.onlyOnPhaseo ? ", only on Phaseo" : ""}.`;
}

export function validateRule(rule: RuleInput): string | null {
  if (!rule.events.length) return "Pick at least one kind of update.";
  if (rule.labs.mode !== "all" && !rule.labs.ids.length) return rule.labs.mode === "only" ? "Pick the labs to include." : "Pick the labs to leave out.";
  if (rule.providers.mode !== "all" && !rule.providers.ids.length) return "Pick the providers, or set providers to Any.";
  return null;
}
