import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Icon, Text } from "@/components/ui";
import { getOrganisationModels } from "@/lib/api/models";
import { cn } from "@/lib/cn";
import { WEB_ORIGIN } from "@/lib/config";
import { formatCalendarDate } from "@/lib/format";
import type { FaqItem, FaqPart } from "./faq";
import type { SectionId } from "./sections";

/** "Frequently asked questions": the website's questions, each expanding to its answer. */
export function FaqList({ items, onJump }: { items: FaqItem[]; onJump: (section: SectionId) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const press = (part: Exclude<FaqPart, string>) => {
    if (part.section) onJump(part.section);
    else if (part.model) router.push(`/models/${part.model}`);
    else if (part.provider) router.push(`/providers/${part.provider}`);
    else if (part.family) void Linking.openURL(`${WEB_ORIGIN}/families/${part.family}`);
    else if (part.organisation) void Linking.openURL(`${WEB_ORIGIN}/organisations/${part.organisation}`);
  };
  return (
    <View className="border-t border-border">
      {items.map((item) => {
        const expanded = open === item.key;
        return (
          <View key={item.key} className="border-b border-border">
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : item.key)} className="min-h-14 flex-row items-center gap-3 py-3.5 active:bg-accent">
              <Text variant="label" className="flex-1 font-medium">{item.question}</Text>
              <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}><Icon icon={ChevronRight} tone="muted" size={18} /></View>
            </Pressable>
            {expanded ? (
              <Text variant="muted" className="pb-4 leading-[21px]" selectable>
                {item.answer.map((part, index) =>
                  typeof part === "string"
                    ? part
                    : <Text key={index} accessibilityRole="link" onPress={() => press(part)} suppressHighlighting className="font-medium text-link underline">{part.text}</Text>,
                )}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** "Other models from {lab}": the lab's nine most recent other models, in a sideways list like the website's carousel. */
export function OtherModels({ modelId, organisationId }: { modelId: string; organisationId: string }) {
  const router = useRouter();
  const models = useQuery({ queryKey: ["public", "organisation", organisationId, "models"], queryFn: () => getOrganisationModels(organisationId), staleTime: 6 * 60 * 60_000 });
  const others = (models.data ?? []).filter((model) => model.model_id !== modelId).sort((a, b) => (b.primary_timestamp ?? 0) - (a.primary_timestamp ?? 0)).slice(0, 9);
  if (models.isLoading) return null;
  return (
    <View>
      {others.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4" snapToInterval={232} decelerationRate="fast">
          {others.map((model) => (
            <Pressable key={model.model_id} accessibilityRole="link" onPress={() => router.push(`/models/${model.model_id}`)} className={cn("w-[220px] rounded-md border border-border bg-muted/20 px-3 py-3 active:bg-accent")}>
              <Text variant="label" numberOfLines={1}>{model.name ?? model.model_id}</Text>
              <Text variant="caption" numberOfLines={1} className="mt-1">{model.model_id}</Text>
              <Text variant="caption" className="mt-3">{model.primary_date ? formatCalendarDate(model.primary_date) : "Undated"}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text variant="muted" className="px-4">No additional models from this creator are available yet.</Text>
      )}
    </View>
  );
}
