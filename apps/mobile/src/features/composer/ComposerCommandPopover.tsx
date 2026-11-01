import { SquareTerminal } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Icon, Text } from "@/components/ui";
import type { ComposerCommand } from "./commands";

/** The `/` menu over the composer: a heading, then each command with what it does. */
export function ComposerCommandPopover({ commands, onSelect }: { commands: ComposerCommand[]; onSelect(command: ComposerCommand): void }) {
  return (
    <View className="mb-2 overflow-hidden rounded-md border border-border bg-popover shadow-md">
      <Text className="px-3.5 pb-1 pt-2.5 text-[12px] font-semibold text-muted-foreground">Commands</Text>
      <ScrollView className="max-h-[180px]" keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false}>
        {commands.map((command, index) => (
          <Pressable
            key={command.id}
            accessibilityRole="button"
            accessibilityLabel={`${command.label}, ${command.description}`}
            onPress={() => onSelect(command)}
            className="flex-row items-center gap-2.5 border-border px-3.5 py-2.5 active:opacity-60"
            style={{ borderBottomWidth: index === commands.length - 1 ? 0 : StyleSheet.hairlineWidth }}
          >
            <Icon icon={SquareTerminal} tone="muted" size={14} />
            <Text numberOfLines={1} className="shrink-0 text-[16px] font-medium text-foreground">{command.label}</Text>
            <Text numberOfLines={1} className="min-w-0 flex-1 text-[12px] text-muted-foreground">{command.description}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
