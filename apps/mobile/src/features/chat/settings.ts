import { resolveReasoningEffort, type ReasoningEffort, type ReasoningEffortSupport, type ServiceTier, type ServiceTierSupport } from "./capabilities";

/**
 * One model's settings in one chat, like the website's ChatModelSettings. Unset fields use the
 * gateway's and provider's defaults and are left out of the request.
 */
export type ModelSettings = {
  displayName?: string;
  reasoningEnabled?: boolean;
  reasoningEffort?: ReasoningEffort;
  /** "auto" or a provider ID. */
  providerId?: string;
  serviceTier?: ServiceTier;
  systemPrompt?: string;
  temperature?: number | null;
  maxOutputTokens?: number | null;
  topP?: number | null;
  topK?: number | null;
  minP?: number | null;
  topA?: number | null;
};

export type NumberSettingKey = "temperature" | "maxOutputTokens" | "topP" | "topK" | "minP" | "topA";

/** Ranges and steps from the website's model settings dialog; limits the gateway enforces win where they differ. */
/** `resting` is where the slider sits while the value is blank (the usual provider default). */
export const NUMBER_SETTINGS: Record<NumberSettingKey, { label: string; min: number; max: number; sliderMax: number; step: number; integer: boolean; placeholder: string; resting: number; description: string }> = {
  temperature: { label: "Temperature", min: 0, max: 2, sliderMax: 2, step: 0.1, integer: false, placeholder: "Default", resting: 1, description: "Higher is more varied; lower is more focused." },
  maxOutputTokens: { label: "Max output tokens", min: 1, max: 1_000_000, sliderMax: 4096, step: 1, integer: true, placeholder: "Default", resting: 1024, description: "The longest answer, in tokens." },
  topP: { label: "Top P", min: 0, max: 1, sliderMax: 1, step: 0.01, integer: false, placeholder: "Default", resting: 1, description: "Samples from the smallest set of tokens whose probability adds up to this." },
  topK: { label: "Top K", min: 1, max: 1000, sliderMax: 200, step: 1, integer: true, placeholder: "Default", resting: 40, description: "Samples from this many of the likeliest tokens." },
  minP: { label: "Min P", min: 0, max: 1, sliderMax: 1, step: 0.01, integer: false, placeholder: "Default", resting: 0, description: "Drops tokens less likely than this share of the top token." },
  topA: { label: "Top A", min: 0, max: 1, sliderMax: 1, step: 0.01, integer: false, placeholder: "Default", resting: 0, description: "Drops tokens below this, scaled by the top token's probability squared." },
};

export const ADVANCED_SETTING_KEYS: NumberSettingKey[] = ["topP", "topK", "minP", "topA"];

/** A number setting as stored: clamped to its range and step, or null when blank or not a number. */
export function normaliseNumberSetting(key: NumberSettingKey, value: number | string | null | undefined): number | null {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const parsed = typeof value === "number" ? value : Number(value.trim().replace(",", "."));
  if (!Number.isFinite(parsed)) return null;
  const spec = NUMBER_SETTINGS[key];
  const clamped = Math.min(spec.max, Math.max(spec.min, parsed));
  return spec.integer ? Math.round(clamped) : Number(clamped.toFixed(4));
}

/** Settings left as they were by default compare equal to an empty object. */
export function cleanSettings(settings: ModelSettings): ModelSettings {
  const next: ModelSettings = {};
  if (settings.displayName?.trim()) next.displayName = settings.displayName.trim();
  if (settings.reasoningEnabled) next.reasoningEnabled = true;
  if (settings.reasoningEffort) next.reasoningEffort = settings.reasoningEffort;
  if (settings.providerId && settings.providerId !== "auto") next.providerId = settings.providerId;
  if (settings.serviceTier && settings.serviceTier !== "standard") next.serviceTier = settings.serviceTier;
  if (settings.systemPrompt?.trim()) next.systemPrompt = settings.systemPrompt;
  for (const key of Object.keys(NUMBER_SETTINGS) as NumberSettingKey[]) {
    const value = normaliseNumberSetting(key, settings[key]);
    if (value != null) next[key] = value;
  }
  return next;
}

/**
 * How many settings differ from the defaults (for the dot on a model's chip). The display name doesn't
 * count, and an effort only counts while reasoning is on.
 */
export function changedSettingsCount(settings: ModelSettings | undefined) {
  if (!settings) return 0;
  const { displayName: _name, reasoningEffort: _effort, ...rest } = cleanSettings(settings);
  return Object.keys(rest).length;
}

/** What the request may use for this model, from its routes (see capabilities.ts). */
export type RequestCapabilities = {
  /** Active provider IDs; a saved provider that's no longer listed falls back to Auto. */
  providerIds?: string[];
  reasoning?: ReasoningEffortSupport | null;
  serviceTiers?: ServiceTierSupport | null;
};

/**
 * The chat-completions fields for one model's settings, as the gateway accepts them on
 * POST /v1/chat/completions (apps/api ChatCompletionsSchema and textParamPolicy): `max_tokens`
 * (`max_output_tokens` and `max_completion_tokens` are aliases of it), `reasoning: { effort }`,
 * `provider: { only }`, `service_tier`, and the sampling fields by their own names. The website sends
 * the same settings to /responses (chatSdkRequest.ts); only max output's name differs.
 */
export function settingsRequestFields(settings: ModelSettings | undefined, capabilities: RequestCapabilities = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (!settings) return body;
  const number = (key: NumberSettingKey) => normaliseNumberSetting(key, settings[key]);
  const temperature = number("temperature");
  if (temperature != null) body.temperature = temperature;
  const maxOutput = number("maxOutputTokens");
  if (maxOutput != null) body.max_tokens = maxOutput;
  const topP = number("topP");
  if (topP != null) body.top_p = topP;
  const topK = number("topK");
  if (topK != null) body.top_k = topK;
  const minP = number("minP");
  if (minP != null) body.min_p = minP;
  const topA = number("topA");
  if (topA != null) body.top_a = topA;

  const providerId = settings.providerId?.trim();
  const providerListed = !capabilities.providerIds || capabilities.providerIds.includes(providerId ?? "");
  if (providerId && providerId !== "auto" && providerListed) body.provider = { only: [providerId] };

  // Standard is the default, so it's left out; a tier the route doesn't sell is dropped rather than sent.
  const tier = settings.serviceTier;
  if (tier && tier !== "standard" && (capabilities.serviceTiers?.supportedValues ?? []).includes(tier)) body.service_tier = tier;

  if (settings.reasoningEnabled) body.reasoning = { effort: resolveReasoningEffort(settings.reasoningEffort ?? "medium", capabilities.reasoning) };
  return body;
}

/** The system message that goes first in the conversation, if the model has a prompt. */
export function systemPromptFor(settings: ModelSettings | undefined): string | null {
  const prompt = settings?.systemPrompt?.trim();
  return prompt ? prompt : null;
}

/** "Apply to all models": everything but the provider (as the website does) and the display name. */
export function sharedSettings(settings: ModelSettings): ModelSettings {
  const { providerId: _provider, displayName: _name, ...shared } = settings;
  return shared;
}
