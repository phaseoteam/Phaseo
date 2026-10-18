import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ArrowLeft, Check, ChevronDown, CircleAlert, Info, MessageSquare, Scale, ScrollText, TriangleAlert } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, type ScrollViewInstance, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Markdown } from "@/components/Markdown";
import { Button, EmptyState, Icon, IconButton, LoadingState, OptionSheet, ReadableWidth, Screen, Text, useMenu, type SelectOption, type ViewRef } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import {
  getModel, getModelAvailability, getModelBenchmarks, getModelGatewayMetadata, getModelPricing, getModelSubscriptions, getModelTimeline,
  type ModelDetail as ModelDetailData,
} from "@/lib/api/models";
import { request } from "@/lib/api/http";
import { isChatModel, modelName as cardName, organisationName as cardOrganisation } from "@/lib/catalogue";
import { cn } from "@/lib/cn";
import { formatCompact } from "@/lib/format";
import { compareStore, toggleCompare, updateFilters, useCatalogueIndex } from "./state";
import { lineage, parseTypes } from "./detail/about";
import { AboutSection, SubscriptionsList, VerificationBlock } from "./detail/AboutSection";
import { ActivitySection, AppsSection } from "./detail/ActivitySection";
import { BenchmarksSection } from "./detail/BenchmarksSection";
import { buildFaq } from "./detail/faq";
import { FaqList, OtherModels } from "./detail/FaqSection";
import { PageSection } from "./detail/parts";
import { PerformanceSection, UptimeSection } from "./detail/PerformanceSection";
import { PricingSection } from "./detail/PricingSection";
import { ProvidersSection } from "./detail/ProvidersSection";
import { activeSectionAt, modelAccessLayout, modelPageSections, scrollTargetFor, SECTION_META, supportsProvenanceVerification, type SectionId } from "./detail/sections";

const publicKey = (id: string, part: string) => ["public", "model", id, part] as const;
const FREE_ROUTER_ID = "phaseo/free";

/** Height of the pinned section menu that covers the top of the scroll area once you scroll past it. */
const PINNED_MENU_HEIGHT = 56;

/**
 * A model's page, rebuilt to match phaseo.app at phone width: the same sections in the same order, from
 * the same `/api/_web` endpoints. Also the detail pane beside the Models list on tablets.
 */
export function ModelDetail({ id }: { id: string }) {
  const router = useRouter();
  const { split } = useLayout();
  const { index } = useCatalogueIndex();
  const card = index.get(id);

  const model = useQuery({ queryKey: publicKey(id, "detail"), queryFn: () => getModel(id) });
  const gateway = useQuery({ queryKey: publicKey(id, "gateway"), queryFn: () => getModelGatewayMetadata(id) });
  const pricing = useQuery({ queryKey: publicKey(id, "pricing"), queryFn: () => getModelPricing(id) });
  const availability = useQuery({ queryKey: publicKey(id, "availability"), queryFn: () => getModelAvailability(id) });
  const benchmarks = useQuery({ queryKey: publicKey(id, "benchmarks"), queryFn: () => getModelBenchmarks(id) });
  const plans = useQuery({ queryKey: publicKey(id, "plans"), queryFn: () => getModelSubscriptions(id) });
  const timeline = useQuery({ queryKey: publicKey(id, "timeline"), queryFn: () => getModelTimeline(id) });
  const notice = useQuery({ queryKey: publicKey(id, "notice"), queryFn: async () => (await request<{ notice?: { tone: string; markdown: string } | null }>(`/api/_web/models/${encodeURIComponent(id)}/notice`))?.notice ?? null });

  const scroll = useRef<ScrollViewInstance>(null);
  const offsets = useRef(new Map<string, number>());
  const [renderedSections, setRenderedSections] = useState<string[]>([]);
  const [headerEnd, setHeaderEnd] = useState(0);
  const [menuY, setMenuY] = useState(0);
  const [view, setView] = useState<{ compact: boolean; pinned: boolean; active: string | null }>({ compact: false, pinned: false, active: null });
  // One jump menu, opened from the inline or the pinned button (a dropdown under it on tablets).
  const jumpMenu = useMenu();
  const inlineMenuRef = useRef<ViewRef>(null);
  const pinnedMenuRef = useRef<ViewRef>(null);

  const data = model.data;
  const name = data?.name ?? (card ? cardName(card) : id.split("/").at(-1) ?? id);
  const organisation = data?.organisation?.name ?? (card ? cardOrganisation(card) : data?.organisation_id ?? id.split("/")[0] ?? "");
  const organisationId = data?.organisation_id ?? card?.organisation_id ?? id.split("/")[0] ?? "";
  const providers = pricing.data ?? [];
  const hasApiProviders = (availability.data?.activeProviderCount ?? 0) > 0 || (gateway.data?.providers.length ?? 0) > 0 || providers.some((provider) => provider.provider_models.length > 0);
  const layout = modelAccessLayout({ hasSubscriptions: plans.data ? plans.data.length > 0 : null, hasApiProviders, isPrivateModel: data?.is_private === true, status: data?.status });
  const isGatewayActive = data?.is_private ? true : layout.subscriptionOnly ? false : availability.data?.isGatewayActive ?? true;
  const outputTypes = parseTypes(data?.output_types ?? data?.output_modalities ?? []);
  const sections = modelPageSections({
    subscriptionOnly: layout.subscriptionOnly,
    showBenchmarks: (benchmarks.data?.highlights.length ?? 0) > 0,
    showSubscriptions: (plans.data?.length ?? 0) > 0,
    status: data?.status,
    isGatewayActive,
    showProviders: layout.showProviders,
    showVerification: supportsProvenanceVerification(outputTypes),
    isPrivateModel: data?.is_private === true,
  });
  const related = useMemo(() => lineage(timeline.data, data?.previous_model_id, (relatedId) => {
    const relatedCard = index.get(relatedId);
    return relatedCard ? cardName(relatedCard) : null;
  }), [timeline.data, data?.previous_model_id, index]);
  // The website offers Chat whenever the API can be used; the app's chat also needs a live chat route.
  const canChat = layout.canUseApi && data?.status !== "Retired" && (card ? isChatModel(card) : (gateway.data?.activeProviders.length ?? 0) > 0);
  const openChat = () => router.push({ pathname: "/chat/new", params: { model: id } });
  const description = data?.description ?? card?.description ?? null;

  const onLayoutSection = useCallback((section: string, y: number) => {
    if (offsets.current.get(section) === y) return;
    offsets.current.set(section, y);
    setRenderedSections([...offsets.current.keys()]);
  }, []);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const listed = sections.filter((section) => offsets.current.has(section)).map((section) => ({ id: section as string, y: offsets.current.get(section)! }));
    const next = { compact: headerEnd > 0 && y > headerEnd, pinned: menuY > 0 && y > menuY, active: activeSectionAt(listed, y, PINNED_MENU_HEIGHT + 96) };
    if (next.compact !== view.compact || next.pinned !== view.pinned || next.active !== view.active) setView(next);
  };

  const jump = (section: SectionId) => {
    const y = offsets.current.get(section);
    if (y == null) return;
    scroll.current?.scrollTo({ y: scrollTargetFor(y, PINNED_MENU_HEIGHT), animated: true });
    setView((current) => ({ ...current, active: section }));
  };

  const menuSections = sections.filter((section) => renderedSections.includes(section));
  const activeSection = (view.active as SectionId | null) ?? menuSections[0] ?? null;
  const menuOptions: SelectOption<SectionId>[] = menuSections.map((section) => ({ value: section, label: SECTION_META[section].label, icon: SECTION_META[section].icon }));
  const compare = () => {
    if (!compareStore.get().includes(id)) toggleCompare(id);
    router.push("/compare");
  };
  const showLab = () => {
    updateFilters({ organisations: [organisation] });
    router.push("/models");
  };

  if (model.isLoading && !card) return <Screen><TopBar back={!split} /><LoadingState /></Screen>;
  if (model.isError && !card) return <Screen><TopBar back={!split} /><EmptyState title="Model not found" body="It may have been renamed or removed from the catalogue." /></Screen>;

  const sectionProps = (section: SectionId) => ({ onLayoutSection, first: section === sections[0] });
  const faq = data ? buildFaq({
    model: data,
    description,
    benchmarkCount: benchmarks.data?.highlights.length ?? 0,
    activeProviderCount: data.is_private ? 1 : availability.data?.activeProviderCount ?? gateway.data?.activeProviders.length ?? 0,
    isGatewayActive,
    showProviders: layout.showProviders,
    pricing: providers,
    related,
    gateway: gateway.data,
  }) : [];

  const renderSection = (section: SectionId): ReactNode => {
    switch (section) {
      case "providers":
        return (
          <PageSection key={section} id={section} {...sectionProps(section)} title="Providers" description={layout.subscriptionOnly || !isGatewayActive ? "Provider listings and known route availability for this model." : "API providers, route pricing, availability, and recent reliability signals."}>
            {pricing.isLoading ? <LoadingState /> : <ProvidersSection modelId={id} providers={providers} creatorId={organisationId} modelStatus={data?.status} organisationName={organisation} />}
          </PageSection>
        );
      case "performance":
        return <PerformanceSection key={section} modelId={id} {...sectionProps(section)} />;
      case "pricing":
        return (
          <PageSection key={section} id={section} {...sectionProps(section)} title="Pricing" description="Weighted provider pricing over the last 30 days, with recent route pricing history below.">
            {pricing.isLoading ? <LoadingState /> : <PricingSection modelId={id} providers={providers} />}
          </PageSection>
        );
      case "benchmarks":
        return (
          <PageSection key={section} id={section} {...sectionProps(section)} title="Benchmarks">
            <BenchmarksSection modelId={id} highlights={benchmarks.data?.highlights ?? []} results={benchmarks.data?.results ?? []} />
          </PageSection>
        );
      case "activity":
        return <ActivitySection key={section} modelId={id} {...sectionProps(section)} />;
      case "apps":
        return <AppsSection key={section} modelId={id} {...sectionProps(section)} />;
      case "uptime":
        return <UptimeSection key={section} modelId={id} {...sectionProps(section)} />;
      case "verification":
        return (
          <PageSection key={section} id={section} {...sectionProps(section)} title="Verification" description="Check generated media for known OpenAI provenance signals.">
            <VerificationBlock outputTypes={outputTypes} />
          </PageSection>
        );
      case "about":
        return data ? (
          <PageSection key={section} id={section} {...sectionProps(section)} title="About" description={data.status === "Retired" ? "Archived dates, capabilities, links, and model metadata." : "Key dates, capabilities, and model metadata."}>
            <AboutSection model={data} related={related} />
          </PageSection>
        ) : null;
      case "subscriptions":
        return (
          <PageSection key={section} id={section} {...sectionProps(section)} title="Subscriptions" description={data?.status === "Retired" ? "Historical commercial plans and bundled access that listed this model." : "Commercial plans and bundled access that currently include this model."}>
            <SubscriptionsList plans={plans.data ?? []} />
          </PageSection>
        );
      case "faq":
        return data ? (
          <PageSection key={section} id={section} {...sectionProps(section)} title="Frequently asked questions">
            <FaqList items={faq} onJump={jump} />
          </PageSection>
        ) : null;
    }
  };

  const compactHeader = view.compact ? (
    <View className="flex-1 flex-row items-center gap-2">
      <Logo id={organisationId} label={organisation} colour={card?.organisation_colour} size={32} />
      <Text variant="label" numberOfLines={1} className="flex-1">{organisation}: {name}</Text>
      {canChat ? <IconButton icon={MessageSquare} label="Chat about this model" tone="primary-foreground" size={18} className="h-9 w-9 bg-primary active:opacity-85" onPress={openChat} /> : null}
      <IconButton icon={Scale} label="Compare this model" tone={canChat ? "foreground" : "primary-foreground"} size={18} className={cn("h-9 w-9", canChat ? "border border-border" : "bg-primary active:opacity-85")} onPress={compare} />
    </View>
  ) : null;

  return (
    <Screen>
      <TopBar back={!split}>{compactHeader}</TopBar>
      <View className="flex-1">
        <ScrollView ref={scroll} contentContainerClassName="pb-16" onScroll={onScroll} scrollEventThrottle={32}>
          <ReadableWidth>
            <View onLayout={(event) => setHeaderEnd(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}>
              <Banners status={data?.status} notice={notice.data ?? null} />
              <View className="flex-row items-start gap-3 px-4 pt-2">
                <Logo id={organisationId} label={organisation} colour={card?.organisation_colour} size={44} />
                <View className="flex-1">
                  <Text className="text-[28px] font-bold leading-[34px] tracking-tight text-foreground" selectable accessibilityRole="header">
                    <Text accessibilityRole="link" onPress={showLab} suppressHighlighting className="text-[28px] font-bold leading-[34px] tracking-tight text-foreground">{organisation}:</Text> {name}
                  </Text>
                  <ModelIdentifier modelId={data?.id || id} aliases={gateway.data?.aliases?.length ? gateway.data.aliases : data?.aliases ?? []} variants={data?.variants ?? []} />
                </View>
              </View>
            </View>
            <HeaderActions canChat={canChat} onChat={openChat} onCompare={compare} />
            {description ? <Description text={description} /> : null}
            {menuOptions.length ? (
              <View className="px-4 pt-5" onLayout={(event) => setMenuY(event.nativeEvent.layout.y + event.nativeEvent.layout.height)}>
                <View ref={inlineMenuRef} collapsable={false}><SectionMenuButton section={activeSection} onPress={() => void jumpMenu.show(inlineMenuRef)} /></View>
              </View>
            ) : null}
            {/* Sections stay direct children here so their layout y is the scroll offset the jump menu uses. */}
            <View className="h-6" />
            {id === FREE_ROUTER_ID ? <FreeRouterOverview /> : sections.map(renderSection)}
            {data && data.status !== "Retired" && organisationId && id !== FREE_ROUTER_ID ? (
              <View className="mt-10">
                <View className="mx-4 mb-6 h-px bg-border" />
                <Text className="mx-4 mb-3 text-[20px] font-semibold leading-7 tracking-tight text-foreground">Other models from <Text className="text-[20px] font-semibold leading-7 tracking-tight text-link" onPress={showLab} suppressHighlighting>{organisation}</Text></Text>
                <OtherModels modelId={id} organisationId={organisationId} />
              </View>
            ) : null}
          </ReadableWidth>
        </ScrollView>
        {view.pinned && activeSection ? (
          <View className="absolute inset-x-0 top-0 border-b border-border bg-background px-4 py-2" style={{ height: PINNED_MENU_HEIGHT }}>
            <ReadableWidth><View ref={pinnedMenuRef} collapsable={false}><SectionMenuButton section={activeSection} onPress={() => void jumpMenu.show(pinnedMenuRef)} pinned /></View></ReadableWidth>
          </View>
        ) : null}
      </View>
      <OptionSheet open={jumpMenu.open} anchor={jumpMenu.anchor} title="Jump to section" value={activeSection} options={menuOptions} onChange={jump} onClose={jumpMenu.close} />
    </Screen>
  );
}

/** Back arrow, plus the compact model header once the title has scrolled away. */
function TopBar({ back, children }: { back?: boolean; children?: ReactNode }) {
  const router = useRouter();
  const showBack = back && router.canGoBack();
  return (
    <View className={cn("min-h-12 flex-row items-center gap-1 px-2", children && "border-b border-border pb-1.5 pt-1")}>
      {showBack ? <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} /> : <View className="w-2" />}
      {children}
    </View>
  );
}

/**
 * Chat and Compare side by side. Reporting data issues and copying request code are left to the
 * website: neither is likely on a phone. Chat is the primary action when the model can chat.
 */
function HeaderActions({ canChat, onChat, onCompare }: { canChat: boolean; onChat: () => void; onCompare: () => void }) {
  return (
    <View className="mt-4 flex-row gap-2 px-4">
      {canChat ? <Button label="Chat" icon={MessageSquare} className="flex-1" onPress={onChat} /> : null}
      <Button label="Compare" icon={Scale} variant={canChat ? "outline" : "primary"} className="flex-1" onPress={onCompare} />
    </View>
  );
}

/** The model ID; with aliases or variants it opens a list to copy any of them (ModelIdentifierControl). */
function ModelIdentifier({ modelId, aliases, variants }: { modelId: string; aliases: string[]; variants: NonNullable<ModelDetailData["variants"]> }) {
  const router = useRouter();
  const menu = useMenu();
  const triggerRef = useRef<ViewRef>(null);
  const [copied, setCopied] = useState(false);
  const identifiers = [modelId, ...aliases.filter((alias) => alias !== modelId)];
  const otherVariants = variants.filter((variant) => variant.model_id !== modelId);
  const copy = (value: string) => {
    void Clipboard.setStringAsync(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const options: SelectOption<string>[] = [
    ...identifiers.map((value) => ({ value, label: value, description: value === modelId ? "Default · tap to copy" : "Alias · tap to copy" })),
    ...otherVariants.map((variant) => ({ value: `variant:${variant.model_id}`, label: variant.name ?? variant.model_id, description: `Variant · ${variant.model_id}` })),
  ];
  return (
    <>
      <View ref={triggerRef} collapsable={false} className="mt-2 self-start">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={identifiers.length > 1 || otherVariants.length ? "Model identifiers" : `Copy model identifier ${modelId}`}
          onPress={() => (identifiers.length > 1 || otherVariants.length ? void menu.show(triggerRef) : copy(modelId))}
          className="flex-row items-center gap-1"
        >
          <Text variant="mono" numberOfLines={1} className="shrink text-[13px] text-foreground/80">{modelId}</Text>
          <Icon icon={copied ? Check : ChevronDown} tone="muted" size={14} />
        </Pressable>
      </View>
      <OptionSheet
        open={menu.open}
        anchor={menu.anchor}
        title="Identifiers"
        value={null}
        options={options}
        onChange={(value) => (value.startsWith("variant:") ? router.push(`/models/${value.slice("variant:".length)}`) : copy(value))}
        onClose={menu.close}
      />
    </>
  );
}

/** Four lines, then "Show full" (ModelDescriptionPanel). */
function Description({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  return (
    <View className="mt-5 px-4">
      {/* An unclamped, invisible copy measures whether the text runs past four lines. */}
      <Text variant="body" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" className="absolute inset-x-4 top-0 leading-[24px] opacity-0" onTextLayout={(event) => setLong(event.nativeEvent.lines.length > 4)}>{text}</Text>
      <Text variant="body" numberOfLines={open ? undefined : 4} className="leading-[24px] text-muted-foreground">{text}</Text>
      {long ? (
        <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} className="mt-1 flex-row items-center gap-1 self-end">
          <Text variant="small" className="font-medium text-muted-foreground">{open ? "Show less" : "Show full"}</Text>
          <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}><Icon icon={ChevronDown} tone="muted" size={14} /></View>
        </Pressable>
      ) : null}
    </View>
  );
}

/** The website's section jump menu: the current section's icon and name; tap for the full list. */
function SectionMenuButton({ section, onPress, pinned }: { section: SectionId | null; onPress: () => void; pinned?: boolean }) {
  const meta = section ? SECTION_META[section] : null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Jump to section. Current: ${meta?.label ?? "none"}`} onPress={onPress} className={cn("h-10 flex-row items-center gap-2 rounded-md border border-border px-3 active:bg-accent", pinned ? "bg-muted/40" : "bg-background")}>
      <Icon icon={meta?.icon ?? ScrollText} tone="muted" size={16} />
      <Text variant="small" className="flex-1 font-medium">{meta?.label ?? "Jump to section"}</Text>
      <Icon icon={ChevronDown} tone="muted" size={16} />
    </Pressable>
  );
}

const STATUS_BANNERS: Record<string, { title: string; body: string; tone: "info" | "warning" | "critical" }> = {
  Rumoured: { title: "Rumoured Model", body: "This model is rumoured to be coming soon. Any data here is subject to change until the release is confirmed.", tone: "info" },
  Announced: { title: "Announced Model", body: "This model has been announced, but not released. We await the full release to make more information available.", tone: "info" },
  Withheld: { title: "Withheld Model", body: "This model was announced with preliminary details but is currently withheld and may never be released publicly. Information may change at any time.", tone: "warning" },
  Preview: { title: "Preview Model", body: "This model is released as a preview. Availability, behaviour and pricing may change before general availability.", tone: "info" },
  "Limited Access": { title: "Limited Access Model", body: "This model is known to exist, but access is limited to selected customers, trusted partners, or private preview programs. It is not generally available through public routes.", tone: "info" },
  Deprecated: { title: "Deprecated Model", body: "This model has been marked deprecated. It is likely to be retired soon. You should look to move off this model and onto a newer model if you are using it.", tone: "warning" },
  Retired: { title: "Retired Model", body: "This model has reached end of life and can no longer be used. We keep this page as an archive for historical metadata, benchmark context, and any related subscription records.", tone: "critical" },
};

/** A page notice from the catalogue when there is one, otherwise the status banner (ModelDetailShell ModelNotice). */
function Banners({ status, notice }: { status?: string | null; notice: { tone: string; markdown: string } | null }) {
  const banner = notice?.markdown ? { title: null, body: notice.markdown, tone: (notice.tone as "info" | "warning" | "critical") ?? "info" } : status ? STATUS_BANNERS[status] : undefined;
  if (!banner) return null;
  const tones = { info: { box: "border-border bg-muted/40", icon: Info, tone: "link" as const }, warning: { box: "border-warning/40 bg-warning/10", icon: TriangleAlert, tone: "warning" as const }, critical: { box: "border-destructive/40 bg-destructive/10", icon: CircleAlert, tone: "destructive" as const } };
  const style = tones[banner.tone] ?? tones.info;
  return (
    <View className={cn("mx-4 mb-4 mt-1 flex-row gap-3 rounded-md border p-3", style.box)}>
      <Icon icon={style.icon} tone={style.tone} size={18} />
      <View className="flex-1">
        {banner.title ? <Text variant="label">{banner.title}</Text> : null}
        {notice?.markdown ? <Markdown text={banner.body} /> : <Text variant="small" className="mt-0.5 text-muted-foreground">{banner.body}</Text>}
      </View>
    </View>
  );
}

type FreeRouterData = { summary: { eligibleModels: number; eligibleProviders: number; routedRequests30d: number; totalCostNanos30d: number }; models: { modelId: string; name: string; organisationId: string; providerCount: number; usage?: { requests30d?: number } }[] };

/** phaseo/free: the website shows the free model pool instead of the usual sections. */
function FreeRouterOverview() {
  const router = useRouter();
  const overview = useQuery({ queryKey: ["public", "free-router-overview"], queryFn: () => request<FreeRouterData>("/api/_web/models/free-router-overview"), retry: false });
  const summary = overview.data?.summary;
  return (
    <PageSection id="providers" title="Free model pool" description="Currently eligible models served by phaseo/free. Usage below counts only requests made through the router itself.">
      {overview.isLoading ? <LoadingState /> : !summary ? (
        <Text variant="muted">{"The free model pool isn't available right now."}</Text>
      ) : (
        <View className="gap-4">
          <View className="flex-row flex-wrap overflow-hidden rounded-md border border-border">
            {([["Eligible models", formatCompact(summary.eligibleModels)], ["Eligible providers", formatCompact(summary.eligibleProviders)], ["Requests (30d)", formatCompact(summary.routedRequests30d)], ["Spend (30d)", `$${(summary.totalCostNanos30d / 1e9).toFixed(2)}`]] as const).map(([label, value], index) => (
              <View key={label} className={cn("w-1/2 px-3 py-3", index % 2 && "border-l border-border", index > 1 && "border-t border-border")}>
                <Text variant="caption">{label}</Text>
                <Text variant="heading">{value}</Text>
              </View>
            ))}
          </View>
          <View className="overflow-hidden rounded-md border border-border">
            {(overview.data?.models ?? []).map((entry, index, list) => (
              <Pressable key={entry.modelId} onPress={() => router.push(`/models/${entry.modelId}`)} className={cn("flex-row items-center gap-3 px-3 py-3 active:bg-accent", index < list.length - 1 && "border-b border-border")}>
                <Logo id={entry.organisationId} label={entry.name} size={24} />
                <Text variant="small" numberOfLines={1} className="flex-1 font-medium">{entry.name}</Text>
                <Text variant="caption">{entry.providerCount} providers</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </PageSection>
  );
}
