import { BarChart3, Check, ChevronRight, CircleAlert, Filter, Info, MapPin } from "lucide-react-native";
import { Fragment, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, Icon, OptionSheet, Sheet, Text, useMenu, type ViewRef } from "@/components/ui";
import type { ProviderPricing } from "@/lib/api/models";
import { cn } from "@/lib/cn";
import { formatMs, formatPrice } from "@/lib/format";
import { basePricePerMillion, tablePrices } from "../pricing";
import { EmptyBox, PolicyIcon, ServiceTierBadge, StatusIcon, STATUS_META } from "./parts";
import { formatPercentile, PERCENTILES } from "./performance";
import { formatThroughput, formatUptime, ProviderSheet, useProviderStats, type ProviderSheetTarget } from "./ProviderSheet";
import {
  dataPolicyTier, DEFAULT_STATUS_FILTERS, defaultPlan, executionRegions, isRouteVariant, listingCategory, providerDisplayName, providerLogoId, providerPlans,
  providerStatus, sortProviders, statsKey, type ListingCategory, type RuntimeStats,
} from "./providers";

type Privacy = "all" | "zdr" | "no_training";

const CATEGORY_LABELS: Record<ListingCategory, string> = {
  routable: "Routable",
  preview: "Preview / coming soon",
  inactive: "Inactive / disabled",
  external: "External providers",
};

/**
 * The website's provider table, as rows: API providers with list prices, status, privacy, regions and 3-day routing
 * health. A row opens that provider's sheet (every price, performance, routing, data policy, limits).
 */
export function ProvidersSection({ modelId, providers, creatorId, modelStatus, organisationName }: { modelId: string; providers: ProviderPricing[]; creatorId?: string | null; modelStatus?: string | null; organisationName?: string | null }) {
  const [percentile, setPercentile] = useState(50);
  const percentileMenu = useMenu();
  const percentileRef = useRef<ViewRef>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilters, setStatusFilters] = useState<ListingCategory[]>(DEFAULT_STATUS_FILTERS);
  const [privacy, setPrivacy] = useState<Privacy>("all");
  const [sheet, setSheet] = useState<ProviderSheetTarget | null>(null);
  const [now] = useState(() => Date.now());

  const listed = useMemo(() => providers.filter((provider) => provider.provider_models.length > 0), [providers]);
  const { stats, health } = useProviderStats(modelId, providers, percentile);

  const rows = useMemo(() => {
    const visible = listed.filter((provider) => {
      if (!statusFilters.includes(listingCategory(provider, providerStatus(provider)))) return false;
      const tier = dataPolicyTier(provider.provider);
      if (privacy === "zdr") return provider.provider.zero_data_retention === true || tier === "private";
      if (privacy === "no_training") return tier === "private" || tier === "logs";
      return true;
    });
    const sorted = sortProviders(visible, {
      stats,
      creatorId,
      basePrice: (provider) => {
        const plan = defaultPlan(provider);
        const input = basePricePerMillion(provider, ["input_text_tokens", "input_tokens"], plan, now);
        const output = basePricePerMillion(provider, ["output_text_tokens", "output_tokens"], plan, now);
        return input == null && output == null ? null : (input ?? 0) + (output ?? 0);
      },
    });
    const rank = (provider: ProviderPricing) => (listingCategory(provider, providerStatus(provider)) === "external" ? 2 : isRouteVariant(provider, defaultPlan(provider)) ? 1 : 0);
    return sorted.map((provider) => ({ provider, rank: rank(provider) })).sort((a, b) => a.rank - b.rank);
  }, [listed, statusFilters, privacy, stats, creatorId, now]);

  const activeFilters = DEFAULT_STATUS_FILTERS.filter((filter) => !statusFilters.includes(filter)).length + (statusFilters.includes("external") ? 1 : 0) + (privacy === "all" ? 0 : 1);
  const sheetProviders = useMemo(() => rows.map((row) => row.provider), [rows]);

  if (!listed.length) {
    return (
      <EmptyBox
        icon={CircleAlert}
        title={modelStatus === "Announced" && organisationName ? `${organisationName} hasn't released this model on its API yet` : "No API provider pricing or availability is available for this model yet."}
        body="If you know providers we can integrate, please tell us on Discord or open an issue on GitHub so we can add pricing data."
      />
    );
  }

  return (
    <View>
      <View className="mb-4 flex-row gap-2">
        <Button label={activeFilters ? `Filters · ${activeFilters}` : "Filters"} icon={Filter} variant="outline" size="sm" className="flex-1" onPress={() => setFiltersOpen(true)} />
        <View ref={percentileRef} collapsable={false} className="flex-1">
          <Button label={formatPercentile(percentile)} icon={BarChart3} variant="outline" size="sm" loading={health.isFetching && health.isPlaceholderData} onPress={() => void percentileMenu.show(percentileRef)} />
        </View>
      </View>
      {rows.length ? (
        <View className="overflow-hidden rounded-md border border-border">
          <Text variant="caption" className="border-b border-border px-3 py-2">Provider</Text>
          {rows.map(({ provider, rank }, index) => {
            const id = provider.provider.api_provider_id ?? String(index);
            return (
              <Fragment key={id}>
                {rank > 0 && rows[index - 1]?.rank !== rank ? <Separator kind={rank === 2 ? "external" : "additional"} /> : null}
                <ProviderRow provider={provider} stats={stats} onOpen={() => setSheet({ index, plan: defaultPlan(provider) })} last={index === rows.length - 1} />
              </Fragment>
            );
          })}
        </View>
      ) : (
        <EmptyBox icon={Filter} title="No providers match these filters" body="Change the filters to see more providers." />
      )}
      <OptionSheet
        open={percentileMenu.open}
        anchor={percentileMenu.anchor}
        title="Select provider percentile"
        value={String(percentile)}
        options={PERCENTILES.map((value) => ({ value: String(value), label: formatPercentile(value), description: value === 50 ? "Median" : undefined }))}
        onChange={(value) => setPercentile(Number(value))}
        onClose={percentileMenu.close}
      />
      <FiltersSheet open={filtersOpen} statusFilters={statusFilters} privacy={privacy} onStatus={setStatusFilters} onPrivacy={setPrivacy} onClose={() => setFiltersOpen(false)} />
      <ProviderSheet providers={sheetProviders} target={sheet} stats={stats} percentile={percentile} onChange={setSheet} onClose={() => setSheet(null)} />
    </View>
  );
}

function Separator({ kind }: { kind: "additional" | "external" }) {
  const [open, setOpen] = useState(false);
  const help = kind === "external"
    ? "These listings come from external catalogues. Phaseo does not route to them automatically; routing requires an explicit provider-level override."
    : "Choose a regional provider route directly or send your request through a regional API endpoint. For Fast or Flex, specify the tier in your request or select a route dedicated to that tier. Batch requests go through the Batch API.";
  return (
    <Pressable accessibilityRole="button" accessibilityHint="Shows how these routes are selected" onPress={() => setOpen(!open)} className="border-b border-border bg-muted/60 px-3 py-2">
      <View className="flex-row items-center gap-1.5">
        <Text variant="caption" className="font-medium">{kind === "external" ? "External providers" : "Additional routing options"}</Text>
        <Icon icon={Info} tone="muted" size={14} />
      </View>
      {open ? <Text variant="caption" className="mt-1.5">{help}</Text> : null}
    </Pressable>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/3 pr-2">
      <Text variant="caption">{label}</Text>
      <Text variant="small" className="font-semibold">{value}</Text>
    </View>
  );
}

function ProviderRow({ provider, stats, onOpen, last }: { provider: ProviderPricing; stats: Map<string, RuntimeStats>; onOpen: () => void; last: boolean }) {
  const plan = defaultPlan(provider);
  const status = providerStatus(provider, plan);
  const name = providerDisplayName(provider.provider);
  const prices = tablePrices(provider, plan);
  const runtime = stats.get(statsKey(provider.provider.api_provider_id ?? "", plan));
  const regions = executionRegions(provider, plan);
  const tiers = providerPlans(provider).filter((tier) => tier !== plan);
  const policy = dataPolicyTier(provider.provider);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${STATUS_META[status].label}`} accessibilityHint="Opens every price and detail for this provider" onPress={onOpen} className={cn("px-3 py-3 active:bg-accent", !last && "border-b border-border")}>
      <View className="flex-row items-center gap-2">
        <Logo id={providerLogoId(provider.provider)} label={name} size={28} />
        <Text variant="label" numberOfLines={1} className="shrink">{name}</Text>
        <StatusIcon status={status} />
        <PolicyIcon tier={policy} />
        {regions.length || provider.provider.residency_mode ? <Icon icon={MapPin} tone="muted" size={16} /> : null}
        {tiers.map((tier) => <ServiceTierBadge key={tier} plan={tier} />)}
        <View className="flex-1" />
        <Icon icon={ChevronRight} tone="muted" size={16} />
      </View>
      <View className="mt-2 flex-row flex-wrap gap-y-2">
        <Metric label="Input $/1M" value={formatPrice(prices.input)} />
        <Metric label="Output $/1M" value={formatPrice(prices.output)} />
        <Metric label="Cache read $/1M" value={formatPrice(prices.cacheRead)} />
        <Metric label="Latency" value={formatMs(runtime?.latencyMs)} />
        <Metric label="Throughput" value={formatThroughput(runtime?.throughput)} />
        <Metric label="Uptime" value={formatUptime(runtime?.uptimePct)} />
      </View>
    </Pressable>
  );
}

function FiltersSheet({ open, statusFilters, privacy, onStatus, onPrivacy, onClose }: { open: boolean; statusFilters: ListingCategory[]; privacy: Privacy; onStatus(value: ListingCategory[]): void; onPrivacy(value: Privacy): void; onClose(): void }) {
  const toggle = (category: ListingCategory) => onStatus(statusFilters.includes(category) ? statusFilters.filter((value) => value !== category) : [...statusFilters, category]);
  const check = (on: boolean) => <View className={cn("h-5 w-5 items-center justify-center rounded-[4px] border", on ? "border-primary bg-primary" : "border-border")}>{on ? <Icon icon={Check} tone="primary-foreground" size={14} /> : null}</View>;
  return (
    <Sheet open={open} onClose={onClose}>
          <ScrollView contentContainerClassName="pb-4 pt-4">
            <Text variant="label" className="px-4 pb-1">Status · {statusFilters.length}/4</Text>
            {(Object.keys(CATEGORY_LABELS) as ListingCategory[]).map((category) => (
              <Pressable key={category} accessibilityRole="checkbox" accessibilityState={{ checked: statusFilters.includes(category) }} onPress={() => toggle(category)} className="min-h-12 flex-row items-center gap-3 px-4 active:bg-accent">
                {check(statusFilters.includes(category))}
                <Text variant="body">{CATEGORY_LABELS[category]}</Text>
              </Pressable>
            ))}
            <Text variant="label" className="px-4 pb-1 pt-3">Data privacy</Text>
            {([["all", "Show all privacy policies"], ["zdr", "Zero data retention only"], ["no_training", "No training on inputs"]] as [Privacy, string][]).map(([value, label]) => (
              <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: privacy === value }} onPress={() => onPrivacy(value)} className="min-h-12 flex-row items-center gap-3 px-4 active:bg-accent">
                {check(privacy === value)}
                <Text variant="body">{label}</Text>
              </Pressable>
            ))}
            <View className="flex-row gap-2 px-4 pt-3">
              <Button label="Reset filters" variant="outline" className="flex-1" onPress={() => { onStatus(DEFAULT_STATUS_FILTERS); onPrivacy("all"); }} />
              <Button label="Done" className="flex-1" onPress={onClose} />
            </View>
          </ScrollView>
    </Sheet>
  );
}
