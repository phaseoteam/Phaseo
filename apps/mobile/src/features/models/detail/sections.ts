import {
  Activity, AppWindow, CircleDollarSign, CircleHelp, CreditCard, FlaskConical, Gauge, Info, ScrollText, Store,
  type LucideIcon,
} from "lucide-react-native";

/** The website's model page sections, in its order (apps/web …/models/[organisationId]/[modelId]/page.tsx). */
export const SECTION_ORDER = ["providers", "performance", "pricing", "benchmarks", "activity", "apps", "uptime", "verification", "about", "subscriptions", "faq"] as const;

export type SectionId = (typeof SECTION_ORDER)[number];

/** Labels and icons from the website's section jump menu (ModelPageToc). */
export const SECTION_META: Record<SectionId, { label: string; icon: LucideIcon }> = {
  providers: { label: "Providers", icon: Store },
  performance: { label: "Performance", icon: Gauge },
  pricing: { label: "Pricing", icon: CircleDollarSign },
  benchmarks: { label: "Benchmarks", icon: FlaskConical },
  activity: { label: "Activity", icon: Activity },
  apps: { label: "Apps", icon: AppWindow },
  uptime: { label: "Uptime", icon: ScrollText },
  verification: { label: "Verification", icon: ScrollText },
  about: { label: "About", icon: Info },
  subscriptions: { label: "Subscriptions", icon: CreditCard },
  faq: { label: "FAQs", icon: CircleHelp },
};

/** apps/web lib/models/modelAccessLayout.ts */
export function modelAccessLayout({ hasSubscriptions, hasApiProviders, isPrivateModel = false, status }: { hasSubscriptions: boolean | null; hasApiProviders: boolean; isPrivateModel?: boolean; status?: string | null }) {
  const subscriptionOnly = hasSubscriptions === true && !hasApiProviders && !isPrivateModel;
  return {
    subscriptionOnly,
    canUseApi: isPrivateModel || hasApiProviders || hasSubscriptions === false,
    showProviders: !subscriptionOnly && (hasApiProviders || status === "Announced"),
  };
}

/** The website shows a Verification section for models that generate images or audio. */
export function supportsProvenanceVerification(outputTypes: string[]) {
  return outputTypes.some((value) => /(^|[^a-z])(image|audio|speech|music|tts)([^a-z]|$)/i.test(value));
}

/**
 * Which sections a model page lists, in order. A port of the website's getModelPageTocItems:
 * retired models keep only benchmarks, verification, about, subscriptions and FAQs; subscription-only
 * models put subscriptions first; models not live on the gateway drop the traffic sections.
 */
export function modelPageSections({ subscriptionOnly, showBenchmarks, showSubscriptions, status, isGatewayActive, showProviders, showVerification, isPrivateModel = false }: {
  subscriptionOnly: boolean;
  showBenchmarks: boolean;
  showSubscriptions: boolean;
  status?: string | null;
  isGatewayActive: boolean;
  showProviders: boolean;
  showVerification: boolean;
  isPrivateModel?: boolean;
}): SectionId[] {
  const all = [...SECTION_ORDER];
  if (isPrivateModel) return all.filter((id) => ["providers", "performance", "activity", "uptime", "about", "faq"].includes(id));
  if (status === "Retired") {
    return all.filter((id) => {
      if (id === "benchmarks") return showBenchmarks;
      if (id === "subscriptions") return showSubscriptions;
      if (id === "verification") return showVerification;
      return id === "about" || id === "faq";
    });
  }
  const ordered: SectionId[] = subscriptionOnly ? ["subscriptions", ...all.filter((id) => id !== "subscriptions")] : all;
  return ordered.filter((id) => {
    if (id === "providers") return showProviders;
    if ((!isGatewayActive || subscriptionOnly) && ["performance", "pricing", "activity", "apps", "uptime"].includes(id)) return false;
    if (id === "benchmarks") return showBenchmarks;
    if (id === "subscriptions") return showSubscriptions;
    if (id === "verification") return showVerification;
    return true;
  });
}

/**
 * The section being read: the last one whose top has scrolled above the line `topInset` below the
 * top of the viewport (the website uses 212 px under its sticky headers). Offsets are content y.
 */
export function activeSectionAt<T extends string>(offsets: { id: T; y: number }[], scrollY: number, topInset: number): T | null {
  const sorted = [...offsets].sort((a, b) => a.y - b.y);
  let active: T | null = sorted[0]?.id ?? null;
  for (const section of sorted) {
    if (section.y <= scrollY + topInset) active = section.id;
    else break;
  }
  return active;
}

/** Where to scroll so a section's heading sits just under the pinned header. */
export function scrollTargetFor(sectionY: number, pinnedHeight: number) {
  return Math.max(0, sectionY - pinnedHeight - 8);
}
