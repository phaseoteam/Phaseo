import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useMemo, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, IconButton, Segmented, Sheet, Text } from "@/components/ui";
import { getModelProviderHealth, type ProviderPricing } from "@/lib/api/models";
import { formatMs, formatTokens } from "@/lib/format";
import { priceLines } from "../pricing";
import { PolicyIcon, StatusIcon, STATUS_META, SubHeading } from "./parts";
import { formatPercentile } from "./performance";
import {
  DATA_POLICY_LABELS, dataPolicyTier, executionRegions, modelScopeForPlan, providerDisplayName, providerLogoId, providerPlans, providerStatus, RESIDENCY_LABELS,
  routeLimits, runtimeStatsFromHealth, statsKey, tierLabel, type RuntimeStats,
} from "./providers";

export const formatThroughput = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? "—" : `${value >= 100 ? Math.round(value) : Number(value.toFixed(1))} tok/s`);
export const formatUptime = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`);

/**
 * Routing health (latency, throughput, uptime over 3 days) for a model's listed providers at a percentile. The
 * Providers and Pricing sections share it, so opening a sheet from either asks once.
 */
export function useProviderStats(modelId: string, providers: ProviderPricing[], percentile: number) {
  const ids = useMemo(() => providers.filter((provider) => provider.provider_models.length > 0).map((provider) => provider.provider.api_provider_id ?? "").filter(Boolean), [providers]);
  const health = useQuery({
    queryKey: ["model-page", modelId, "provider-health", percentile, ids.join(",")],
    queryFn: () => getModelProviderHealth(modelId, ids, percentile),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });
  const stats = useMemo(() => runtimeStatsFromHealth(health.data ?? []), [health.data]);
  return { stats, health };
}

/** Which provider a sheet shows, and which tier. By identity: the list can re-sort while the sheet is open (health and pricing load later). */
export type ProviderSheetTarget = { key: string; plan: string };

/** A provider's identity in a sheet's list (its position only for the rare provider without an ID). */
export const sheetKey = (provider: ProviderPricing, index: number) => provider.provider.api_provider_id ?? `#${index}`;

/**
 * One provider's route for this model, as the website's provider sheet shows it: its prices as a plain list, then
 * performance, routing, data policy and limits, with dividers between sections only. Tiers switch at the top, and the
 * arrows step through the providers in the list it was opened from.
 */
export function ProviderSheet({ providers, target, stats, percentile, onChange, onClose }: {
  providers: ProviderPricing[];
  target: ProviderSheetTarget | null;
  stats: Map<string, RuntimeStats>;
  percentile: number;
  onChange(target: ProviderSheetTarget): void;
  onClose(): void;
}) {
  const index = target ? providers.findIndex((entry, position) => sheetKey(entry, position) === target.key) : -1;
  const provider = index >= 0 ? providers[index] : undefined;
  return (
    <Sheet open={Boolean(provider)} onClose={onClose} size="tall">
      {provider && target ? <SheetBody providers={providers} provider={provider} index={index} target={target} stats={stats} percentile={percentile} onChange={onChange} onClose={onClose} /> : null}
    </Sheet>
  );
}

function SheetBody({ providers, provider, index, target, stats, percentile, onChange, onClose }: {
  providers: ProviderPricing[];
  provider: ProviderPricing;
  index: number;
  target: ProviderSheetTarget;
  stats: Map<string, RuntimeStats>;
  percentile: number;
  onChange(target: ProviderSheetTarget): void;
  onClose(): void;
}) {
  const router = useRouter();
  const plans = providerPlans(provider);
  const plan = plans.includes(target.plan) ? target.plan : plans[0] ?? "standard";
  const name = providerDisplayName(provider.provider);
  const status = providerStatus(provider, plan);
  const policy = dataPolicyTier(provider.provider);
  const runtime = stats.get(statsKey(provider.provider.api_provider_id ?? "", plan));
  const lines = priceLines(provider, plan);
  const limits = routeLimits(provider, plan);
  const regions = executionRegions(provider, plan);
  const residency = provider.provider.residency_mode ? RESIDENCY_LABELS[provider.provider.residency_mode] : null;
  const dataRegions = (provider.provider.default_data_regions ?? []).map((region) => (region.toUpperCase() === "GLOBAL" ? "Global" : region.toUpperCase()));
  const modelIds = [...new Set(modelScopeForPlan(provider, plan).map((model) => model.provider_model_slug).filter((slug): slug is string => Boolean(slug)))];
  const step = (by: number) => {
    const next = (index + by + providers.length) % providers.length;
    onChange({ key: sheetKey(providers[next]!, next), plan: providerPlans(providers[next]!)[0] ?? "standard" });
  };
  const id = provider.provider.api_provider_id;
  return (
    <>
      <View className="gap-3 border-b border-border px-4 pb-3 pt-4">
        <View className="flex-row items-center gap-2">
          <Logo id={providerLogoId(provider.provider)} label={name} size={32} />
          <Text variant="heading" numberOfLines={1} className="shrink">{name}</Text>
          <StatusIcon status={status} />
          <PolicyIcon tier={policy} />
          <View className="flex-1" />
          {providers.length > 1 ? (
            <>
              <IconButton icon={ChevronLeft} label="Previous provider" size={18} className="h-9 w-9" onPress={() => step(-1)} />
              <Text variant="caption" accessibilityLabel={`Provider ${index + 1} of ${providers.length}`}>{`${index + 1}/${providers.length}`}</Text>
              <IconButton icon={ChevronRight} label="Next provider" size={18} className="h-9 w-9" onPress={() => step(1)} />
            </>
          ) : null}
          <IconButton icon={X} label="Close" size={18} className="h-9 w-9" onPress={onClose} />
        </View>
        {plans.length > 1 ? <Segmented value={plan} options={plans.map((value) => ({ value, label: tierLabel(value) }))} onChange={(next) => onChange({ key: target.key, plan: next })} /> : null}
      </View>
      <ScrollView contentContainerClassName="px-4 pb-4">
        <SheetSection title="Pricing" note="Per 1M tokens unless noted" first>
          {lines.length ? lines.map((line) => (
            <Line key={line.meter} label={line.label} value={`${line.value}${line.unit !== "1M tokens" ? ` / ${line.unit}` : ""}`} detail={line.longContext ? `${line.longContext.value} over ${line.longContext.above} tokens` : null} />
          )) : <Text variant="muted">No prices are listed for this tier.</Text>}
        </SheetSection>
        <SheetSection title="Performance" note={`${formatPercentile(percentile)} · last 3 days`}>
          <Line label="Latency" value={formatMs(runtime?.latencyMs)} />
          <Line label="Throughput" value={formatThroughput(runtime?.throughput)} />
          <Line label="Uptime" value={formatUptime(runtime?.uptimePct)} />
        </SheetSection>
        <SheetSection title="Routing">
          <Line label="Status" value={STATUS_META[status].label} detail={STATUS_META[status].description} />
          {modelIds.length ? <Line label={modelIds.length === 1 ? "Provider model ID" : "Provider model IDs"} value={modelIds.join("\n")} selectable /> : null}
        </SheetSection>
        <SheetSection title="Data policy">
          <Line label="Your data" value={DATA_POLICY_LABELS[policy]} />
          {regions.length ? <Line label="Processing location" value={`${regions.join(", ")}${residency ? ` · ${residency}` : ""}`} /> : null}
          {dataRegions.length ? <Line label="Data centre location" value={dataRegions.join(", ")} /> : null}
        </SheetSection>
        {limits.context || limits.maxOutput ? (
          <SheetSection title="Limits">
            {limits.context ? <Line label="Context" value={`${formatTokens(limits.context)} tokens`} /> : null}
            {limits.maxOutput ? <Line label="Max output" value={`${formatTokens(limits.maxOutput)} tokens`} /> : null}
          </SheetSection>
        ) : null}
        {id ? <Button label={`View ${name}`} variant="outline" size="sm" className="mt-4" onPress={() => { onClose(); router.push(`/providers/${id}`); }} /> : null}
      </ScrollView>
    </>
  );
}

/** A sheet section: a divider above (none for the first), its heading and an optional note, then its lines. */
function SheetSection({ title, note, first, children }: { title: string; note?: string; first?: boolean; children: ReactNode }) {
  return (
    <View className={first ? "pt-3" : "mt-3 border-t border-border pt-3"}>
      <View className="mb-1.5 flex-row items-baseline justify-between gap-3">
        <SubHeading>{title}</SubHeading>
        {note ? <Text variant="caption">{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** A label and its value on one line (no divider between lines), with an optional note under the value. */
function Line({ label, value, detail, selectable }: { label: string; value: string; detail?: string | null; selectable?: boolean }) {
  return (
    <View className="flex-row gap-3 py-1">
      <Text variant="small" className="w-[42%] text-muted-foreground">{label}</Text>
      <View className="flex-1 items-end">
        <Text variant="small" selectable={selectable} className="text-right font-semibold">{value}</Text>
        {detail ? <Text variant="caption" className="text-right">{detail}</Text> : null}
      </View>
    </View>
  );
}
