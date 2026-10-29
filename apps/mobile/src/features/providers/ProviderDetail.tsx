import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Badge, Button, EmptyState, Fact, Header, LoadingState, ReadableWidth, Row, Screen, Section, Segmented, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { getProviderMetrics, getProviderModels } from "@/lib/api/providers";
import { formatCompact, formatMs, formatPercent, formatPrice, modalityLabel } from "@/lib/format";
import { regionsLabel, trainingLabel } from "./labels";
import { useProviders } from "./ProviderBrowser";

export function ProviderDetail({ id }: { id: string }) {
  const router = useRouter();
  const { split } = useLayout();
  const providers = useProviders();
  const provider = providers.data?.find((entry) => entry.api_provider_id === id);
  const models = useQuery({ queryKey: ["public", "provider", id, "models"], queryFn: () => getProviderModels(id) });
  const metrics = useQuery({ queryKey: ["public", "provider", id, "metrics"], queryFn: () => getProviderMetrics(id, 24), staleTime: 60_000 });
  const [scope, setScope] = useState<"active" | "all">("active");
  const listed = useMemo(() => {
    const all = models.data ?? [];
    return (scope === "active" ? all.filter((model) => model.is_active_gateway) : all).slice().sort((a, b) => (b.release_date ?? "").localeCompare(a.release_date ?? ""));
  }, [models.data, scope]);

  if (providers.isLoading) return <Screen><Header back={!split} /><LoadingState /></Screen>;
  if (!provider) return <Screen><Header back={!split} /><EmptyState title="Provider not found" body="It may have been renamed or removed." /></Screen>;

  const summary = metrics.data?.summary;
  return (
    <Screen>
      <Header back={!split} />
      <ScrollView contentContainerClassName="pb-16">
        <ReadableWidth>
          <View className="flex-row items-center gap-3 px-4 pt-2">
            <Logo id={provider.api_provider_id} label={provider.api_provider_name} colour={provider.colour} size={48} />
            <View className="flex-1">
              <Text variant="title">{provider.api_provider_name}</Text>
              <Text variant="muted">{provider.active_models ? `${provider.active_models} models on Phaseo` : "Not routed through Phaseo yet"}</Text>
            </View>
          </View>
          <View className="mt-3 flex-row flex-wrap gap-1.5 px-4">
            {provider.zero_data_retention ? <Badge label="Zero data retention" tone="success" /> : null}
            {provider.byok_available ? <Badge label="Bring your own key" tone="primary" /> : null}
            {provider.free_models ? <Badge label={`${provider.free_models} free models`} /> : null}
          </View>

          {summary && (summary.requests24h ?? 0) > 0 ? (
            <Section title="Last 24 hours on Phaseo">
              <Fact label="Uptime" value={formatPercent(summary.uptimePct)} />
              <Fact label="Time to first token" value={formatMs(summary.avgLatencyMs)} />
              <Fact label="Throughput" value={summary.avgThroughput != null ? `${Math.round(summary.avgThroughput)} tokens/s` : undefined} />
              <Fact label="Requests" value={formatCompact(summary.requests24h)} last />
            </Section>
          ) : null}

          <Section title="Usage">
            <Fact label="Tokens, last 30 days" value={formatCompact(provider.total_monthly_tokens)} />
            <Fact label="Tokens, last 24 hours" value={formatCompact(provider.total_daily_tokens)} />
            <Fact label="Share of Phaseo requests today" value={provider.daily_share_pct ? formatPercent(provider.daily_share_pct) : undefined} last />
          </Section>

          <Section title="Data and privacy">
            <Fact label="Prompt training" value={trainingLabel(provider.prompt_training_policy)} />
            <Fact label="Data retention" value={provider.zero_data_retention ? "None" : provider.data_retention_days != null ? `${provider.data_retention_days} days` : "Not published"} />
            <Fact label="Runs in" value={regionsLabel(provider.default_execution_regions)} last />
            <View className="flex-row gap-2 px-4 pt-3">
              {provider.privacy_policy_url ? <Button label="Privacy policy" variant="outline" size="sm" onPress={() => void Linking.openURL(provider.privacy_policy_url!)} /> : null}
              {provider.terms_of_service_url ? <Button label="Terms" variant="outline" size="sm" onPress={() => void Linking.openURL(provider.terms_of_service_url!)} /> : null}
            </View>
          </Section>

          <Section title="Models">
            <View className="px-4 pb-2 pt-1">
              <Segmented<"active" | "all"> value={scope} onChange={setScope} options={[{ value: "active", label: "On Phaseo" }, { value: "all", label: "All" }]} />
            </View>
            {models.isLoading ? <LoadingState /> : listed.length === 0 ? <Text variant="muted" className="px-4 py-3">No models listed.</Text> : listed.map((model, index) => (
              <Row
                key={model.model_id}
                title={model.model_name ?? model.model_id}
                subtitle={[model.input_price_per_1m_usd != null ? `${formatPrice(model.input_price_per_1m_usd)} in · ${formatPrice(model.output_price_per_1m_usd)} out` : null, (model.output_modalities ?? []).map(modalityLabel).join(", ") || null].filter(Boolean).join(" · ") || null}
                onPress={() => router.push(`/models/${model.model_id}`)}
                last={index === listed.length - 1}
              />
            ))}
          </Section>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
