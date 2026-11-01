import { ListOrdered, Pencil, X } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Callout, CALLOUT_TONES, Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";

/** A send or attach that failed, over the composer until dismissed. */
export function ComposerErrorNotice({ message, onDismiss }: { message: string; onDismiss(): void }) {
  return (
    <View className="pb-3">
      <Callout tone="critical" role="alert">
        <View className="flex-row items-start gap-2">
          <Text variant="muted" className={cn("flex-1", CALLOUT_TONES.critical.description)}>{message}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" hitSlop={12} onPress={onDismiss} className="active:opacity-60">
            <Icon icon={X} tone="muted" size={14} />
          </Pressable>
        </View>
      </Callout>
    </View>
  );
}

/** Above the composer while a queued message is open in it. */
export function ComposerQueuedEditBanner({ onCancel }: { onCancel(): void }) {
  return (
    <View className="flex-row items-center gap-2 px-1 pb-2">
      <Icon icon={Pencil} tone="muted" size={12} />
      <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">Editing queued message</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel editing queued message" hitSlop={8} onPress={onCancel} className="rounded-md px-2 py-1 active:bg-accent">
        <Text variant="label" className="text-link">Cancel</Text>
      </Pressable>
    </View>
  );
}

export type QueuedRow = { id: string; text: string; attachments: number; editing: boolean };

/** Messages waiting for the running turn, oldest first: each can be opened in the composer to edit, or removed. */
export function ComposerQueue({ rows, held, onEdit, onRemove }: { rows: QueuedRow[]; held: boolean; onEdit(id: string): void; onRemove(id: string): void }) {
  if (!rows.length) return null;
  const editingAny = rows.some((row) => row.editing);
  return (
    <View className="mb-2 overflow-hidden rounded-md border border-border bg-card">
      <Text variant="caption" className="px-3 pb-0.5 pt-2 font-semibold">{held ? "Queue paused" : rows.length === 1 ? "1 queued message" : `${rows.length} queued messages`}</Text>
      {rows.map((row) => (
        <View key={row.id} className="min-h-10 flex-row items-center gap-2 pl-3 pr-1">
          <Icon icon={ListOrdered} tone="muted" size={13} />
          <Text variant="muted" numberOfLines={1} className={cn("min-w-0 flex-1", !row.editing && "text-foreground")}>
            {row.text || (row.attachments === 1 ? "1 attachment" : `${row.attachments} attachments`)}
          </Text>
          {/* The message in the composer is saved or cancelled from there. */}
          {row.editing ? <Text variant="caption" className="pr-2">Editing</Text> : (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel="Edit queued message" disabled={editingAny} onPress={() => onEdit(row.id)} className="size-9 items-center justify-center rounded-md active:bg-accent disabled:opacity-40">
                <Icon icon={Pencil} tone="muted" size={14} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Remove queued message" onPress={() => onRemove(row.id)} className="size-9 items-center justify-center rounded-md active:bg-accent">
                <Icon icon={X} tone="muted" size={15} />
              </Pressable>
            </>
          )}
        </View>
      ))}
    </View>
  );
}
