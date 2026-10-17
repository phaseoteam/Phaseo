import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import {
  Activity,
  CalendarDays,
  Check,
  Code2,
  Copy,
  ExternalLink,
  Gauge,
  GitBranch,
  Globe2,
  Link2,
  Rocket,
  Share2,
  ShieldCheck,
  Zap
} from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View
} from "react-native";
import { ProviderLogo } from "@/components/ProviderLogo";
import { EmptyState, Pill, Screen, usePalette } from "@/components/ui";
import {
  getModel,
  getModelActivity,
  getModelApps,
  getModelAvailability,
  getModelBenchmarks,
  getModelGatewayMetadata,
  getModelPerformance,
  getModelPricing,
  getModelSubscriptions,
  getModelTimeline,
  type GatewayProviderModel,
  type ModelActivityRow,
  type ModelBenchmark,
  type ModelPricing,
  type ModelSubscription,
  type ModelTimelineEvent,
  type PhaseoModel,
  type PricingRule
} from "@/lib/api";
import { colour, font, radius, space } from "@/theme";

const sectionNames = ["Providers", "Performance", "Pricing", "Benchmarks", "Activity", "Apps", "Uptime", "About", "Subscriptions", "FAQ"] as const;
type SectionName = (typeof sectionNames)[number];

function formatNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "Not listed" : Math.round(value).toLocaleString();
}

function formatCompact(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not listed";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function formatPercent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "Not listed" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function formatModalities(value: string | string[] | null | undefined) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(new Set(values.map(item => item.trim()).filter(Boolean))).map(item => item.replace(/[_-]+/g, " ")).join(" · ") || "Not listed";
}

function prettyLabel(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function formatCode(value: string) {
  return value.toUpperCase();
}

function detailValue(model: PhaseoModel, key: string) {
  const value = model.model_details?.find(detail => detail.detail_name === key)?.detail_value;
  return value == null || value === "" ? undefined : String(value);
}

function isActiveProvider(provider: GatewayProviderModel) {
  return provider.is_active_gateway === true || provider.availability_status === "active" || provider.capability_status === "active";
}

function providerName(provider: GatewayProviderModel) {
  return provider.provider?.api_provider_name ?? provider.api_provider_id ?? "Provider";
}

function ModelSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const p = usePalette();
  return <View style={styles.section}>
    <Text style={[styles.sectionTitle, { color: p.text }]}>{title}</Text>
    {description ? <Text style={[styles.sectionDescription, { color: p.muted }]}>{description}</Text> : null}
    <View style={[styles.sectionCard, { backgroundColor: p.card, borderColor: p.border }]}>{children}</View>
  </View>;
}

function DataRow({ label, value, mono = false, last = false }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  const p = usePalette();
  return <View style={[styles.dataRow, !last && { borderBottomColor: p.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
    <Text style={[styles.dataLabel, { color: p.muted }]}>{label}</Text>
    <Text selectable={mono} style={[styles.dataValue, { color: p.text }, mono && styles.mono]}>{value}</Text>
  </View>;
}

function InfoGrid({ items }: { items: { label: string; value: string; icon?: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }> }[] }) {
  const p = usePalette();
  return <View style={[styles.infoGrid, { borderColor: p.border }]}>
    {items.map((item, index) => {
      const Icon = item.icon;
      return <View key={item.label} style={[styles.infoCell, { borderColor: p.border }, index % 2 === 0 && styles.infoCellRight, index < items.length - 2 && styles.infoCellBottom]}>
        <View style={styles.infoLabelRow}>{Icon ? <Icon color={p.muted} size={14} strokeWidth={1.8} /> : null}<Text style={[styles.infoLabel, { color: p.muted }]}>{item.label}</Text></View>
        <Text style={[styles.infoValue, { color: p.text }]}>{item.value}</Text>
      </View>;
    })}
  </View>;
}

function EmptySection({ title, body }: { title: string; body: string }) {
  return <EmptyState title={title} body={body} />;
}

function pricingLabel(rule: PricingRule) {
  const meter = rule.meter ?? "";
  if (meter.includes("cached_read")) return "Cached input";
  if (meter.includes("cached_write")) return "Cached write";
  if (meter.includes("input")) return "Input";
  if (meter.includes("output")) return "Output";
  return prettyLabel(meter || rule.unit || "Usage");
}

function pricingValue(rule: PricingRule) {
  if (rule.price_per_unit == null) return "Not listed";
  const unitSize = rule.unit_size && rule.unit_size > 1 ? rule.unit_size : 1;
  const normalized = rule.price_per_unit;
  const currency = rule.currency ?? "USD";
  return `${currency} ${normalized < 0.01 ? normalized.toFixed(4) : normalized.toFixed(2)} / ${unitSize >= 1_000_000 ? "1M" : rule.unit ?? "unit"}`;
}

function activityLabel(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(parsed);
}

function appInitial(title: string) {
  return title.trim().slice(0, 1).toUpperCase() || "A";
}

function appHost(url: string | null | undefined) {
  if (!url) return undefined;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; }
}

function metricValue(value: number | null | undefined, suffix = "") {
  return value == null || !Number.isFinite(value) ? "Not listed" : `${value.toFixed(value >= 100 ? 0 : 1)}${suffix}`;
}

export default function ModelDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const modelId = Array.isArray(id) ? id[0] : id;
  const p = usePalette();
  const scrollRef = useRef<ScrollView>(null);
  const [sectionOffsets, setSectionOffsets] = useState<Partial<Record<SectionName, number>>>({});

  const model = useQuery({ queryKey: ["model", modelId], queryFn: () => getModel(modelId), enabled: Boolean(modelId) });
  const gateway = useQuery({ queryKey: ["model", modelId, "gateway"], queryFn: () => getModelGatewayMetadata(modelId), enabled: Boolean(modelId) });
  const availability = useQuery({ queryKey: ["model", modelId, "availability"], queryFn: () => getModelAvailability(modelId), enabled: Boolean(modelId) });
  const pricing = useQuery({ queryKey: ["model", modelId, "pricing"], queryFn: () => getModelPricing(modelId), enabled: Boolean(modelId) });
  const performance = useQuery({ queryKey: ["model", modelId, "performance"], queryFn: () => getModelPerformance(modelId), enabled: Boolean(modelId) });
  const benchmarks = useQuery({ queryKey: ["model", modelId, "benchmarks"], queryFn: () => getModelBenchmarks(modelId), enabled: Boolean(modelId) });
  const timeline = useQuery({ queryKey: ["model", modelId, "timeline"], queryFn: () => getModelTimeline(modelId), enabled: Boolean(modelId) });
  const activity = useQuery({ queryKey: ["model", modelId, "activity"], queryFn: () => getModelActivity(modelId), enabled: Boolean(modelId) });
  const apps = useQuery({ queryKey: ["model", modelId, "apps"], queryFn: () => getModelApps(modelId), enabled: Boolean(modelId) });
  const subscriptions = useQuery({ queryKey: ["model", modelId, "subscriptions"], queryFn: () => getModelSubscriptions(modelId), enabled: Boolean(modelId) });

  const providerRows = useMemo(() => [...(gateway.data?.providers ?? [])].sort((a, b) => {
    const activeSort = Number(isActiveProvider(b)) - Number(isActiveProvider(a));
    return activeSort || providerName(a).localeCompare(providerName(b));
  }), [gateway.data?.providers]);
  const totalActivity = useMemo(() => (activity.data ?? []).reduce((total, row) => ({
    requests: total.requests + row.requests,
    tokens: total.tokens + row.totalTokens,
    cost: total.cost + row.totalCostNanos
  }), { requests: 0, tokens: 0, cost: 0 }), [activity.data]);
  const topActivity = useMemo(() => (activity.data ?? []).slice(-14), [activity.data]);
  const maxActivityTokens = Math.max(...topActivity.map(row => row.totalTokens), 1);

  if (model.isLoading) return <Screen headerTitle="Model" headerBack><ActivityIndicator style={{ marginTop: 80 }} color={colour.blue} /></Screen>;
  if (!model.data || model.isError) return <Screen headerTitle="Model" headerBack><EmptyState title="Model unavailable" body="This model could not be loaded from Phaseo." /></Screen>;

  const m = model.data;
  const creator = m.organisation?.name ?? m.organisation_name ?? m.organisation_id ?? "Unknown creator";
  const isGatewayActive = availability.data?.isGatewayActive ?? providerRows.some(isActiveProvider);
  const statusTone = m.status?.toLowerCase() === "available" ? "green" : m.status?.toLowerCase() === "retired" || m.status?.toLowerCase() === "deprecated" ? "red" : "blue";
  const detailParams = detailValue(m, "parameter_count");
  const detailTrainingTokens = detailValue(m, "training_tokens");
  const detailLicense = m.license ?? detailValue(m, "license");
  const modelLinks = m.model_links ?? [];
  const timelineEvents = (timeline.data ?? []).filter(event => event.eventName || event.description || event.modelName);
  const recordSection = (name: SectionName) => ({ onLayout: (event: { nativeEvent: { layout: { y: number } } }) => {
    const y = event.nativeEvent.layout.y;
    setSectionOffsets(current => current[name] === y ? current : { ...current, [name]: y });
  } });

  return <Screen headerTitle="Model" headerBack>
    <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={styles.heroCreatorRow}>
          <ProviderLogo id={m.organisation_id} label={creator} size={44} />
          <View style={styles.heroCreatorCopy}><Text style={[styles.eyebrow, { color: colour.blue }]}>{creator}</Text><Text style={[styles.heroCreatorMeta, { color: p.muted }]}>{m.organisation?.country_code ?? "Model profile"}</Text></View>
          {m.status ? <Pill tone={statusTone}>{m.status}</Pill> : null}
        </View>
        <Text style={[styles.title, { color: p.text }]}>{m.name ?? m.id}</Text>
        <Text selectable style={[styles.id, { color: p.muted }]}>{m.id}</Text>
        <View style={styles.badges}>{m.variant_kind ? <Pill tone="neutral">{prettyLabel(m.variant_kind)}</Pill> : null}<Pill tone={isGatewayActive ? "green" : "neutral"}>{isGatewayActive ? "Gateway active" : "Metadata only"}</Pill>{m.model_family?.display_name ? <Pill tone="neutral">{m.model_family.display_name}</Pill> : null}</View>
        <Text style={[styles.description, { color: p.muted }]}>{m.description ?? "No description is available for this model."}</Text>
        <View style={styles.heroActions}><Pressable accessibilityRole="button" onPress={() => void Clipboard.setStringAsync(m.id)} style={[styles.smallAction, { borderColor: p.border }]}><Copy size={15} color={p.text} strokeWidth={1.8} /><Text style={[styles.smallActionLabel, { color: p.text }]}>Copy ID</Text></Pressable><Pressable accessibilityRole="button" onPress={() => void Share.share({ message: `https://phaseo.app/models/${m.id}` })} style={[styles.smallAction, { borderColor: p.border }]}><Share2 size={15} color={p.text} strokeWidth={1.8} /><Text style={[styles.smallActionLabel, { color: p.text }]}>Share</Text></Pressable></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tocContent} style={styles.toc}>{sectionNames.map(name => <Pressable key={name} onPress={() => { const y = sectionOffsets[name]; if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }); }} style={[styles.tocItem, { borderColor: p.border, backgroundColor: p.card }]}><Text style={[styles.tocText, { color: p.muted }]}>{name}</Text></Pressable>)}</ScrollView>

      <View {...recordSection("Providers")}><ModelSection title="Providers" description="Provider routes, availability, capability limits, and supported parameters.">{gateway.isLoading ? <ActivityIndicator style={styles.sectionLoader} color={colour.blue} /> : providerRows.length === 0 ? <EmptySection title="No providers listed yet" body="Provider availability has not been added for this model." /> : providerRows.map(provider => { const name = providerName(provider); const active = isActiveProvider(provider); return <View key={provider.id ?? `${provider.api_provider_id}:${provider.provider_model_slug}`} style={[styles.providerBlock, { borderBottomColor: p.border }]}><View style={styles.providerHeader}><ProviderLogo id={provider.provider?.api_provider_id ?? provider.api_provider_id} label={name} size={36} /><View style={styles.providerTitleBlock}><Text style={[styles.providerName, { color: p.text }]}>{name}</Text><Text style={[styles.providerSlug, { color: p.muted }]}>{provider.provider_model_slug ?? provider.model_id ?? "Provider route"}</Text></View><Pill tone={active ? "green" : "neutral"}>{active ? "Active" : prettyLabel(provider.availability_status ?? provider.provider_availability_status ?? "Unavailable")}</Pill></View><InfoGrid items={[{ label: "Endpoint", value: provider.endpoint ?? "Not listed", icon: Code2 }, { label: "Context", value: formatNumber(provider.context_length), icon: Gauge }, { label: "Max input", value: formatNumber(provider.max_input_tokens), icon: ArrowInIcon }, { label: "Max output", value: formatNumber(provider.max_output_tokens), icon: ArrowOutIcon }, { label: "Input", value: formatModalities(provider.input_modalities), icon: Globe2 }, { label: "Output", value: formatModalities(provider.output_modalities), icon: Zap }]} /><View style={styles.providerFooter}><Text style={[styles.providerFooterText, { color: p.muted }]}>{provider.phaseo_status ? `Phaseo: ${prettyLabel(provider.phaseo_status)}` : ""}{provider.quantization_scheme ? ` · ${prettyLabel(provider.quantization_scheme)}` : ""}</Text></View></View>; })}{gateway.data?.supportedParametersByEndpoint && Object.entries(gateway.data.supportedParametersByEndpoint).some(([, params]) => params.length > 0) ? <View style={styles.supportedParams}><Text style={[styles.subheading, { color: p.text }]}>Supported parameters</Text><View style={styles.parameterWrap}>{Object.entries(gateway.data.supportedParametersByEndpoint).flatMap(([endpoint, params]) => params.map(parameter => <View key={`${endpoint}:${parameter.param_id}`} style={[styles.parameterChip, { borderColor: p.border }]}><Check color={colour.green} size={12} strokeWidth={2.2} /><Text style={[styles.parameterText, { color: p.text }]}>{parameter.param_id}</Text></View>))}</View></View> : null}</ModelSection></View>

      <View {...recordSection("Performance")}><ModelSection title="Performance" description="Latency, throughput, and reliability signals from recent gateway traffic.">{!performance.data || performance.data.summary.totalRequests === 0 ? <EmptySection title="No performance telemetry yet" body="Performance telemetry will appear once this model has enough gateway traffic." /> : <><InfoGrid items={[{ label: "Requests", value: formatCompact(performance.data.summary.totalRequests), icon: Activity }, { label: "Uptime", value: formatPercent(performance.data.summary.uptimePct), icon: ShieldCheck }, { label: "Latency", value: metricValue(performance.data.summary.avgLatencyMs, " ms"), icon: Gauge }, { label: "Throughput", value: metricValue(performance.data.summary.avgThroughput, " tok/s"), icon: Zap }, { label: "Generation", value: metricValue(performance.data.summary.avgGenerationMs, " ms"), icon: ClockIcon }, { label: "Successful", value: formatCompact(performance.data.summary.successfulRequests), icon: Check }]} />{performance.data.dataRange.start ? <Text style={[styles.cardNote, { color: p.muted }]}>Window: {formatDate(performance.data.dataRange.start)} – {formatDate(performance.data.dataRange.end)}</Text> : null}</>}</ModelSection></View>

      <View {...recordSection("Pricing")}><ModelSection title="Pricing" description="Current provider pricing for supported routes and token meters.">{pricing.isLoading ? <ActivityIndicator style={styles.sectionLoader} color={colour.blue} /> : pricing.data?.length ? pricing.data.map(provider => <PricingBlock key={provider.provider.api_provider_id ?? provider.provider.api_provider_name} provider={provider} />) : <EmptySection title="No pricing listed yet" body="Pricing data is not available for this model yet." />}</ModelSection></View>

      <View {...recordSection("Benchmarks")}><ModelSection title="Benchmarks" description="Published benchmark highlights and rankings for this model.">{benchmarks.isLoading ? <ActivityIndicator style={styles.sectionLoader} color={colour.blue} /> : benchmarks.data?.length ? <BenchmarkList values={benchmarks.data} /> : <EmptySection title="No benchmark data yet" body="No benchmark data is available for this model yet." />}</ModelSection></View>

      <View {...recordSection("Activity")}><ModelSection title="Activity" description="Token volume and request traffic over the last 30 days.">{activity.isLoading ? <ActivityIndicator style={styles.sectionLoader} color={colour.blue} /> : activity.data?.length ? <><InfoGrid items={[{ label: "Requests", value: formatCompact(totalActivity.requests), icon: Activity }, { label: "Tokens", value: formatCompact(totalActivity.tokens), icon: Zap }, { label: "Input tokens", value: formatCompact(activity.data.reduce((sum, row) => sum + row.inputTokens, 0)), icon: ArrowInIcon }, { label: "Output tokens", value: formatCompact(activity.data.reduce((sum, row) => sum + row.outputTokens, 0)), icon: ArrowOutIcon }]} /><ActivityBars rows={topActivity} maxTokens={maxActivityTokens} /></> : <EmptySection title="No activity yet" body="Usage breakdowns will appear once this model has enough gateway traffic." />}</ModelSection></View>

      <View {...recordSection("Apps")}><ModelSection title="Apps Using This Model" description="Public apps observed in gateway usage for this model.">{apps.isLoading ? <ActivityIndicator style={styles.sectionLoader} color={colour.blue} /> : apps.data?.length ? apps.data.slice(0, 10).map((app, index) => <Pressable key={app.appId} onPress={() => app.url ? void Linking.openURL(app.url) : undefined} style={[styles.appRow, { borderBottomColor: p.border }]}><Text style={[styles.appRank, { color: p.muted }]}>{index + 1}.</Text><View style={[styles.appIcon, { backgroundColor: p.surface, borderColor: p.border }]}><Text style={[styles.appIconText, { color: p.muted }]}>{appInitial(app.title)}</Text></View><View style={styles.appCopy}><Text style={[styles.appName, { color: p.text }]}>{app.title}</Text>{appHost(app.url) ? <Text style={[styles.appSubtitle, { color: p.muted }]}>{appHost(app.url)}</Text> : null}</View><Text style={[styles.appTokens, { color: p.muted }]}>{formatCompact(app.totalTokens)} tokens</Text></Pressable>) : <EmptySection title="No public apps yet" body="Public apps will appear after gateway usage is observed for this model." />}</ModelSection></View>

      <View {...recordSection("Uptime")}><ModelSection title="Model Uptime" description="Reliability trend for this model over the most recent telemetry window.">{!performance.data || performance.data.summary.totalRequests === 0 ? <EmptySection title="No uptime data yet" body="Uptime will appear once recent performance telemetry is available." /> : <><InfoGrid items={[{ label: "Uptime", value: formatPercent(performance.data.summary.uptimePct), icon: ShieldCheck }, { label: "Successful", value: formatCompact(performance.data.summary.successfulRequests), icon: Check }, { label: "Requests", value: formatCompact(performance.data.summary.totalRequests), icon: Activity }, { label: "Providers", value: formatNumber(performance.data.providerPerformance.length), icon: Globe2 }]} />{performance.data.providerPerformance.map(provider => <DataRow key={provider.provider ?? provider.providerName} label={provider.providerName ?? provider.provider ?? "Provider"} value={`${formatPercent(provider.uptimePct)} · ${formatCompact(provider.requests)} requests`} last={false} />)}</>}</ModelSection></View>

      <View {...recordSection("About")}><ModelSection title="About" description="Key dates, capabilities, links, and model metadata."><Text style={[styles.subheading, { color: p.text }]}>Key dates</Text><InfoGrid items={[{ label: "Announcement", value: formatDate(m.announcement_date), icon: CalendarDays }, { label: "Release", value: formatDate(m.release_date), icon: Rocket }, { label: "Deprecation", value: formatDate(m.deprecation_date), icon: CalendarDays }, { label: "Retirement", value: formatDate(m.retirement_date), icon: CalendarDays }]} /><Text style={[styles.subheading, { color: p.text }]}>Capabilities</Text><InfoGrid items={[{ label: "Input", value: formatModalities(m.input_types ?? m.input_modalities), icon: ArrowInIcon }, { label: "Output", value: formatModalities(m.output_types ?? m.output_modalities), icon: ArrowOutIcon }, { label: "Parameters", value: detailParams ? formatNumber(Number(detailParams)) : "Not listed", icon: Gauge }, { label: "Training tokens", value: detailTrainingTokens ? formatCompact(Number(detailTrainingTokens)) : "Not listed", icon: Zap }, { label: "License", value: detailLicense ?? "Not listed", icon: Code2 }, { label: "Family", value: m.model_family?.display_name ?? m.family_id ?? "Not listed", icon: GitBranch }]} />{m.aliases?.length ? <DataRow label="Aliases" value={m.aliases.join(" · ")} /> : null}{m.previous_model_id ? <DataRow label="Previous model" value={m.previous_model_id} mono /> : null}{timelineEvents.length ? <View style={styles.timeline}><Text style={[styles.subheading, { color: p.text }]}>Timeline</Text>{timelineEvents.map(event => <TimelineRow key={`${event.date}:${event.eventName}:${event.modelId}`} event={event} />)}</View> : null}{modelLinks.length ? <View style={styles.links}><Text style={[styles.subheading, { color: p.text }]}>Links</Text>{modelLinks.map(link => <Pressable key={link.url} onPress={() => void Linking.openURL(link.url)} style={[styles.linkRow, { borderBottomColor: p.border }]}><Link2 size={16} color={p.muted} strokeWidth={1.8} /><View style={styles.linkCopy}><Text style={[styles.linkTitle, { color: p.text }]}>{link.title ?? prettyLabel(link.kind ?? link.platform ?? "Model link")}</Text><Text numberOfLines={1} style={[styles.linkUrl, { color: p.muted }]}>{link.url}</Text></View><ExternalLink size={15} color={p.muted} strokeWidth={1.8} /></Pressable>)}</View> : null}</ModelSection></View>

      <View {...recordSection("Subscriptions")}><ModelSection title="Subscriptions" description="Commercial plans and bundled access that currently include this model.">{subscriptions.isLoading ? <ActivityIndicator style={styles.sectionLoader} color={colour.blue} /> : subscriptions.data?.length ? subscriptions.data.map(plan => <SubscriptionBlock key={plan.plan_id ?? plan.plan_uuid ?? plan.name} plan={plan} />) : <EmptySection title="No subscriptions listed" body="No commercial plans currently list this model." />}</ModelSection></View>

      <View {...recordSection("FAQ")}><ModelSection title="FAQ" description="Common questions about this model profile."><DataRow label="Who created this model?" value={creator} /><DataRow label="Can I use it through Phaseo?" value={isGatewayActive ? "Yes, through the active gateway routes above." : "Not through an active gateway route yet."} /><DataRow label="Where is the canonical profile?" value={`phaseo.app/models/${m.id}`} last /></ModelSection></View>

      <View style={styles.bottomActions}><Pressable accessibilityRole="button" onPress={() => void Linking.openURL(`https://phaseo.app/models/${m.id}`)} style={[styles.openButton, { backgroundColor: colour.blue }]}><ExternalLink size={16} color={colour.white} strokeWidth={1.9} /><Text style={styles.openButtonLabel}>Open full profile on Phaseo</Text></Pressable></View>
    </ScrollView>
  </Screen>;
}

function PricingBlock({ provider }: { provider: ModelPricing }) {
  const p = usePalette();
  const rules = provider.pricing_rules.slice().sort((a, b) => (a.meter ?? "").localeCompare(b.meter ?? ""));
  return <View style={[styles.pricingBlock, { borderBottomColor: p.border }]}><View style={styles.pricingHeader}><View style={styles.pricingProvider}><ProviderLogo id={provider.provider.api_provider_id} label={provider.provider.api_provider_name} size={30} /><Text style={[styles.providerName, { color: p.text }]}>{provider.provider.api_provider_name ?? provider.provider.api_provider_id ?? "Provider"}</Text></View><Pill tone={provider.provider.status === "active" ? "green" : "neutral"}>{prettyLabel(provider.provider.status ?? "Unknown")}</Pill></View>{rules.length ? rules.slice(0, 8).map(rule => <DataRow key={rule.id ?? `${rule.meter}:${rule.pricing_plan}`} label={`${pricingLabel(rule)}${rule.pricing_plan && rule.pricing_plan !== "standard" ? ` · ${prettyLabel(rule.pricing_plan)}` : ""}`} value={pricingValue(rule)} last={false} />) : <Text style={[styles.cardNote, { color: p.muted }]}>No active pricing rules listed.</Text>}</View>;
}

function BenchmarkList({ values }: { values: ModelBenchmark[] }) {
  const p = usePalette();
  return <View>{values.map((benchmark, index) => <View key={benchmark.benchmarkId ?? `${benchmark.benchmarkName}:${index}`} style={[styles.benchmarkRow, { borderBottomColor: p.border }]}><View style={styles.benchmarkCopy}><Text style={[styles.benchmarkName, { color: p.text }]}>{benchmark.benchmarkName ?? "Benchmark"}</Text><Text style={[styles.benchmarkMeta, { color: p.muted }]}>{benchmark.rank != null && benchmark.totalModels != null ? `Rank #${benchmark.rank} of ${benchmark.totalModels}` : benchmark.isSelfReported ? "Self-reported" : "Published result"}</Text></View><Text style={[styles.benchmarkScore, { color: colour.blue }]}>{benchmark.scoreDisplay ?? (benchmark.score == null ? "Not listed" : String(benchmark.score))}</Text></View>)}</View>;
}

function ActivityBars({ rows, maxTokens }: { rows: ModelActivityRow[]; maxTokens: number }) {
  const p = usePalette();
  return <View style={styles.activityBars}>{rows.map(row => <View key={row.dayBucket} style={styles.activityBarRow}><Text style={[styles.activityDate, { color: p.muted }]}>{activityLabel(row.dayBucket)}</Text><View style={[styles.activityTrack, { backgroundColor: p.surface }]}><View style={[styles.activityFill, { backgroundColor: colour.blue, width: `${Math.max(2, (row.totalTokens / maxTokens) * 100)}%` }]} /></View><Text style={[styles.activityValue, { color: p.muted }]}>{formatCompact(row.totalTokens)}</Text></View>)}</View>;
}

function TimelineRow({ event }: { event: ModelTimelineEvent }) {
  const p = usePalette();
  return <View style={[styles.timelineRow, { borderBottomColor: p.border }]}><View style={[styles.timelineDot, { backgroundColor: colour.blue }]} /><View style={styles.timelineCopy}><Text style={[styles.timelineTitle, { color: p.text }]}>{event.eventName ?? prettyLabel(event.eventType ?? "Model event")}</Text><Text style={[styles.timelineMeta, { color: p.muted }]}>{formatDate(event.date)}{event.modelName ? ` · ${event.modelName}` : ""}</Text>{event.description ? <Text style={[styles.timelineMeta, { color: p.muted }]}>{event.description}</Text> : null}</View></View>;
}

function SubscriptionBlock({ plan }: { plan: ModelSubscription }) {
  const p = usePalette();
  return <View style={[styles.subscriptionBlock, { borderBottomColor: p.border }]}><View style={styles.subscriptionHeader}><Text style={[styles.subscriptionName, { color: p.text }]}>{plan.name ?? "Subscription plan"}</Text>{plan.organisation?.name ? <Text style={[styles.subscriptionOwner, { color: p.muted }]}>{plan.organisation.name}</Text> : null}</View>{plan.description ? <Text style={[styles.subscriptionDescription, { color: p.muted }]}>{plan.description}</Text> : null}{plan.prices.length ? plan.prices.map((price, index) => <DataRow key={`${price.frequency}:${index}`} label={prettyLabel(price.frequency)} value={`${formatCode(price.currency)} ${price.price}`} last={index === plan.prices.length - 1} />) : null}{plan.link ? <Pressable onPress={() => void Linking.openURL(plan.link!)} style={styles.subscriptionLink}><Text style={[styles.subscriptionLinkText, { color: colour.blue }]}>View plan</Text><ExternalLink size={14} color={colour.blue} /></Pressable> : null}</View>;
}

function ArrowInIcon({ color, size }: { color?: string; size?: number }) { return <Text style={{ color, fontSize: size ?? 14, fontFamily: font.bold }}>↓</Text>; }
function ArrowOutIcon({ color, size }: { color?: string; size?: number }) { return <Text style={{ color, fontSize: size ?? 14, fontFamily: font.bold }}>↑</Text>; }
function ClockIcon({ color, size }: { color?: string; size?: number }) { return <Text style={{ color, fontSize: size ?? 14, fontFamily: font.bold }}>◷</Text>; }

const styles = StyleSheet.create({
  content: { paddingBottom: 56 }, hero: { paddingHorizontal: space.lg, paddingTop: space.xl }, heroCreatorRow: { flexDirection: "row", alignItems: "center", gap: space.md }, heroCreatorCopy: { flex: 1, gap: 2 }, eyebrow: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1, textTransform: "uppercase" }, heroCreatorMeta: { fontFamily: font.regular, fontSize: 12 }, title: { marginTop: space.lg, fontFamily: font.bold, fontSize: 28, letterSpacing: -0.6, lineHeight: 35 }, id: { marginTop: 7, fontFamily: font.mono, fontSize: 12 }, badges: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md }, description: { marginTop: space.lg, fontFamily: font.regular, fontSize: 14, lineHeight: 22 }, heroActions: { flexDirection: "row", gap: space.sm, marginTop: space.lg }, smallAction: { minHeight: 36, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, paddingHorizontal: space.md, flexDirection: "row", alignItems: "center", gap: space.xs }, smallActionLabel: { fontFamily: font.semibold, fontSize: 12 }, toc: { marginTop: space.xl }, tocContent: { paddingHorizontal: space.lg, gap: space.sm }, tocItem: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 8 }, tocText: { fontFamily: font.semibold, fontSize: 11 }, section: { marginHorizontal: space.lg, marginTop: space.xxl }, sectionTitle: { fontFamily: font.semibold, fontSize: 17, letterSpacing: -0.1 }, sectionDescription: { marginTop: 4, fontFamily: font.regular, fontSize: 12, lineHeight: 18 }, sectionCard: { marginTop: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: "hidden" }, sectionLoader: { paddingVertical: space.xxl }, dataRow: { minHeight: 48, paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }, dataLabel: { flex: 1, fontFamily: font.regular, fontSize: 12 }, dataValue: { flex: 1.6, fontFamily: font.semibold, fontSize: 12, textAlign: "right" }, mono: { fontFamily: font.mono, color: colour.blue }, infoGrid: { margin: space.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, flexDirection: "row", flexWrap: "wrap", overflow: "hidden" }, infoCell: { width: "50%", minHeight: 72, padding: space.md }, infoCellRight: { borderRightWidth: StyleSheet.hairlineWidth }, infoCellBottom: { borderBottomWidth: StyleSheet.hairlineWidth }, infoLabelRow: { flexDirection: "row", alignItems: "center", gap: space.xs }, infoLabel: { fontFamily: font.regular, fontSize: 11 }, infoValue: { marginTop: 7, fontFamily: font.semibold, fontSize: 13 }, providerBlock: { padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth }, providerHeader: { flexDirection: "row", alignItems: "center", gap: space.md }, providerTitleBlock: { flex: 1, gap: 2 }, providerName: { fontFamily: font.semibold, fontSize: 14 }, providerSlug: { fontFamily: font.mono, fontSize: 11 }, providerFooter: { paddingTop: space.sm }, providerFooterText: { fontFamily: font.regular, fontSize: 11 }, supportedParams: { padding: space.lg, gap: space.sm }, subheading: { paddingHorizontal: space.lg, paddingTop: space.lg, fontFamily: font.semibold, fontSize: 13 }, parameterWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, parameterChip: { minHeight: 28, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.pill, paddingHorizontal: space.sm, flexDirection: "row", alignItems: "center", gap: 5 }, parameterText: { fontFamily: font.mono, fontSize: 10 }, cardNote: { paddingHorizontal: space.lg, paddingVertical: space.md, fontFamily: font.regular, fontSize: 11, lineHeight: 17 }, pricingBlock: { padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth }, pricingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginBottom: space.sm }, pricingProvider: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm }, benchmarkRow: { minHeight: 62, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: space.md }, benchmarkCopy: { flex: 1, gap: 4 }, benchmarkName: { fontFamily: font.semibold, fontSize: 13 }, benchmarkMeta: { fontFamily: font.regular, fontSize: 11 }, benchmarkScore: { fontFamily: font.bold, fontSize: 15 }, activityBars: { padding: space.lg, gap: space.sm }, activityBarRow: { flexDirection: "row", alignItems: "center", gap: space.sm }, activityDate: { width: 42, fontFamily: font.regular, fontSize: 10 }, activityTrack: { flex: 1, height: 8, borderRadius: radius.pill, overflow: "hidden" }, activityFill: { height: "100%", borderRadius: radius.pill }, activityValue: { width: 40, textAlign: "right", fontFamily: font.mono, fontSize: 10 }, appRow: { minHeight: 56, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: space.sm }, appRank: { width: 18, fontFamily: font.regular, fontSize: 12, textAlign: "right" }, appIcon: { width: 30, height: 30, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" }, appIconText: { fontFamily: font.bold, fontSize: 12 }, appCopy: { flex: 1, gap: 2 }, appName: { fontFamily: font.semibold, fontSize: 13 }, appSubtitle: { fontFamily: font.regular, fontSize: 11 }, appTokens: { fontFamily: font.mono, fontSize: 10 }, timeline: { paddingBottom: space.md }, timelineRow: { minHeight: 58, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "flex-start", gap: space.sm }, timelineDot: { width: 8, height: 8, borderRadius: radius.pill, marginTop: 5 }, timelineCopy: { flex: 1, gap: 2 }, timelineTitle: { fontFamily: font.semibold, fontSize: 12 }, timelineMeta: { fontFamily: font.regular, fontSize: 11, lineHeight: 16 }, links: { paddingBottom: space.sm }, linkRow: { minHeight: 54, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", gap: space.sm }, linkCopy: { flex: 1, gap: 2 }, linkTitle: { fontFamily: font.semibold, fontSize: 12 }, linkUrl: { fontFamily: font.mono, fontSize: 10 }, subscriptionBlock: { padding: space.lg, borderBottomWidth: StyleSheet.hairlineWidth }, subscriptionHeader: { gap: 3 }, subscriptionName: { fontFamily: font.semibold, fontSize: 14 }, subscriptionOwner: { fontFamily: font.regular, fontSize: 11 }, subscriptionDescription: { marginTop: space.sm, fontFamily: font.regular, fontSize: 12, lineHeight: 18 }, subscriptionLink: { marginTop: space.sm, flexDirection: "row", alignItems: "center", gap: space.xs }, subscriptionLinkText: { fontFamily: font.semibold, fontSize: 12 }, bottomActions: { marginHorizontal: space.lg, marginTop: space.xxl }, openButton: { minHeight: 46, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm }, openButtonLabel: { color: colour.white, fontFamily: font.semibold, fontSize: 13 }
});
