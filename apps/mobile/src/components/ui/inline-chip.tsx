import { INLINE_CHIP_TONES, type InlineChipTone } from "@phaseo/app-kit/ui-recipes";
import { parseMentions, type MentionKind } from "@phaseo/app-kit/mentions";
import { CircleDot, File, Folder, GitPullRequestArrow, ImageIcon, MessageSquare, Paperclip, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { Text, type TextProps } from "./text";

// Uniwind only generates classes it finds written out, so each tone's pressed fill appears here.
// app-kit's inline-chip test keeps these equal to the recipe.
const pressedClass: Record<InlineChipTone, string> = {
  default: "active:bg-foreground/14",
  inverse: "active:bg-background/24",
};

const KIND_ICONS: Record<MentionKind, LucideIcon> = {
  file: File,
  folder: Folder,
  chat: MessageSquare,
  attachment: Paperclip,
  image: ImageIcon,
  "pull-request": GitPullRequestArrow,
  issue: CircleDot,
};

const KIND_NAMES: Record<MentionKind, string> = {
  file: "file",
  folder: "folder",
  chat: "chat",
  attachment: "attachment",
  image: "image",
  "pull-request": "pull request",
  issue: "issue",
};

/**
 * The inline chip every app draws for a mentioned file, folder, chat or link (the desktop composer's chip).
 * Classes come from packages/shared/app-kit/src/ui-recipes/inline-chip.ts. `inverse` is for a chip on a
 * bg-foreground surface, such as the user's message bubble.
 */
export function InlineChip({ label, icon, tone = "default", onPress, accessibilityLabel }: { label: string; icon?: LucideIcon; tone?: InlineChipTone; onPress?: () => void; accessibilityLabel?: string }) {
  const recipe = INLINE_CHIP_TONES[tone];
  const body = (
    <>
      {icon ? <Icon icon={icon} tone={tone === "inverse" ? "background" : "muted"} size={13} /> : null}
      <Text variant="small" numberOfLines={1} className={cn("shrink", recipe.text)}>{label}</Text>
    </>
  );
  const chip = cn("max-w-full flex-row items-center gap-1 py-px", recipe.surface);
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} className={cn(chip, pressedClass[tone])}>
        {body}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityLabel={accessibilityLabel ?? label} className={chip}>
      {body}
    </View>
  );
}

/** Message text with `@[label](kind:ref)` tokens drawn as inline chips, as desktop shows them. */
export function MentionText({ text, tone = "default", className, ...props }: { text: string; tone?: InlineChipTone } & Omit<TextProps, "children">) {
  const segments = parseMentions(text);
  if (segments.every((segment) => typeof segment === "string")) return <Text {...props} className={className}>{text}</Text>;
  return (
    <Text {...props} className={className}>
      {segments.map((segment, index) =>
        typeof segment === "string" ? (
          segment
        ) : (
          <InlineChip key={index} label={segment.label} icon={KIND_ICONS[segment.kind]} tone={tone} accessibilityLabel={`${segment.label}, ${KIND_NAMES[segment.kind]}`} />
        )
      )}
    </Text>
  );
}
