import { useRouter } from "expo-router";
import { Plus, SlidersHorizontal } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Icon, Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useModelLabels } from "./models";
import { changedSettingsCount, type ModelSettings } from "./settings";

/** Opens one model's settings in a chat (or in the new-chat draft). */
export function useOpenModelSettings(chatId: string | null) {
  const router = useRouter();
  return (modelId: string) => router.push({ pathname: "/sheets/[kind]", params: { kind: "model-settings", model: modelId, ...(chatId ? { chatId } : {}) } });
}

export function useOpenModelPicker(chatId: string | null) {
  const router = useRouter();
  return () => router.push({ pathname: "/sheets/[kind]", params: { kind: "chat-models", ...(chatId ? { chatId } : {}) } });
}

/** Up to three lab logos overlapping, for the composer's model button. */
export function ModelLogoStack({ models, size = 18 }: { models: string[]; size?: number }) {
  const labels = useModelLabels();
  const shown = models.slice(0, 3);
  return (
    <View className="flex-row items-center">
      {shown.map((model, index) => (
        <View key={model} className="rounded-[4px] bg-background p-px" style={{ marginLeft: index ? -size * 0.3 : 0, zIndex: shown.length - index }}>
          <Logo id={labels(model).orgId} label={labels(model).orgName} size={size} />
        </View>
      ))}
    </View>
  );
}

/**
 * The selected models as chips with their logos, like the website's chat header: tap a chip for that
 * model's settings in this chat; + adds or changes models. A dot marks models with changed settings.
 */
export function ModelChipRow({ chatId, models, settings, className }: { chatId: string | null; models: string[]; settings: Record<string, ModelSettings>; className?: string }) {
  const labels = useModelLabels();
  const openSettings = useOpenModelSettings(chatId);
  const openPicker = useOpenModelPicker(chatId);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className={cn("grow-0", className)} contentContainerClassName="items-center gap-1.5 px-4">
      {models.map((model) => {
        const { label, orgId, orgName } = labels(model, settings[model]);
        const changed = changedSettingsCount(settings[model]) > 0;
        return (
          <Pressable
            key={model}
            accessibilityRole="button"
            accessibilityLabel={`${label} settings`}
            accessibilityHint="Opens this model's settings for the chat"
            onPress={() => openSettings(model)}
            className="h-8 max-w-[220px] flex-row items-center gap-1.5 rounded-md border border-border bg-background pl-2 pr-2.5 active:bg-accent"
          >
            <Logo id={orgId} label={orgName} size={16} bare />
            <Text variant="small" numberOfLines={1} className="shrink font-medium">{label}</Text>
            {changed ? <View accessibilityLabel="Custom settings" className="h-1.5 w-1.5 rounded-[2px] bg-link" /> : <Icon icon={SlidersHorizontal} tone="muted" size={13} />}
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" accessibilityLabel={models.length ? "Add or change models" : "Choose a model"} onPress={openPicker} className="h-8 flex-row items-center gap-1 rounded-md px-2 active:bg-accent">
        <Icon icon={Plus} tone="muted" size={16} />
        {models.length < 2 ? <Text variant="small" className="font-medium text-muted-foreground">{models.length ? "Compare" : "Add model"}</Text> : null}
      </Pressable>
    </ScrollView>
  );
}
