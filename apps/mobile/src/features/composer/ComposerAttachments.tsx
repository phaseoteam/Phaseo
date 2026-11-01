import { Image } from "expo-image";
import { AudioLines, FileText, X } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Icon, Text } from "@/components/ui";
import type { ChatAttachment } from "@/features/chat/types";

/** One attachment as a square: the picture, or the file's icon with its name under it. */
export function AttachmentThumbnail({ attachment, size, compact }: { attachment: ChatAttachment; size: number; compact?: boolean }) {
  if (attachment.kind === "image") {
    return <Image source={{ uri: attachment.uri }} style={{ width: size, height: size, borderRadius: 8 }} contentFit="cover" accessibilityLabel={attachment.name} />;
  }
  return (
    <View accessible accessibilityLabel={attachment.name} className="items-center justify-center gap-1 rounded-md bg-muted px-1.5" style={{ width: size, height: size }}>
      <Icon icon={attachment.kind === "audio" ? AudioLines : FileText} tone="muted" size={compact ? 15 : 22} />
      {compact ? null : <Text numberOfLines={1} className="w-full text-center text-[11px] text-foreground">{attachment.name}</Text>}
    </View>
  );
}

/** The draft's attachments in a row inside the focused composer, each with a remove button on its corner. */
export function AttachmentStrip({ attachments, disabled, onRemove }: { attachments: ChatAttachment[]; disabled?: boolean; onRemove(id: string): void }) {
  if (!attachments.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" className="grow-0" contentContainerClassName="flex-row gap-2.5">
      {attachments.map((attachment) => (
        <View key={attachment.id} className="relative">
          <AttachmentThumbnail attachment={attachment} size={72} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${attachment.name}`}
            disabled={disabled}
            hitSlop={6}
            onPress={() => onRemove(attachment.id)}
            className="absolute right-1 top-1 h-[22px] w-[22px] items-center justify-center rounded-md bg-black/55"
          >
            <Icon icon={X} color="#ffffff" size={11} strokeWidth={2.6} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

/** Up to `limit` small thumbnails beside one line of text when the composer isn't focused, and "+N" for the rest. */
export function CompactAttachments({ attachments, limit }: { attachments: ChatAttachment[]; limit: number }) {
  if (!attachments.length) return null;
  return (
    <View className="h-[44px] shrink-0 flex-row items-center gap-1 pl-1">
      {attachments.slice(0, limit).map((attachment) => <AttachmentThumbnail key={attachment.id} attachment={attachment} size={30} compact />)}
      {attachments.length > limit ? (
        <View className="size-[30px] items-center justify-center rounded-md bg-muted">
          <Text className="text-[11px] font-bold text-muted-foreground">{`+${attachments.length - limit}`}</Text>
        </View>
      ) : null}
    </View>
  );
}
