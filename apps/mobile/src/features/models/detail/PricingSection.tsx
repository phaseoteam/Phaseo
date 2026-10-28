import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CircleAlert } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { LegendItem, LineChart } from "@/components/charts";
import { Logo } from "@/components/Logo";
import { Icon, Segmented, Select, Text, useToneColor } from "@/components/ui";
import { getModelEffectivePricing, getModelPricingHistory, type ProviderPricing } from "@/lib/api/models";
import { cn } from "@/lib/cn";
import { formatPrice, formatShortDate } from "@/lib/format";
import { meterName } from "./faq";
import { EmptyBox, ServiceTierBadge, SubHeading, TinyBadge } from "./parts";
import {
  buildPriceHistory, defaultRowPlan, effectiveRows, historyUnitLabel, isEffectiveMeter, isSeriesVisibleByDefault, meterOptions, observedUsageByProviderPlan, RANGE_OPTIONS, summaryCutoffMs,
  tierDashArray, weightedEffectivePrice, type EffectiveRow, type PricingRange, type PricingView,
} from "./pricingInsights";
import { ProviderSheet, sheetKey, useProviderStats, type ProviderSheetTarget } from "./ProviderSheet";
import { tierLabel } from "./providers";
import { serviceTierLabel } from "./tiers";

/** Small prices keep their precision ("$0.0042"); the website rounds axis labels the same way. */
const axisPrice = (value: number) => (value === 0 ? "0" : `$${Number(value.toPrecision(2))}`);
const price = (value: number | null | undefined) => (value == null || !Number.isFinite(value) ? "—" : value === 0 ? "$0" : formatPrice(value));

/**
 * "Weighted provider pricing over the last 30 days, with recent route pricing history below": effective
 * prices from what requests actually cost, a price history chart, and a table of providers. A provider in the table
 * opens its sheet, with every list price.
 */
export function PricingSection({ modelId, providers }: { modelId: string; providers: ProviderPricing[] }) {
  const history = useQuery({ queryKey: ["model-page", modelId, "pricing-history"], queryFn: () => getModelPricingHistory(modelId), staleTime: 30 * 60_000 });
  const effective = useQuery({ queryKey: ["model-page", modelId, "effective-pricing"], queryFn: () => getModelEffectivePricing(modelId), staleTime: 30 * 60_000 });
  const [view, setView] = useState<PricingView>("effective");
  const [range, setRange] = useState<PricingRange>("30d");
  const [meter, setMeter] = useState("input_text_tokens");
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [inspected, setInspected] = useState<number | null>(null);
  const [nowMs] = useState(() => Date.now());
  const muted = useToneColor("muted");

  const derived = useMemo(() => {
    const rowsInput = effective.data ?? [];
    const cutoff = summaryCutoffMs(rowsInput);
    const observed = observedUsageByProviderPlan(rowsInput, cutoff);
    const rows = effectiveRows(providers, observed, cutoff, nowMs);
    return { observed, rows, cutoff, summary: weightedEffectivePrice(rows, observed, cutoff) };
  }, [effective.data, providers, nowMs]);

  const meters = useMemo(() => meterOptions(history.data ?? [], derived.rows), [history.data, derived.rows]);
  const activeMeter = meters.includes(meter) ? meter : meters[0] ?? "input_text_tokens";
  const effectiveState = useMemo(() => buildPriceHistory({ rows: derived.rows, rules: history.data ?? [], observed: derived.observed, view: "effective", meter: activeMeter, range, nowMs }), [derived, history.data, activeMeter, range, nowMs]);
  const hasEffective = isEffectiveMeter(activeMeter) && effectiveState.hasData;
  const unitLabel = historyUnitLabel(history.data ?? [], activeMeter);
  const shownView: PricingView = view === "effective" && !hasEffective ? "listed" : view;
  const state = useMemo(() => (shownView === "effective" ? effectiveState : buildPriceHistory({ rows: derived.rows, rules: history.data ?? [], observed: derived.observed, view: "listed", meter: activeMeter, range, nowMs })), [shownView, effectiveState, derived, history.data, activeMeter, range, nowMs]);

  const visible = (row: EffectiveRow) => visibility[row.seriesKey] ?? isSeriesVisibleByDefault(row);
  const visibleRows = derived.rows.filter(visible);
  const plans = [...new Set(derived.rows.map((row) => row.plan))];
  // One row per provider (its default tier), busiest first, then by name; tier rows expand underneath.
  const providerRows = useMemo(() => {
    const primary = derived.rows.filter((row) => row.plan === defaultRowPlan(row));
    return [...primary].sort((a, b) => Number(a.isExternal) - Number(b.isExternal) || (b.tokenSharePct ?? -1) - (a.tokenSharePct ?? -1) || a.providerName.localeCompare(b.providerName));
  }, [derived.rows]);
  // The sheet steps through the table's providers in its order; median health, as the Providers section starts with.
  const sheetProviders = useMemo(() => providerRows.map((row) => providers.find((provider) => provider.provider.api_provider_id === row.providerId)).filter((provider): provider is ProviderPricing => Boolean(provider)), [providerRows, providers]);
  const { stats } = useProviderStats(modelId, providers, 50);
  const [sheet, setSheet] = useState<ProviderSheetTarget | null>(null);
  const openSheet = (row: EffectiveRow) => {
    const index = sheetProviders.findIndex((provider) => provider.provider.api_provider_id === row.providerId);
    if (index >= 0) setSheet({ key: sheetKey(sheetProviders[index]!, index), plan: row.plan });
  };

  if (!providers.length) {
    return <EmptyBox icon={CircleAlert} title="No pricing data yet" body="No provider pricing is recorded for this model yet." />;
  }

  return (
    <View className="gap-5">
      <View>
        <SubHeading>Effective pricing</SubHeading>
        <Text variant="muted" className="mt-1">Weighted by observed usage over the last 30 days. Every provider with recorded pricing is included.</Text>
        <View className="mt-3 overflow-hidden rounded-md border border-border">
          <EffectiveTile label="Weighted input price" value={derived.summary.input} />
          <EffectiveTile label="Weighted output price" value={derived.summary.output} last />
        </View>
      </View>

      <View>
        <SubHeading>Price history</SubHeading>
        <Text variant="caption" className="mt-1">{`${unitLabel} · 30-day rolling effective prices · exact UTC list changes`}</Text>
        <View className="mt-3 gap-2">
          <View className="flex-row gap-2">
            <Segmented
              className="w-40"
              value={shownView}
              options={[{ value: "effective", label: "Effective" }, { value: "listed", label: "List" }]}
              onChange={(next) => setView(next === "effective" && !hasEffective ? "listed" : next)}
            />
            <Select className="flex-1" title="Pricing meter" value={activeMeter} options={(meters.length ? meters : [activeMeter]).map((value) => ({ value, label: meterName(value) }))} onChange={setMeter} />
          </View>
          <Segmented value={range} options={RANGE_OPTIONS} onChange={(value) => setRange(value)} />
        </View>
        {history.isLoading || effective.isLoading ? (
          <View className="mt-3 h-[200px] rounded-md bg-muted" />
        ) : state.hasData && visibleRows.length ? (
          <View className="mt-3 rounded-md border border-border px-3 pb-3 pt-3">
            <LineChart
              height={200}
              step={shownView === "listed"}
              yFormat={axisPrice}
              xFormat={(time) => formatShortDate(time)}
              valueFormat={price}
              tooltipTitle={(time) => `${new Date(time).toISOString().slice(0, 16).replace("T", " ")} UTC`}
              accessibilityLabel={`${shownView === "effective" ? "Effective" : "List"} ${meterName(activeMeter).toLowerCase()} price, ${unitLabel}, for ${visibleRows.length} ${visibleRows.length === 1 ? "route" : "routes"}`}
              series={visibleRows.map((row) => ({ key: row.seriesKey, label: row.plan === defaultRowPlan(row) ? row.providerName : `${row.providerName} · ${tierLabel(row.plan)}`, colour: row.colour, dash: tierDashArray(row.plan), points: state.points.map((point) => ({ x: point.time, y: point.values[row.seriesKey] ?? null })) }))}
              onInspect={setInspected}
            />
            <Text variant="caption" className="mt-1.5">Press and hold the chart, then drag, to read prices at a time. The table below shows them too.</Text>
            {plans.length > 1 || plans[0] !== "standard" ? (
              <View className="mt-3 flex-row flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-2.5">
                <Text variant="caption" className="font-medium text-foreground">Service tier</Text>
                {plans.map((plan) => <LegendItem key={plan} colour={muted} label={serviceTierLabel(plan)} dash={tierDashArray(plan)} />)}
              </View>
            ) : null}
          </View>
        ) : (
          <View className="mt-3 items-center rounded-md border border-dashed border-border px-4 py-8">
            <Text variant="caption" className="text-center">{visibleRows.length ? "No price history in this range." : "Turn on a provider below to chart its prices."}</Text>
          </View>
        )}

        <View className="mt-3 overflow-hidden rounded-md border border-border">
          <View className="flex-row border-b border-border px-3 py-2">
            <Text variant="caption" className="flex-1">Provider</Text>
            <Text variant="caption" className="w-16 text-right">Input</Text>
            <Text variant="caption" className="w-16 text-right">Output</Text>
          </View>
          {providerRows.map((row, index) => {
            const tiers = derived.rows.filter((candidate) => candidate.providerId === row.providerId && candidate.seriesKey !== row.seriesKey);
            const open = expanded.has(row.providerId);
            const values = (target: EffectiveRow) => {
              const value = inspected != null ? state.points.find((point) => point.time === inspected)?.values[target.seriesKey] : undefined;
              return {
                input: shownView === "effective" ? target.input : target.listedInput,
                output: shownView === "effective" ? target.output : target.listedOutput,
                inspected: value,
              };
            };
            return (
              <View key={row.seriesKey} className={cn(index < providerRows.length - 1 && "border-b border-border")}>
                <SeriesRow row={row} values={values(row)} visible={visible(row)} onToggle={() => setVisibility((current) => ({ ...current, [row.seriesKey]: !visible(row) }))} onOpen={() => openSheet(row)} expandable={tiers.length > 0} open={open} onExpand={() => setExpanded((current) => { const next = new Set(current); if (next.has(row.providerId)) next.delete(row.providerId); else next.add(row.providerId); return next; })} />
                {open ? tiers.map((tier) => (
                  <SeriesRow key={tier.seriesKey} row={tier} values={values(tier)} visible={visible(tier)} onToggle={() => setVisibility((current) => ({ ...current, [tier.seriesKey]: !visible(tier) }))} onOpen={() => openSheet(tier)} tier />
                )) : null}
              </View>
            );
          })}
        </View>
        <Text variant="caption" className="mt-1.5">Tap a provider for every list price, its performance, routing and data policy.</Text>
      </View>
      <ProviderSheet providers={sheetProviders} target={sheet} stats={stats} percentile={50} onChange={setSheet} onClose={() => setSheet(null)} />
    </View>
  );
}

function EffectiveTile({ label, value, last }: { label: string; value: number | null; last?: boolean }) {
  return (
    <View className={cn("px-4 py-3.5", !last && "border-b border-border")}>
      <Text variant="caption">{label}</Text>
      <Text className="mt-1 text-[20px] font-bold leading-[26px] tracking-tight text-foreground">{price(value)}</Text>
      <Text variant="caption" className="mt-0.5">Per 1M tokens</Text>
    </View>
  );
}

function SeriesRow({ row, values, visible, onToggle, onOpen, expandable, open, onExpand, tier }: { row: EffectiveRow; values: { input: number | null; output: number | null; inspected?: number | null }; visible: boolean; onToggle: () => void; onOpen: () => void; expandable?: boolean; open?: boolean; onExpand?: () => void; tier?: boolean }) {
  return (
    <View className={cn("flex-row items-center gap-2 px-3 py-2.5", tier && "bg-muted/40 pl-8")}>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: visible }} accessibilityLabel={`${visible ? "Hide" : "Show"} ${row.providerName} ${tierLabel(row.plan)} price line`} hitSlop={8} onPress={onToggle} className={cn(!visible && "opacity-40")}>
        <LegendItem colour={row.colour} label="" dash={tierDashArray(row.plan)} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityHint="Opens every price and detail for this provider" onPress={onOpen} className="shrink flex-row items-center gap-2">
        {tier ? null : <Logo id={row.logoId} label={row.providerName} size={22} />}
        <Text variant="small" numberOfLines={1} className="shrink font-medium text-link">{row.providerName}</Text>
        {tier ? <ServiceTierBadge plan={row.plan} /> : null}
        {row.isExternal ? <TinyBadge label="External" /> : null}
      </Pressable>
      {expandable ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${open ? "Hide" : "Show"} ${row.providerName}'s other tiers`} hitSlop={10} onPress={onExpand}>
          <Icon icon={open ? ChevronDown : ChevronRight} tone="muted" size={14} />
        </Pressable>
      ) : null}
      <View className="flex-1" />
      {values.inspected !== undefined ? (
        <Text variant="small" className="w-32 text-right font-semibold">{price(values.inspected)}</Text>
      ) : (
        <>
          <Text variant="small" className="w-16 text-right font-semibold">{price(values.input)}</Text>
          <Text variant="small" className="w-16 text-right font-semibold">{price(values.output)}</Text>
        </>
      )}
    </View>
  );
}

