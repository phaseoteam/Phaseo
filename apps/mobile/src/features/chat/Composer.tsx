import { Image } from "expo-image";
import { ArrowUp, FileText, Plus, Square, X } from "lucide-react-native";
import { useState } from "react";
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { pickImages, pickTextFile, removeAttachmentFiles } from "./attachments";
import type { ChatAttachment } from "./types";

export function Composer({ modelLabel, onModelPress, running, onSend, onStop, autoFocus, disabledReason }: {
  modelLabel: string;
  onModelPress(): void;
  running: boolean;
  onSend(text: string, attachments: ChatAttachment[]): void;
  onStop(): void;
  autoFocus?: boolean;
  disabledReason?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const canSend = !running && !disabledReason && (text.trim().length > 0 || attachments.length > 0);

  const attach = async (kind: "library" | "camera" | "file") => {
    try {
      const added = kind === "file" ? await pickTextFile() : await pickImages(kind);
      setAttachments((current) => [...current, ...added].slice(0, 6));
    } catch (error) {
      Alert.alert("Couldn't attach that", error instanceof Error ? error.message : "Try another file.");
    }
  };

  const openAttach = () => {
    const options = ["Photo library", "Take photo", "Text file"] as const;
    const kinds = ["library", "camera", "file"] as const;
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...options, "Cancel"], cancelButtonIndex: 3 }, (index) => { if (index < 3) void attach(kinds[index]!); });
    } else {
      Alert.alert("Attach", undefined, options.map((label, index) => ({ text: label, onPress: () => void attach(kinds[index]!) })), { cancelable: true });
    }
  };

  const send = () => {
    if (!canSend) return;
    onSend(text.trim(), attachments);
    setText("");
    setAttachments([]);
  };

  return (
    <View className="bg-background px-3 pt-2" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
        <View className="rounded-md border border-input bg-background px-2 pb-2 pt-1">
          {attachments.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-1 pt-1.5">
              {attachments.map((attachment) => (
                <View key={attachment.id}>
                  {attachment.kind === "image" ? (
                    <Image source={{ uri: attachment.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} contentFit="cover" />
                  ) : (
                    <View className="h-14 w-28 justify-center rounded-md bg-muted px-2">
                      <Icon icon={FileText} tone="muted" size={16} />
                      <Text variant="caption" numberOfLines={1}>{attachment.name}</Text>
                    </View>
                  )}
                  <Pressable accessibilityLabel={`Remove ${attachment.name}`} hitSlop={8} onPress={() => { removeAttachmentFiles([attachment]); setAttachments((current) => current.filter((entry) => entry.id !== attachment.id)); }} className="absolute -right-1.5 -top-1.5 h-5 w-5 items-center justify-center rounded-md bg-foreground">
                    <Icon icon={X} tone="primary-foreground" size={12} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={disabledReason ?? "Message"}
            editable={!disabledReason}
            multiline
            autoFocus={autoFocus}
            className="max-h-40 min-h-11 px-2 py-2.5 font-sans text-[16px] leading-[22px] text-foreground"
            placeholderTextColorClassName="accent-muted-foreground"
            cursorColorClassName="accent-primary"
          />
          <View className="flex-row items-center gap-1">
            <Pressable accessibilityLabel="Attach" onPress={openAttach} className="h-9 w-9 items-center justify-center rounded-md active:bg-accent">
              <Icon icon={Plus} tone="muted" size={20} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Model: ${modelLabel}`} onPress={onModelPress} className="h-9 max-w-[70%] flex-row items-center rounded-md px-3 active:bg-accent">
              <Text variant="small" numberOfLines={1} className="font-semibold text-muted-foreground">{modelLabel}</Text>
            </Pressable>
            <View className="flex-1" />
            {running ? (
              <Pressable accessibilityLabel="Stop" onPress={onStop} className="h-9 w-9 items-center justify-center rounded-md bg-foreground">
                <Icon icon={Square} tone="primary-foreground" size={14} />
              </Pressable>
            ) : (
              <Pressable accessibilityLabel="Send" disabled={!canSend} onPress={send} className={cn("h-9 w-9 items-center justify-center rounded-md", canSend ? "bg-primary" : "bg-muted")}>
                <Icon icon={ArrowUp} tone={canSend ? "primary-foreground" : "muted"} size={18} strokeWidth={2.4} />
              </Pressable>
            )}
          </View>
        </View>
    </View>
  );
}

