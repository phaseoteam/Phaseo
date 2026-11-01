import { AlertTriangle, ArrowUpRight, Ban, CheckCircle2, CircleHelp, Clock3, FlaskConical, ShieldAlert, ShieldCheck, XCircle, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { type LayoutChangeEvent, Pressable, View } from "react-native";
import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAppearance } from "@/providers/AppearanceProvider";
import { modalityTone } from "./about";
import type { CanonicalGatewayStatus, DataPolicyTier } from "./providers";
import type { SectionId } from "./sections";
import { serviceTierBadgeStyle } from "./tiers";

/** A page section: a divider above (none for the first), the website's heading, and its layout reported for the jump menu. */
export function PageSection({ id, title, description, action, first, onLayoutSection, children, className }: {
  id: SectionId;
  title?: ReactNode;
  description?: string | null;
  action?: ReactNode;
  first?: boolean;
  onLayoutSection?: (id: SectionId, y: number) => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <View
      onLayout={(event: LayoutChangeEvent) => onLayoutSection?.(id, event.nativeEvent.layout.y)}
      className={cn("mx-4", first ? "pt-2" : "mt-6 border-t border-border pt-5", className)}
    >
      {title || action ? (
        <View className="mb-3 gap-3">
          <View>
            {typeof title === "string" ? <Text variant="heading" accessibilityRole="header">{title}</Text> : title}
            {description ? <Text variant="muted" className="mt-1">{description}</Text> : null}
          </View>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** A sub-heading inside a section ("Effective pricing", "Related models"). */
export function SubHeading({ children, className }: { children: ReactNode; className?: string }) {
  return <Text variant="body" className={cn("font-semibold", className)}>{children}</Text>;
}

/** The website's dashed empty state: an icon tile, a title and a hint. */
export function EmptyBox({ icon, title, body, className }: { icon: LucideIcon; title: string; body?: string; className?: string }) {
  return (
    <View className={cn("items-center rounded-md border border-dashed border-border px-6 py-8", className)}>
      <View className="mb-3 h-11 w-11 items-center justify-center rounded-md bg-muted"><Icon icon={icon} size={20} /></View>
      <Text variant="heading" className="text-center">{title}</Text>
      {body ? <Text variant="muted" className="mt-1.5 text-center">{body}</Text> : null}
    </View>
  );
}

/** Link-style text in the dark-theme link colour. */
export function LinkText({ children, onPress, className }: { children: ReactNode; onPress: () => void; className?: string }) {
  return <Text accessibilityRole="link" onPress={onPress} suppressHighlighting className={cn("font-medium text-link", className)}>{children}</Text>;
}

/** An outlined, rounded-md tag (the website's modality "pills", squared off per the app's rules). */
export function ModalityTag({ modality, label, icon }: { modality: string; label: string; icon?: LucideIcon | null }) {
  const { resolved } = useAppearance();
  const tone = modalityTone(modality, resolved);
  return (
    <View className="flex-row items-center gap-1 rounded-md px-2 py-0.5" style={{ backgroundColor: tone.bg }}>
      {icon ? <Icon icon={icon} size={14} color={tone.fg} /> : null}
      <Text variant="caption" className="font-medium" style={{ color: tone.fg }}>{label}</Text>
    </View>
  );
}

/** Status hues from the website's PROVIDER_STATUS_META, picked to read on both themes. */
export const STATUS_META: Record<CanonicalGatewayStatus, { label: string; description: string; icon: LucideIcon; light: string; dark: string }> = {
  active: { label: "Active", description: "Available.", icon: CheckCircle2, light: "#16a34a", dark: "#4ade80" },
  coming_soon: { label: "Coming soon", description: "Not active yet.", icon: Clock3, light: "#2563eb", dark: "#60a5fa" },
  external: { label: "External", description: "Listed from an external catalogue; routing requires an explicit provider-level override.", icon: ArrowUpRight, light: "#7c3aed", dark: "#a78bfa" },
  internal_testing: { label: "Internal testing", description: "Visible to admins only while this provider/model capability is being tested.", icon: FlaskConical, light: "#0284c7", dark: "#38bdf8" },
  deranked_lvl1: { label: "Deranked L1", description: "Routable, but slightly deprioritized by routing health.", icon: AlertTriangle, light: "#f59e0b", dark: "#fbbf24" },
  deranked_lvl2: { label: "Deranked L2", description: "Routable, but currently deprioritized by routing health.", icon: AlertTriangle, light: "#d97706", dark: "#f59e0b" },
  deranked_lvl3: { label: "Deranked L3", description: "Routable, but heavily deprioritized by routing health.", icon: AlertTriangle, light: "#ef4444", dark: "#f87171" },
  inactive: { label: "Not active", description: "Not available.", icon: XCircle, light: "#71717a", dark: "#a1a1aa" },
  disabled: { label: "Disabled", description: "Explicitly disabled and not routable.", icon: Ban, light: "#dc2626", dark: "#f87171" },
  not_listed: { label: "Not active", description: "Not available.", icon: XCircle, light: "#71717a", dark: "#a1a1aa" },
};

export function StatusIcon({ status, size = 16 }: { status: CanonicalGatewayStatus; size?: number }) {
  const { resolved } = useAppearance();
  const meta = STATUS_META[status];
  return <View accessibilityLabel={`Status: ${meta.label}`}><Icon icon={meta.icon} size={size} color={resolved === "dark" ? meta.dark : meta.light} /></View>;
}

const POLICY_META: Record<DataPolicyTier, { icon: LucideIcon; light: string; dark: string }> = {
  private: { icon: ShieldCheck, light: "#059669", dark: "#34d399" },
  logs: { icon: ShieldAlert, light: "#f59e0b", dark: "#fbbf24" },
  trains: { icon: ShieldAlert, light: "#dc2626", dark: "#f87171" },
  unknown: { icon: CircleHelp, light: "#71717a", dark: "#a1a1aa" },
};

export function PolicyIcon({ tier, size = 16 }: { tier: DataPolicyTier; size?: number }) {
  const { resolved } = useAppearance();
  const meta = POLICY_META[tier];
  return <Icon icon={meta.icon} size={size} color={resolved === "dark" ? meta.dark : meta.light} />;
}

/** A small 16 px neutral label badge ("External"). */
export function TinyBadge({ label }: { label: string }) {
  return (
    <View className="h-4 justify-center rounded-[4px] bg-muted px-1.5">
      <Text className="text-[10px] font-semibold leading-3 text-muted-foreground">{label}</Text>
    </View>
  );
}

/** The website's service tier badge: each tier in its own colour, nothing for standard. */
export function ServiceTierBadge({ plan }: { plan: string }) {
  const style = serviceTierBadgeStyle(plan);
  if (!style) return null;
  return (
    <View accessibilityLabel={`${style.label} service tier`} className={cn("h-4 justify-center rounded-[4px] px-1.5", style.background)}>
      <Text className={cn("text-[10px] font-semibold leading-3", style.text)}>{style.label}</Text>
    </View>
  );
}

/** Two-column tile grid rows, like the website's bordered metadata grids. */
export function TileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <View className={cn("overflow-hidden rounded-md border border-border", className)}>{children}</View>;
}

export function Tile({ label, icon, accent, children, last }: { label: string; icon?: LucideIcon; accent?: string; children: ReactNode; last?: boolean }) {
  return (
    <View className={cn("px-3 py-2.5", !last && "border-b border-border")}>
      <View className="flex-row items-center gap-1.5">
        {icon ? <Icon icon={icon} size={14} tone="muted" color={accent} /> : null}
        <Text variant="caption" className={cn(accent ? "font-medium" : undefined)} style={accent ? { color: accent } : undefined}>{label}</Text>
      </View>
      <View className="mt-1">{children}</View>
    </View>
  );
}

export function PressableCard({ onPress, children, className, label }: { onPress?: () => void; children: ReactNode; className?: string; label?: string }) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={label} disabled={!onPress} onPress={onPress} className={cn("rounded-md border border-border px-3 py-3 active:bg-accent", className)}>
      {children}
    </Pressable>
  );
}
