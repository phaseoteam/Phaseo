import { ArrowUp, ArrowUpFromLine, Check, ChevronDown, CornerLeftUp, ListOrdered, Plus, type LucideIcon } from "lucide-react-native";
import { useRef, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Icon, measureAnchor, showActions, Text, type Anchor, type ViewRef } from "@/components/ui";
import { modelLabelSuffix, modelLabelText, type ModelLabel } from "@/features/chat/modelSheetRows";
import { cn } from "@/lib/cn";
import { FOLLOW_UP_SUBTITLE, FOLLOW_UP_TITLE, type FollowUpAction, type SendIcon, type SendPresentation } from "./sendPresentation";

const SEND_ICONS: Record<SendIcon, LucideIcon> = { send: ArrowUp, outbox: ArrowUpFromLine, update: Check, queue: ListOrdered, steer: CornerLeftUp };

/** A 30 dp filled square in a 44 dp touch target: send, stop or resume. */
export function ComposerActionButton({ icon, label, variant = "primary", disabled, onPress, onLongPress }: { icon: LucideIcon; label: string; variant?: "primary" | "danger"; disabled?: boolean; onPress(): void; onLongPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityHint={onLongPress ? "Long press for more ways to send" : undefined}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      className="size-[44px] shrink-0 items-center justify-center active:opacity-70"
    >
      <View className={cn("size-[30px] items-center justify-center rounded-md", variant === "danger" ? "bg-destructive" : disabled ? "bg-primary/15" : "bg-primary")}>
        <Icon icon={icon} tone={variant === "danger" ? "destructive-foreground" : "primary-foreground"} size={variant === "danger" ? 13 : 17} strokeWidth={2.4} />
      </View>
    </Pressable>
  );
}

/** Send, with the other follow-up (queue or steer) on a long press while a turn runs. */
export function SendButton({ presentation, label, disabled, onSend }: { presentation: SendPresentation; label: string; disabled: boolean; onSend(action?: FollowUpAction): void }) {
  const ref = useRef<ViewRef>(null);
  const { action, alternate } = presentation;
  const choices = action && alternate && !disabled ? [action, alternate] : null;
  async function choose(options: FollowUpAction[]) {
    const anchor: Anchor | null = await measureAnchor(ref);
    showActions({
      title: "Choose how to send this message",
      anchor,
      actions: options.map((choice) => ({ key: choice, label: FOLLOW_UP_TITLE[choice], description: FOLLOW_UP_SUBTITLE[choice], icon: choice === action ? Check : SEND_ICONS[choice], onPress: () => onSend(choice) })),
    });
  }
  return (
    <View ref={ref} collapsable={false}>
      <ComposerActionButton icon={SEND_ICONS[presentation.icon]} label={label} disabled={disabled} onPress={() => onSend()} onLongPress={choices ? () => void choose(choices) : undefined} />
    </View>
  );
}

/** The + button that opens what can be attached. */
export function ComposerAttachButton({ disabled, onPress }: { disabled?: boolean; onPress(anchor: Anchor | null): void }) {
  const ref = useRef<ViewRef>(null);
  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add attachment"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={async () => onPress(await measureAnchor(ref))}
        className="size-[44px] shrink-0 items-center justify-center active:opacity-70 disabled:opacity-50"
      >
        <Icon icon={Plus} tone="foreground" size={20} />
      </Pressable>
    </View>
  );
}

/**
 * The model and its effort: logos, the name, then the effort word muted, and a chevron. Beside one line of text it
 * shows only the logos; read-only (a computer thread's model) it has no chevron and doesn't press.
 */
export function ComposerModelControl({ label, logos, iconOnly, onPress, readOnlyReason }: { label: ModelLabel; logos?: ReactNode; iconOnly?: boolean; onPress?: () => void; readOnlyReason?: string }) {
  const suffix = modelLabelSuffix(label);
  const content = (
    <>
      {logos ? <View className="shrink-0">{logos}</View> : null}
      {iconOnly && logos ? null : (
        <>
          <Text variant="label" numberOfLines={1} className={cn("shrink", !onPress && "text-muted-foreground")}>{label.model}</Text>
          {suffix ? <Text variant="caption" numberOfLines={1} className="shrink">{suffix}</Text> : null}
        </>
      )}
      {onPress ? <Icon icon={ChevronDown} tone="muted" size={12} /> : null}
    </>
  );
  const className = "h-[44px] min-w-0 flex-row items-center gap-2 rounded-md px-2";
  const name = `Model and effort, ${modelLabelText(label)}`;
  if (!onPress) return <View accessible accessibilityLabel={readOnlyReason ? `${name}. ${readOnlyReason}` : name} className={className}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={name} accessibilityHint="Choose the model and its effort" onPress={onPress} className={cn(className, "active:bg-accent")}>{content}</Pressable>;
}
