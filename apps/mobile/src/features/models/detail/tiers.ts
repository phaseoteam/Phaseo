/**
 * Service tier colours and names, as the website shows them: badge backgrounds from
 * ServiceTierBadge.tsx (tierBadgeBackgrounds) and text colours from lib/models/tierFilterStyles.ts.
 * Class strings stay whole so Uniwind compiles them; `dark:` follows the app's theme.
 */
const BADGE_BACKGROUNDS: Record<string, string> = {
  priority: "bg-violet-100 dark:bg-violet-950",
  ultrafast: "bg-fuchsia-100 dark:bg-fuchsia-950",
  flex: "bg-sky-100 dark:bg-sky-950",
  batch: "bg-orange-100 dark:bg-orange-950",
  free: "bg-emerald-100 dark:bg-emerald-950",
};

const TEXT_COLOURS: Record<string, string> = {
  standard: "text-blue-600 dark:text-blue-400",
  batch: "text-orange-600 dark:text-orange-400",
  free: "text-emerald-600 dark:text-emerald-400",
  flex: "text-sky-600 dark:text-sky-400",
  priority: "text-violet-600 dark:text-violet-400",
  ultrafast: "text-fuchsia-600 dark:text-fuchsia-400",
};

const LABELS: Record<string, string> = {
  standard: "Standard",
  fast: "Fast",
  priority: "Fast",
  ultrafast: "Ultrafast",
  flex: "Flex",
  batch: "Batch",
  free: "Free",
};

/** "Fast", "Batch"…; unknown tiers keep their name in title case. */
export function serviceTierLabel(plan: string | null | undefined) {
  const value = String(plan ?? "").trim().toLowerCase() || "standard";
  return LABELS[value] ?? value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** The badge for a tier, or null for standard (which the website shows without one). `fast` draws as `priority`. */
export function serviceTierBadgeStyle(plan: string | null | undefined): { label: string; tier: string; background: string; text: string } | null {
  const value = String(plan ?? "").trim().toLowerCase() || "standard";
  if (value === "standard") return null;
  const tier = value === "fast" ? "priority" : value;
  return { label: serviceTierLabel(value), tier, background: BADGE_BACKGROUNDS[tier] ?? "bg-muted", text: TEXT_COLOURS[tier] ?? "text-muted-foreground" };
}

/** Line dashes per tier (chart-colors.tsx PRICING_TIER_DASHARRAYS); unknown tiers get "6 4". */
export function tierDashArray(plan: string) {
  const dashes: Record<string, string | undefined> = { standard: undefined, free: "1 5", priority: "8 4", flex: "10 3 2 3", batch: "16 4" };
  const value = plan.toLowerCase();
  return Object.prototype.hasOwnProperty.call(dashes, value) ? dashes[value] : "6 4";
}

function oklchToHex(lightness: number, chroma: number, hue: number) {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const channel = (linear: number) => {
    const value = Math.max(0, Math.min(1, linear));
    const gamma = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
    return Math.round(gamma * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)}${channel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)}${channel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)}`;
}

/** The website's PRICING_PROVIDER_PALETTE (OKLCH, converted to hex for SVG). */
export const PROVIDER_PALETTE = ["#ff6f4a", "#4cc157", "#00bbf1", "#a196ff", "#f68200", "#00c7b3", "#e76edf", "#c1b508"];

/**
 * A provider's price-history line colour when it has no brand colour: the website assigns the palette in
 * provider order, then steps round the hue wheel by the golden angle (assignOrderedSeriesColours).
 */
export function providerSeriesColour(index: number) {
  return PROVIDER_PALETTE[index] ?? oklchToHex(0.72, 0.18, ((index - PROVIDER_PALETTE.length) * 137.508 + 23) % 360);
}
