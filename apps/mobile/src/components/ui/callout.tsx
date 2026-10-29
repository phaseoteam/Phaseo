import { CALLOUT_TONES, type CalloutTone } from "@phaseo/app-kit/ui-recipes";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react-native";
import { View } from "react-native";
import { useResolveClassNames } from "uniwind";
import { cn } from "@/lib/cn";
import { Text } from "./text";

const ICONS: Record<CalloutTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: AlertCircle,
};

/**
 * The website's callout: a tinted box with the tone's icon, for any explanation, warning or error shown
 * inline (never a grey box with a coloured left edge). The tones are shared with the website
 * (packages/shared/app-kit/src/ui-recipes/callout.ts); the box is its alert's: rounded-2xl, a 1px border, px-4
 * py-3, a 16px icon beside the text.
 *
 * Text children are set in the tone's body colour. Other children are drawn as they are, so give their
 * text `CALLOUT_TONES[tone].description`.
 */
export function Callout({
  tone = "info",
  title,
  icon,
  role = "note",
  className,
  children,
}: {
  tone?: CalloutTone;
  title?: string;
  /** Replaces the tone's icon. */
  icon?: LucideIcon;
  /** "note" for static explanations; "status" or "alert" when the box appears in response to something. */
  role?: "note" | "status" | "alert";
  className?: string;
  children?: React.ReactNode;
}) {
  const style = CALLOUT_TONES[tone];
  const Glyph = icon ?? ICONS[tone];
  // The icon takes the title's colour, as on the website, where it inherits the box's text colour.
  const { color } = useResolveClassNames(style.title);
  const body = typeof children === "string" || typeof children === "number"
    ? <Text className={cn("text-[14px] leading-5", style.description)}>{children}</Text>
    : children;
  return (
    <View
      accessibilityRole={role === "alert" ? "alert" : undefined}
      accessibilityLiveRegion={role === "alert" ? "assertive" : role === "status" ? "polite" : undefined}
      className={cn("flex-row gap-2.5 rounded-2xl border px-4 py-3", style.surface, className)}
    >
      <View className="pt-0.5">
        <Glyph size={16} strokeWidth={2} color={typeof color === "string" ? color : undefined} />
      </View>
      <View className="flex-1 gap-0.5">
        {title ? <Text className={cn("text-[14px] leading-5 font-medium", style.title)}>{title}</Text> : null}
        {body}
      </View>
    </View>
  );
}

export { CALLOUT_TONES, type CalloutTone };
