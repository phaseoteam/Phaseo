import { Play, Square } from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { TextInput, View, type LayoutChangeEvent } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, type Anchor } from "@/components/ui";
import type { ChatAttachment } from "@/features/chat/types";
import type { ModelLabel } from "@/features/chat/modelSheetRows";
import { haptic } from "@/lib/haptics";
import { AttachmentStrip, CompactAttachments } from "./ComposerAttachments";
import { ComposerCommandPopover } from "./ComposerCommandPopover";
import { ComposerActionButton, ComposerAttachButton, ComposerModelControl, SendButton } from "./ComposerControls";
import { detectSlashTrigger, filterCommands, removeTrigger, type ComposerCommand } from "./commands";
import { EDITOR_INSET, editorHeight, LINE_HEIGHT, MAX_LINES, nextEditorLayout, ROW_HEIGHT, TOOLBAR_HEIGHT, type EditorLayout } from "./editorLayout";
import type { FollowUpAction, SendPresentation } from "./sendPresentation";

/** Space under the composer, inside the bottom inset. */
const BOTTOM_GUTTER = 6;
/** The share of the one-line row the text keeps; a long model name truncates first. */
const INLINE_EDITOR_MIN_WIDTH = "40%";

export type ComposerModel = { label: ModelLabel; logos?: ReactNode; onPress?: () => void; readOnlyReason?: string };

export type ComposerProps = {
  text: string;
  onChangeText(text: string): void;
  placeholder: string;
  /** Read-only, with this in place of the placeholder (signed out, no model chosen). */
  disabledReason?: string | null;
  /** Null hides the + button: this composer can't send attachments. */
  onAttach?: ((anchor: Anchor | null) => void) | null;
  attachments?: ChatAttachment[];
  onRemoveAttachment?(id: string): void;
  model?: ComposerModel | null;
  send: SendPresentation;
  /** Why send is off though there's something to send; read out as the button's label. */
  sendBlockedReason?: string | null;
  onSend(action?: FollowUpAction): void;
  /** Shown in place of send while the draft is empty and a turn can be stopped. */
  onStop?: (() => void) | null;
  /** Shown in place of send while the draft is empty and the queue is paused. */
  onResume?: (() => void) | null;
  editingQueued?: boolean;
  /** What `/` offers; none turns the menu off. */
  commands?: ComposerCommand[];
  onCommand?(command: ComposerCommand): void;
  /** Notices, cards and queued messages, stacked over the composer. */
  above?: ReactNode;
  /** A footnote under it. */
  below?: ReactNode;
  autoFocus?: boolean;
  /** A new value focuses the text box (a suggested prompt was put in it). */
  focusKey?: number;
};

/**
 * The message box for Phaseo chats and Code threads. One line beside its controls (+ for attachments, the text, the
 * model as logos, and send) until the text wraps; then the text takes the full width above them and the model shows
 * its name and effort. It grows to four lines, then scrolls. Focused, the draft's attachments show inside it;
 * otherwise small thumbnails sit beside the text. With nothing typed, send becomes stop while a turn runs, or resume
 * while the queue is paused; a long press on send offers the other way to send while a turn runs.
 */
export function Composer(props: ComposerProps) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  const [contentHeight, setContentHeight] = useState(LINE_HEIGHT);
  const [layout, setLayout] = useState<EditorLayout>({ expanded: false, expandedAt: 0 });
  const [slot, setSlot] = useState({ x: 0, width: 0 });
  const [rowWidth, setRowWidth] = useState(0);
  const [selection, setSelection] = useState({ text: props.text, end: props.text.length });

  const { text, attachments = [], disabledReason } = props;
  // State adjusted during render (not in an effect), so the box widens in the frame the text wraps.
  const nextLayout = nextEditorLayout(layout, text, contentHeight);
  if (nextLayout !== layout) setLayout(nextLayout);
  const expanded = nextLayout.expanded;
  const height = editorHeight(expanded, contentHeight);

  const focusKey = props.focusKey;
  useEffect(() => {
    if (focusKey) inputRef.current?.focus();
  }, [focusKey]);

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  const locked = Boolean(disabledReason);
  const showStop = !hasContent && !props.editingQueued && Boolean(props.onStop);
  const showResume = !hasContent && !showStop && !props.editingQueued && Boolean(props.onResume);
  const canSend = hasContent && !locked && !props.sendBlockedReason;

  // The caret from the last selection event while the text is the one it was reported for; otherwise the end.
  const cursor = selection.text === text ? selection.end : text.length;
  const trigger = props.commands?.length && !locked ? detectSlashTrigger(text, cursor) : null;
  const matches = trigger && props.commands ? filterCommands(props.commands, trigger.query) : [];

  const send = (action?: FollowUpAction) => {
    if (!canSend) return;
    haptic("press");
    props.onSend(action);
  };
  const pickCommand = (command: ComposerCommand) => {
    if (!trigger) return;
    const { value, cursor: at } = removeTrigger(text, trigger);
    haptic("selection");
    props.onChangeText(value);
    setSelection({ text: value, end: at });
    props.onCommand?.(command);
  };

  const compactLimit = rowWidth >= 500 ? 3 : 1;
  const showStrip = focused && attachments.length > 0;
  const onSlotLayout = (event: LayoutChangeEvent) => {
    // The full-width layout gives this slot to the model control; keep the one-line geometry for the way back.
    if (expanded) return;
    const { x, width } = event.nativeEvent.layout;
    setSlot((current) => (current.x === x && current.width === width ? current : { x, width }));
  };

  return (
    <View className="bg-background px-3" style={{ paddingTop: 6, paddingBottom: (keyboardVisible ? 0 : insets.bottom) + BOTTOM_GUTTER }}>
      {props.above}
      {matches.length ? <ComposerCommandPopover commands={matches} onSelect={pickCommand} /> : null}
      <View className="overflow-hidden rounded-md border border-border bg-card" style={{ paddingVertical: 2 }}>
        {showStrip ? <View className="px-[14px] pb-2.5 pt-2"><AttachmentStrip attachments={attachments} disabled={locked} onRemove={(id) => props.onRemoveAttachment?.(id)} /></View> : null}
        <View onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)} style={{ height: expanded ? height + TOOLBAR_HEIGHT : ROW_HEIGHT }}>
          <View className="absolute inset-x-0 bottom-0 flex-row items-center" style={{ height: ROW_HEIGHT }}>
            {props.onAttach ? <ComposerAttachButton disabled={locked} onPress={(anchor) => props.onAttach?.(anchor)} /> : <View className="w-3" />}
            <View onLayout={onSlotLayout} className="min-w-0 flex-1" style={expanded ? { flex: 0, width: 0 } : { minWidth: attachments.length ? 0 : INLINE_EDITOR_MIN_WIDTH }} />
            {!showStrip ? <CompactAttachments attachments={attachments} limit={compactLimit} /> : null}
            <View className="min-w-0 shrink flex-row items-center" style={expanded ? { flex: 1, justifyContent: "flex-end" } : undefined}>
              {props.model ? (
                <View className="min-w-0 shrink">
                  <ComposerModelControl label={props.model.label} logos={props.model.logos} iconOnly={!expanded} onPress={locked ? undefined : props.model.onPress} readOnlyReason={props.model.readOnlyReason} />
                </View>
              ) : null}
              {showStop ? (
                <ComposerActionButton icon={Square} label="Stop" variant="danger" onPress={() => { haptic("press"); props.onStop?.(); }} />
              ) : showResume ? (
                <ComposerActionButton icon={Play} label="Resume queue" onPress={() => { haptic("press"); props.onResume?.(); }} />
              ) : (
                <SendButton presentation={props.send} label={props.sendBlockedReason ?? props.send.label} disabled={!canSend} onSend={send} />
              )}
            </View>
          </View>
          <View
            style={expanded
              ? { position: "absolute", left: 14, right: 14, top: 0, height, paddingVertical: EDITOR_INSET }
              : { position: "absolute", left: slot.x, width: slot.width, top: (ROW_HEIGHT - height) / 2, height, paddingVertical: EDITOR_INSET }}
          >
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={(value) => {
                if (!locked) props.onChangeText(value);
              }}
              onSelectionChange={(event) => setSelection({ text, end: event.nativeEvent.selection.end })}
              onContentSizeChange={(event) => setContentHeight(event.nativeEvent.contentSize.height)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={disabledReason ?? props.placeholder}
              editable={!locked}
              multiline
              scrollEnabled={expanded && contentHeight >= LINE_HEIGHT * MAX_LINES}
              autoFocus={props.autoFocus}
              accessibilityLabel="Message"
              textAlignVertical={expanded ? "top" : "center"}
              className="flex-1 font-sans text-[16px] text-foreground"
              style={{ padding: 0, lineHeight: LINE_HEIGHT }}
              placeholderTextColorClassName="accent-muted-foreground"
              cursorColorClassName="accent-primary"
            />
          </View>
        </View>
      </View>
      {props.below}
    </View>
  );
}

/** A footnote under the composer, in its muted caption style. */
export function ComposerFootnote({ children }: { children: string }) {
  return <Text className="px-1 pt-2 text-[12px] text-muted-foreground">{children}</Text>;
}
