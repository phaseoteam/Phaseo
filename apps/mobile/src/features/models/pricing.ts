import type { PricingRule, ProviderPricing } from "@/lib/api/models";
import { formatPrice, formatTokens } from "@/lib/format";

const METER_LABELS: Record<string, string> = {
  input_text_tokens: "Input",
  output_text_tokens: "Output",
  cached_read_text_tokens: "Cached input",
  cached_write_text_tokens: "Cache write",
  cached_write_text_tokens_5m: "Cache write (5 min)",
  cached_write_text_tokens_1h: "Cache write (1 hour)",
  input_image_tokens: "Image input",
  output_image_tokens: "Image output",
  input_audio_tokens: "Audio input",
  output_audio_tokens: "Audio output",
  reasoning_tokens: "Reasoning",
};

export function meterLabel(meter: string | null | undefined) {
  if (!meter) return "Usage";
  return METER_LABELS[meter] ?? meter.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

/** "Google Vertex (EU)", "Anthropic (AWS)": the offer label tells same-named routes apart. */
export function providerLabel(provider: ProviderPricing["provider"]) {
  const name = provider.api_provider_name ?? provider.api_provider_id ?? "Provider";
  const offer = typeof provider.offer_label === "string" ? provider.offer_label.trim() : "";
  return offer && !name.toLowerCase().includes(offer.toLowerCase()) ? `${name} (${offer})` : name;
}

/** Whether Phaseo routes this model to the provider today. Pricing also lists providers that are priced but not active. */
export function isRoutable(provider: ProviderPricing) {
  return provider.provider_models.some((model) => model.is_active_gateway === true);
}

/** Routable providers first, keeping the API's order within each group. */
export function sortByRoutable(providers: ProviderPricing[]) {
  return [...providers.filter(isRoutable), ...providers.filter((provider) => !isRoutable(provider))];
}

function perMillion(rule: PricingRule) {
  if (rule.price_per_unit == null) return null;
  if (rule.unit === "token" && rule.unit_size) return (rule.price_per_unit / rule.unit_size) * 1_000_000;
  return rule.price_per_unit;
}

function unitLabel(rule: PricingRule) {
  if (rule.unit === "token") return "1M tokens";
  if (rule.unit_size && rule.unit_size !== 1) return `${rule.unit_size} ${rule.unit ?? "units"}`;
  return rule.unit ?? "unit";
}

type Condition = { op?: string; path?: string; value?: number };

/** The input size above which a rule applies (a long-context tier), or null for the normal price. */
export function longContextThreshold(rule: PricingRule): number | null {
  const conditions = Array.isArray((rule as { match?: unknown }).match) ? (rule as { match: Condition[] }).match : [];
  const tier = conditions.find((condition) => condition.path === "long_context_input_tokens" && (condition.op === "gt" || condition.op === "gte"));
  return tier && typeof tier.value === "number" ? tier.value : null;
}

export type PriceLine = { meter: string; label: string; value: string; unit: string; longContext: { value: string; above: string } | null };

const priceRange = (values: number[]) => {
  if (!values.length) return "—";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? formatPrice(min) : `${formatPrice(min)}–${formatPrice(max)}`;
};

/**
 * One line per meter for a provider's plan: the normal price, plus the long-context
 * price when the provider charges more above an input size. Other variations (time
 * windows) show as a range rather than a guess.
 */
export function priceLines(provider: ProviderPricing, plan = "standard"): PriceLine[] {
  const rules = provider.pricing_rules.filter((rule) => (rule.pricing_plan ?? "standard") === plan);
  const byMeter = new Map<string, PricingRule[]>();
  for (const rule of rules) byMeter.set(rule.meter ?? "usage", [...(byMeter.get(rule.meter ?? "usage") ?? []), rule]);
  const order = Object.keys(METER_LABELS);
  const rank = (meter: string) => (order.indexOf(meter) === -1 ? 99 : order.indexOf(meter));
  return [...byMeter.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([meter, list]) => {
      const normal = list.filter((rule) => longContextThreshold(rule) == null);
      const tiered = list.filter((rule) => longContextThreshold(rule) != null);
      const base = (normal.length ? normal : list).map(perMillion).filter((value): value is number => value != null);
      const long = tiered.map(perMillion).filter((value): value is number => value != null);
      const threshold = tiered.length ? Math.min(...tiered.map((rule) => longContextThreshold(rule)!)) : null;
      return {
        meter,
        label: meterLabel(meter),
        value: priceRange(base),
        unit: unitLabel(list[0]!),
        longContext: normal.length && long.length && threshold != null ? { value: priceRange(long), above: formatTokens(threshold) } : null,
      };
    });
}

export function plansFor(provider: ProviderPricing) {
  return [...new Set(provider.pricing_rules.map((rule) => rule.pricing_plan ?? "standard"))];
}
