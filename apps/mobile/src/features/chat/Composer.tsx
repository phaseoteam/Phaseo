import { Image } from "expo-image";
import { ArrowUp, AudioLines, Camera, ChevronDown, FileCode2, FileText, ImageIcon, Plus, Square, X } from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, measureAnchor, showActions, Text, toastError, type MenuAction, type ViewRef } from "@/components/ui";
import { cn } from "@/lib/cn";
import { pickAudioFile, pickImages, pickTextFile, removeAttachmentFiles } from "./attachments";
import { ModelLogoStack } from "./ModelChips";
import { useChatModelOptions, useModelLabels } from "./models";
import type { ModelSettings } from "./settings";
import type { ChatAttachment } from "./types";

const MAX_ATTACHMENTS = 6;

const formatSize = (bytes?: number) => (bytes == null ? null : bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** "GPT-6 Astra", or "GPT-6 Astra +2" when several models answer. */
export function modelsLabel(models: string[], label: (id: string) => string) {
  if (!models.length) return "Choose a model";
  if (models.length === 1) return label(models[0]!);
  return `${label(models[0]!)} +${models.length - 1}`;
}

/**
 * The message box, laid out like the website's chat composer: text on top; below it the + menu
 * (what can be attached), the models that will answer, and send or stop.
 */
export function Composer({ models, settings, onModelPress, running, onSend, onStop, autoFocus, disabledReason, seed }: {
  models: string[];
  settings: Record<string, ModelSettings>;
  onModelPress(): void;
  running: boolean;
  onSend(text: string, attachments: ChatAttachment[]): void;
  onStop(): void;
  autoFocus?: boolean;
  disabledReason?: string | null;
  /** Text to put in the box (a suggested prompt); a new `key` puts it in again. */
  seed?: { key: number; text: string } | null;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const attachRef = useRef<ViewRef>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const labels = useModelLabels();
  const { byId } = useChatModelOptions();
  const canSend = !running && !disabledReason && (text.trim().length > 0 || attachments.length > 0);

  // A new suggested prompt replaces the text (state adjusted from a prop, not in an effect), then the box gets focus.
  const [shownSeed, setShownSeed] = useState(seed);
  if (seed !== shownSeed) {
    setShownSeed(seed);
    if (seed) setText(seed.text);
  }
  useEffect(() => {
    if (seed) inputRef.current?.focus();
  }, [seed]);

  const attach = async (kind: "library" | "camera" | "file" | "audio") => {
    try {
      const added = kind === "file" ? await pickTextFile() : kind === "audio" ? await pickAudioFile() : await pickImages(kind);
      setAttachments((current) => [...current, ...added].slice(0, MAX_ATTACHMENTS));
    } catch (error) {
      toastError("Couldn't attach that", error, "Try another file.");
    }
  };

  // What every selected model accepts (images, audio), so the menu only offers what will work.
  const unsupported = (modality: string) => models.filter((model) => !(byId.get(model)?.inputModalities ?? ["text", "image"]).includes(modality)).map((model) => labels(model, settings[model]).label);
  const reason = (names: string[]) => (names.length ? `${names.slice(0, 2).join(" and ")}${names.length > 2 ? ` and ${names.length - 2} more` : ""} can't read ${names.length === 1 ? "it" : "them"}` : undefined);

  const openAttach = async () => {
    const noImages = unsupported("image");
    const noAudio = unsupported("audio");
    const full = attachments.length >= MAX_ATTACHMENTS;
    const actions: MenuAction[] = [
      { key: "library", label: "Photos", icon: ImageIcon, description: reason(noImages) ?? "From your photo library", disabled: full || noImages.length > 0, onPress: () => void attach("library") },
      { key: "camera", label: "Camera", icon: Camera, description: reason(noImages) ?? "Take a photo", disabled: full || noImages.length > 0, onPress: () => void attach("camera") },
      { key: "file", label: "Text or code file", icon: FileCode2, description: "Notes, code, CSV or JSON, up to 200 KB", disabled: full, onPress: () => void attach("file") },
    ];
    // Audio is offered only when every selected model takes it, as the website hides its audio input otherwise.
    if (!noAudio.length) actions.push({ key: "audio", label: "Audio file", icon: AudioLines, description: "A recording, up to 10 MB", disabled: full, onPress: () => void attach("audio") });
    showActions({ title: full ? `Up to ${MAX_ATTACHMENTS} attachments per message` : "Add to message", actions, anchor: await measureAnchor(attachRef) });
  };

  const send = () => {
    if (!canSend) return;
    onSend(text.trim(), attachments);
    setText("");
    setAttachments([]);
  };

  const label = modelsLabel(models, (id) => labels(id, settings[id]).label);

  return (
    <View className="bg-background px-3 pt-1.5" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
      <View className="rounded-md border border-input bg-background px-1.5 pb-1.5 pt-1">
        {attachments.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="gap-2 px-1 pb-1 pt-2">
            {attachments.map((attachment) => (
              <View key={attachment.id}>
                {attachment.kind === "image" ? (
                  <Image source={{ uri: attachment.uri }} style={{ width: 56, height: 56, borderRadius: 6 }} contentFit="cover" accessibilityLabel={attachment.name} />
                ) : (
                  <View className="h-14 w-40 flex-row items-center gap-2 rounded-md border border-border bg-muted/50 px-2">
                    <View className="h-8 w-8 items-center justify-center rounded-md bg-background">
                      <Icon icon={attachment.kind === "audio" ? AudioLines : FileText} tone="muted" size={16} />
                    </View>
                    <View className="flex-1">
                      <Text variant="caption" numberOfLines={1} className="font-medium text-foreground">{attachment.name}</Text>
                      <Text variant="caption" numberOfLines={1}>{[attachment.kind === "audio" ? "Audio" : "Text", formatSize(attachment.size)].filter(Boolean).join(" · ")}</Text>
                    </View>
                  </View>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${attachment.name}`} hitSlop={8} onPress={() => { removeAttachmentFiles([attachment]); setAttachments((current) => current.filter((entry) => entry.id !== attachment.id)); }} className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-[4px] bg-foreground">
                  <Icon icon={X} tone="background" size={12} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={disabledReason ?? (models.length > 1 ? `Message ${models.length} models` : "Message")}
          editable={!disabledReason}
          multiline
          autoFocus={autoFocus}
          accessibilityLabel="Message"
          className="max-h-40 min-h-11 px-2 py-2.5 font-sans text-[16px] leading-[22px] text-foreground"
          placeholderTextColorClassName="accent-muted-foreground"
          cursorColorClassName="accent-primary"
        />
        <View className="flex-row items-center gap-1">
          <View ref={attachRef} collapsable={false}>
            <Pressable accessibilityRole="button" accessibilityLabel="Add photos and files" disabled={Boolean(disabledReason)} onPress={() => void openAttach()} className="h-9 w-9 items-center justify-center rounded-md active:bg-accent disabled:opacity-40">
              <Icon icon={Plus} tone="foreground" size={20} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Models: ${label}`} accessibilityHint="Choose which models answer" onPress={onModelPress} className="h-9 max-w-[72%] flex-row items-center gap-2 rounded-md pl-1.5 pr-2 active:bg-accent">
            {models.length ? <ModelLogoStack models={models} size={18} /> : null}
            <Text variant="small" numberOfLines={1} className="shrink font-semibold">{label}</Text>
            <Icon icon={ChevronDown} tone="muted" size={14} />
          </Pressable>
          <View className="flex-1" />
          {running ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Stop" onPress={onStop} className="h-9 w-9 items-center justify-center rounded-md bg-foreground">
              <Icon icon={Square} tone="background" size={14} />
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!canSend} onPress={send} className={cn("h-9 w-9 items-center justify-center rounded-md", canSend ? "bg-primary" : "bg-muted")}>
              <Icon icon={ArrowUp} tone={canSend ? "primary-foreground" : "muted"} size={18} strokeWidth={2.4} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
