import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Columns3, ExternalLink, MessageSquare } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { BarChart } from "@/components/charts";
import { Logo } from "@/components/Logo";
import { Badge, Button, EmptyState, Fact, Header, LoadingState, ReadableWidth, Row, Screen, Section, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { getModel, getModelActivity, getModelApps, getModelBenchmarks, getModelGatewayMetadata, getModelPerformance, getModelPricing, getModelSubscriptions, getModelTimeline } from "@/lib/api/models";
import { contextWindow, isChatModel, isFree, isOnPhaseo, modelName, organisationName } from "@/lib/catalogue";
import { WEB_ORIGIN } from "@/lib/config";
import { formatCompact, formatDate, formatMs, formatPercent, formatPrice, formatShortDate, formatTokens, modalityLabel } from "@/lib/format";
import { compareStore, toggleCompare, useCatalogueIndex } from "./state";
import { isRoutable, plansFor, priceLines, providerLabel, sortByRoutable } from "./pricing";

const publicKey = (id: string, part: string) => ["public", "model", id, part] as const;

export function ModelDetail({ id }: { id: string }) {
  const router = useRouter();
  const { split } = useLayout();
  const { index } = useCatalogueIndex();
  const card = index.get(id);
  const comparing = compareStore.use().includes(id);

  const model = useQuery({ queryKey: publicKey(id, "detail"), queryFn: () => getModel(id) });
  const gateway = useQuery({ queryKey: publicKey(id, "gateway"), queryFn: () => getModelGatewayMetadata(id) });
  const pricing = useQuery({ queryKey: publicKey(id, "pricing"), queryFn: () => getModelPricing(id) });
  const performance = useQuery({ queryKey: publicKey(id, "performance"), queryFn: () => getModelPerformance(id), staleTime: 60_000 });
  const benchmarks = useQuery({ queryKey: publicKey(id, "benchmarks"), queryFn: () => getModelBenchmarks(id) });
  const activity = useQuery({ queryKey: publicKey(id, "activity"), queryFn: () => getModelActivity(id) });
  const apps = useQuery({ queryKey: publicKey(id, "apps"), queryFn: () => getModelApps(id) });
  const plans = useQuery({ queryKey: publicKey(id, "plans"), queryFn: () => getModelSubscriptions(id) });
  const timeline = useQuery({ queryKey: publicKey(id, "timeline"), queryFn: () => getModelTimeline(id) });

  const refreshing = model.isRefetching || pricing.isRefetching;
  const refresh = () => { for (const query of [model, gateway, pricing, performance, benchmarks, activity, apps, plans, timeline]) void query.refetch(); };

  const name = card ? modelName(card) : model.data?.name ?? id.split("/").at(-1) ?? id;
  const org = card ? organisationName(card) : model.data?.organisation?.name ?? model.data?.organisation_id ?? id.split("/")[0];
  const onPhaseo = card ? isOnPhaseo(card) : (gateway.data?.activeProviders.length ?? 0) > 0;
  const canChat = card ? isChatModel(card) : onPhaseo;
  const maxOutput = Math.max(0, ...(gateway.data?.activeProviders ?? []).map((route) => route.max_output_tokens ?? 0));
  const inputs = card?.gateway_input_modalities.length ? card.gateway_input_modalities : model.data?.input_modalities ?? [];
  const outputs = card?.gateway_output_modalities.length ? card.gateway_output_modalities : model.data?.output_modalities ?? [];

  if (model.isLoading && !card) return <Screen><Header back={!split} /><LoadingState /></Screen>;
  if (model.isError && !card) return <Screen><Header back={!split} /><EmptyState title="Model not found" body="It may have been renamed or removed from the catalogue." /></Screen>;

  return (
    <Screen>
      <Header back={!split} />
      <ScrollView contentContainerClassName="pb-16" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <ReadableWidth>
          <View className="flex-row items-center gap-3 px-4 pt-2">
            <Logo id={card?.organisation_id ?? model.data?.organisation_id} label={org} colour={card?.organisation_colour} size={48} />
            <View className="flex-1">
              <Text variant="title" selectable>{name}</Text>
              <Text variant="muted">{org}</Text>
            </View>
          </View>
          <View className="mt-3 flex-row flex-wrap gap-1.5 px-4">
            {onPhaseo ? <Badge label="On Phaseo" tone="primary" /> : card?.gateway_status === "coming_soon" ? <Badge label="Coming soon" /> : <Badge label="Not on Phaseo" />}
            {card && isFree(card) ? <Badge label="Free" tone="success" /> : null}
            {model.data?.deprecation_date ? <Badge label={`Deprecated ${formatShortDate(model.data.deprecation_date)}`} tone="warning" /> : null}
            {model.data?.retirement_date ? <Badge label={`Retires ${formatShortDate(model.data.retirement_date)}`} tone="destructive" /> : null}
          </View>
          <Text variant="mono" className="mt-2 px-4" selectable>{gateway.data?.primaryModelIdentifier ?? id}</Text>
          {model.data?.description ?? card?.description ? <Description text={(model.data?.description ?? card?.description)!} /> : null}

          <View className="mt-4 flex-row gap-2 px-4">
            {canChat ? <Button label="Chat" icon={MessageSquare} className="flex-1" onPress={() => router.push({ pathname: "/chat/new", params: { model: id } })} /> : null}
            <Button label={comparing ? "Comparing" : "Compare"} icon={Columns3} variant="outline" className="flex-1" onPress={() => toggleCompare(id)} />
            <Button label="Web" icon={ExternalLink} variant="ghost" onPress={() => void Linking.openURL(`${WEB_ORIGIN}/models/${id}`)} />
          </View>

          <Section title="At a glance">
            <Fact label="Context window" value={formatTokens(card ? contextWindow(card) : model.data?.context_length)} />
            <Fact label="Max output" value={maxOutput ? formatTokens(maxOutput) : undefined} />
            <Fact label="Input price" value={card?.lowest_input_price != null ? `${formatPrice(card.lowest_input_price)} / 1M tokens` : undefined} />
            <Fact label="Output price" value={card?.lowest_output_price != null ? `${formatPrice(card.lowest_output_price)} / 1M tokens` : undefined} />
            <Fact label="Input" value={inputs.map(modalityLabel).join(", ")} />
            <Fact label="Output" value={outputs.map(modalityLabel).join(", ")} />
            <Fact label="Released" value={model.data?.release_date ? formatDate(model.data.release_date) : undefined} />
            <Fact label="Announced" value={model.data?.announcement_date ? formatDate(model.data.announcement_date) : undefined} />
            <Fact label="Licence" value={model.data?.license ?? undefined} />
            <Fact label="Family" value={model.data?.model_family?.display_name ?? undefined} last />
          </Section>

          <Section title="Providers" description={onPhaseo ? "Routes Phaseo can send this model's requests to." : undefined}>
            {gateway.isLoading ? <LoadingState /> : (gateway.data?.activeProviders.length ?? 0) + (gateway.data?.comingSoonProviders.length ?? 0) === 0 ? (
              <Text variant="muted" className="px-4 py-3">No providers serve this model through Phaseo yet.</Text>
            ) : (
              <>
                {dedupeRoutes(gateway.data!.activeProviders).map((route, index, list) => (
                  <Row
                    key={route.api_provider_id ?? index}
                    leading={<Logo id={route.api_provider_id} label={route.provider?.api_provider_name} size={28} />}
                    title={route.provider?.api_provider_name ?? route.api_provider_id ?? "Provider"}
                    subtitle={[route.context_length ? `${formatTokens(route.context_length)} context` : null, route.max_output_tokens ? `${formatTokens(route.max_output_tokens)} output` : null].filter(Boolean).join(" · ") || null}
                    onPress={route.api_provider_id ? () => router.push(`/providers/${route.api_provider_id}`) : undefined}
                    last={index === list.length - 1 && !gateway.data!.comingSoonProviders.length}
                  />
                ))}
                {dedupeRoutes(gateway.data!.comingSoonProviders).map((route, index, list) => (
                  <Row key={`soon-${route.api_provider_id ?? index}`} leading={<Logo id={route.api_provider_id} label={route.provider?.api_provider_name} size={28} />} title={route.provider?.api_provider_name ?? route.api_provider_id ?? "Provider"} value="Coming soon" last={index === list.length - 1} />
                ))}
              </>
            )}
          </Section>

          <PricingSection pricing={pricing.data} loading={pricing.isLoading} />

          {performance.data && performance.data.summary.totalRequests > 0 ? (
            <Section title="Performance" description="Median over the last 3 days of Phaseo traffic.">
              <Fact label="Throughput" value={performance.data.summary.avgThroughput != null ? `${Math.round(performance.data.summary.avgThroughput)} tokens/s` : undefined} />
              <Fact label="Time to first token" value={formatMs(performance.data.summary.avgLatencyMs)} />
              <Fact label="Uptime" value={formatPercent(performance.data.summary.uptimePct)} />
              <Fact label="Requests" value={formatCompact(performance.data.summary.totalRequests)} last />
            </Section>
          ) : null}

          {benchmarks.data?.length ? (
            <Section title="Benchmarks">
              {benchmarks.data.slice(0, 10).map((benchmark, index, list) => (
                <Fact
                  key={benchmark.benchmarkId ?? index}
                  label={benchmark.benchmarkName ?? benchmark.benchmarkId ?? "Benchmark"}
                  value={[benchmark.scoreDisplay ?? (benchmark.score != null ? String(benchmark.score) : null), benchmark.rank && benchmark.totalModels ? `#${benchmark.rank} of ${benchmark.totalModels}` : null].filter(Boolean).join("  ·  ")}
                  last={index === list.length - 1}
                />
              ))}
            </Section>
          ) : null}

          {activity.data?.some((row) => row.totalTokens > 0) ? (
            <Section title="Usage on Phaseo" description={`${formatCompact(activity.data.reduce((sum, row) => sum + row.totalTokens, 0))} tokens in the last 30 days`}>
              <BarChart className="mt-3" values={activity.data.map((row) => row.totalTokens)} labels={[formatShortDate(activity.data[0]?.dayBucket), formatShortDate(activity.data.at(-1)?.dayBucket)]} />
            </Section>
          ) : null}

          {apps.data?.length ? (
            <Section title="Apps using it">
              {apps.data.slice(0, 6).map((app, index, list) => (
                <Row key={app.appId} title={app.title} subtitle={`${formatCompact(app.totalTokens)} tokens`} onPress={app.url ? () => void Linking.openURL(app.url!) : undefined} last={index === list.length - 1} />
              ))}
            </Section>
          ) : null}

          {plans.data?.length ? (
            <Section title="Included in subscriptions">
              {plans.data.map((plan, index, list) => (
                <Row
                  key={plan.plan_id ?? plan.name ?? index}
                  title={plan.name ?? "Plan"}
                  subtitle={plan.organisation?.name ?? null}
                  value={plan.prices[0] ? `${new Intl.NumberFormat("en-GB", { style: "currency", currency: plan.prices[0].currency }).format(plan.prices[0].price)} / ${plan.prices[0].frequency}` : null}
                  onPress={plan.link ? () => void Linking.openURL(plan.link!) : undefined}
                  last={index === list.length - 1}
                />
              ))}
            </Section>
          ) : null}

          {timeline.data?.length ? (
            <Section title="Timeline">
              {timeline.data.slice(0, 8).map((event, index, list) => (
                <Fact key={`${event.date}-${index}`} label={event.eventName ?? event.eventType ?? "Update"} value={formatDate(event.date)} last={index === list.length - 1} />
              ))}
            </Section>
          ) : null}

          {model.data?.model_links?.length ? (
            <Section title="Links">
              {model.data.model_links.map((link, index, list) => (
                <Row key={link.url} title={link.title ?? linkLabel(link.kind ?? link.platform)} subtitle={hostOf(link.url)} onPress={() => void Linking.openURL(link.url)} last={index === list.length - 1} />
              ))}
            </Section>
          ) : null}
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}

function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen(!open)} className="mt-3 px-4" accessibilityRole="button" accessibilityHint={open ? "Collapse" : "Expand"}>
      <Text variant="body" numberOfLines={open ? undefined : 3} className="text-muted-foreground">{text}</Text>
    </Pressable>
  );
}

function PricingSection({ pricing, loading }: { pricing?: Awaited<ReturnType<typeof getModelPricing>>; loading: boolean }) {
  const providers = useMemo(() => sortByRoutable((pricing ?? []).filter((provider) => provider.pricing_rules.length > 0)), [pricing]);
  if (loading) return <Section title="Pricing"><LoadingState /></Section>;
  if (!providers.length) return null;
  return (
    <Section title="Pricing" description="Per million tokens unless noted.">
      {providers.map((provider) => {
        const lines = priceLines(provider);
        const otherPlans = plansFor(provider).filter((plan) => plan !== "standard");
        const routable = isRoutable(provider);
        return (
          <View key={provider.provider.api_provider_id ?? provider.provider.api_provider_name} className="border-b border-border px-4 py-3">
            <View className="flex-row items-center gap-2">
              <Logo id={provider.provider.api_provider_id} label={provider.provider.api_provider_name} size={22} />
              <Text variant="label" className="flex-1">{providerLabel(provider.provider)}</Text>
              {routable ? (otherPlans.length ? <Text variant="caption">Also {otherPlans.join(", ")}</Text> : null) : <Badge label="Not active" />}
            </View>
            <View className="mt-2 flex-row flex-wrap gap-x-6 gap-y-2">
              {lines.map((line) => (
                <View key={line.meter}>
                  <Text variant="caption">{line.label}</Text>
                  <Text variant="small" className="font-semibold">{line.value}{line.unit !== "1M tokens" ? ` / ${line.unit}` : ""}</Text>
                  {line.longContext ? <Text variant="caption">{line.longContext.value} over {line.longContext.above}</Text> : null}
                </View>
              ))}
            </View>
            {lines.some((line) => line.longContext) ? <Text variant="caption" className="mt-2">{`Higher prices apply when a request's input is over ${lines.find((line) => line.longContext)!.longContext!.above} tokens.`}</Text> : null}
          </View>
        );
      })}
    </Section>
  );
}

function dedupeRoutes<T extends { api_provider_id?: string | null }>(routes: T[]) {
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = route.api_provider_id ?? "";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hostOf(url: string) {
  try { return new URL(url).host; } catch { return url; }
}

function linkLabel(kind?: string | null) {
  if (!kind) return "Link";
  return kind.replace(/[_-]/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}
