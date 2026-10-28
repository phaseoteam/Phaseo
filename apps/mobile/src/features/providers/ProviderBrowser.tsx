import { useQuery } from "@tanstack/react-query";
import { LegendList } from "@legendapp/list/react-native";
import { usePathname } from "expo-router";
import { CircleCheck, KeyRound, Server, ShieldCheck } from "lucide-react-native";
import { memo, useCallback, useDeferredValue, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Logo } from "@/components/Logo";
import { useOpenDetail } from "@/components/shell/SplitStack";
import { Badge, Chip, ChipRow, EmptyState, ErrorState, Header, Screen, SearchField, SkeletonRows, Text } from "@/components/ui";
import { getProviders, type Provider } from "@/lib/api/providers";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";

export function useProviders() {
  return useQuery({ queryKey: ["public", "providers"], queryFn: getProviders, staleTime: 30 * 60 * 1000 });
}

type ProviderFilter = "phaseo" | "zdr" | "byok" | "all";

function matches(provider: Provider, filter: ProviderFilter, query: string) {
  if (filter === "phaseo" && !(provider.is_gateway_provider && provider.active_models > 0)) return false;
  if (filter === "zdr" && !provider.zero_data_retention) return false;
  if (filter === "byok" && !provider.byok_available) return false;
  const search = query.trim().toLocaleLowerCase();
  return !search || provider.api_provider_name.toLocaleLowerCase().includes(search) || provider.api_provider_id.includes(search);
}

export function ProviderBrowser() {
  const providers = useProviders();
  const pathname = usePathname();
  const openDetail = useOpenDetail("/providers");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProviderFilter>("phaseo");
  const deferredQuery = useDeferredValue(query);
  const list = useMemo(
    () => (providers.data ?? []).filter((provider) => matches(provider, filter, deferredQuery)).sort((a, b) => b.total_monthly_tokens - a.total_monthly_tokens || b.active_models - a.active_models || a.api_provider_name.localeCompare(b.api_provider_name)),
    [providers.data, filter, deferredQuery],
  );
  const selectedId = pathname.startsWith("/providers/") ? pathname.slice("/providers/".length) : null;
  const renderItem = useCallback(({ item }: { item: Provider }) => <ProviderRow provider={item} selected={item.api_provider_id === selectedId} onPress={() => openDetail(`/providers/${item.api_provider_id}`)} />, [selectedId, openDetail]);

  return (
    <Screen>
      <Header large title="Providers" subtitle={providers.data ? `${list.length} of ${providers.data.length}` : null} />
      <View className="px-4 pb-2"><SearchField value={query} onChangeText={setQuery} placeholder="Search providers" /></View>
      <ChipRow className="pb-2">
        <Chip label="On Phaseo" icon={CircleCheck} selected={filter === "phaseo"} onPress={() => setFilter(filter === "phaseo" ? "all" : "phaseo")} />
        <Chip label="Zero data retention" icon={ShieldCheck} selected={filter === "zdr"} onPress={() => setFilter(filter === "zdr" ? "all" : "zdr")} />
        <Chip label="Bring your own key" icon={KeyRound} selected={filter === "byok"} onPress={() => setFilter(filter === "byok" ? "all" : "byok")} />
      </ChipRow>
      {providers.isLoading ? <SkeletonRows /> : providers.isError && !providers.data ? <ErrorState error={providers.error} onRetry={() => void providers.refetch()} /> : (
        <LegendList
          data={list}
          keyExtractor={(item) => item.api_provider_id}
          renderItem={renderItem}
          extraData={selectedId}
          estimatedItemSize={63}
          recycleItems
          keyboardDismissMode="on-drag"
          ListEmptyComponent={<EmptyState icon={Server} title="No providers match" body="Try another search or filter." />}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </Screen>
  );
}

const ProviderRow = memo(function ProviderRow({ provider, selected, onPress }: { provider: Provider; selected: boolean; onPress(): void }) {
  const parts = [provider.active_models ? `${provider.active_models} on Phaseo` : `${provider.total_models} models`];
  if (provider.total_monthly_tokens > 0) parts.push(`${formatCompact(provider.total_monthly_tokens)} tokens / 30 days`);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className={cn("flex-row items-center gap-3 px-4 active:bg-accent", selected && "bg-accent")}>
      <Logo id={provider.api_provider_id} label={provider.api_provider_name} colour={provider.colour} size={34} />
      <View className="min-h-[62px] flex-1 justify-center border-b border-border py-2.5">
        <View className="flex-row items-center gap-2">
          <Text variant="body" numberOfLines={1} className="shrink font-semibold">{provider.api_provider_name}</Text>
          {provider.zero_data_retention ? <Badge label="ZDR" tone="success" /> : null}
          {provider.free_models ? <Badge label={`${provider.free_models} free`} /> : null}
        </View>
        <Text variant="caption" numberOfLines={1} className="mt-0.5">{parts.join(" · ")}</Text>
      </View>
    </Pressable>
  );
});
