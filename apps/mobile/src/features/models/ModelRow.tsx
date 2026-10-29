import { Check } from "lucide-react-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Badge, Icon, Text } from "@/components/ui";
import type { ModelCard } from "@/lib/api/models";
import { contextWindow, isFree, isOnPhaseo, modelName, organisationName } from "@/lib/catalogue";
import { cn } from "@/lib/cn";
import { formatPrice, formatTokens } from "@/lib/format";

function summary(model: ModelCard) {
  const parts = [organisationName(model)];
  const context = contextWindow(model);
  if (context) parts.push(`${formatTokens(context)} context`);
  if (model.lowest_input_price != null && model.lowest_output_price != null) parts.push(`${formatPrice(model.lowest_input_price)} in · ${formatPrice(model.lowest_output_price)} out`);
  return parts.join(" · ");
}

export const ModelRow = memo(function ModelRow({ model, selected, comparing, onPress, onLongPress }: { model: ModelCard; selected?: boolean; comparing?: boolean; onPress(): void; onLongPress?(): void }) {
  const status = model.gateway_status;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={modelName(model)}
      accessibilityState={{ selected: selected || comparing }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      className={cn("flex-row items-center gap-3 px-4 active:bg-accent", selected && "bg-accent")}
    >
      <View>
        <Logo id={model.organisation_id} label={organisationName(model)} colour={model.organisation_colour} size={34} />
        {comparing ? (
          <View className="absolute -right-1 -top-1 h-4 w-4 items-center justify-center rounded-[4px] bg-primary">
            <Icon icon={Check} tone="primary-foreground" size={11} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <View className="min-h-[62px] flex-1 justify-center border-b border-border py-2.5">
        <View className="flex-row items-center gap-2">
          <Text variant="body" numberOfLines={1} className="shrink font-semibold">{modelName(model)}</Text>
          {isFree(model) ? <Badge label="Free" tone="success" /> : null}
          {status === "coming_soon" ? <Badge label="Coming soon" /> : status === "deprecated" ? <Badge label="Deprecated" tone="warning" /> : status === "retired" ? <Badge label="Retired" /> : null}
        </View>
        <Text variant="caption" numberOfLines={1} className="mt-0.5">{summary(model)}</Text>
        {!isOnPhaseo(model) && status !== "coming_soon" && status !== "retired" ? <Text variant="caption" className="mt-0.5">Not on Phaseo yet</Text> : null}
      </View>
    </Pressable>
  );
});
