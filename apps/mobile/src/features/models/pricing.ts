import type { PricingRule, ProviderPricing } from "@/lib/api/models";
import { formatPrice } from "@/lib/format";

const METER_LABELS: Record<string, string> = {
  input_text_tokens: "Input",
  output_text_tokens: "Output",
  cached_read_text_tokens: "Cached input",
  cached_write_text_tokens: "Cache write",
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

export type PriceLine = { meter: string; label: string; value: string; unit: string };

/**
 * One line per meter for a provider's standard plan. A meter can carry several
 * prices (context tiers, time windows), so those show as a range rather than a guess.
 */
export function priceLines(provider: ProviderPricing, plan = "standard"): PriceLine[] {
  const rules = provider.pricing_rules.filter((rule) => (rule.pricing_plan ?? "standard") === plan);
  const byMeter = new Map<string, PricingRule[]>();
  for (const rule of rules) byMeter.set(rule.meter ?? "usage", [...(byMeter.get(rule.meter ?? "usage") ?? []), rule]);
  const order = Object.keys(METER_LABELS);
  return [...byMeter.entries()]
    .sort(([a], [b]) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
    .map(([meter, list]) => {
      const values = list.map(perMillion).filter((value): value is number => value != null);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const value = !values.length ? "—" : min === max ? formatPrice(min) : `${formatPrice(min)}–${formatPrice(max)}`;
      return { meter, label: meterLabel(meter), value, unit: unitLabel(list[0]!) };
    });
}

export function plansFor(provider: ProviderPricing) {
  return [...new Set(provider.pricing_rules.map((rule) => rule.pricing_plan ?? "standard"))];
}
