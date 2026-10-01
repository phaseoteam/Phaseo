"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Eye, ExternalLink, GitBranch, Plus, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import {
	deleteAdminPricingSku,
	fetchAdminPricingEditorSource,
	saveAdminPricingSku,
	saveAdminProviderRoute,
	type AdminPricingEditorSource,
} from "@/lib/fetchers/internal/adminModelEditorClient";
import { revalidateSingleModelApiInfoAction } from "@/app/(dashboard)/internal/data/actions";

type MeterDraft = {
	meter_key: string;
	modality: string;
	direction: "input" | "output" | "";
	unit: string;
	unit_quantity: string;
	price_usd: string;
	display_label: string;
	display_unit: string;
	billable: boolean;
	meter_order: string;
	metadata: Record<string, unknown>;
};

type SkuDraft = {
	sku_id?: string;
	provider_model_id: string;
	sku_code: string;
	version: string;
	operation: string;
	status: "draft" | "active" | "deprecated" | "disabled";
	region: string;
	service_tier_slug: string;
	display_name: string;
	description: string;
	currency: string;
	effective_from: string;
	effective_to: string;
	metadata: Record<string, unknown>;
	meters: MeterDraft[];
};

type PricingCondition = {
	path: string;
	op: string;
	value: string | number | boolean;
	or_group?: number;
	and_index?: number;
};

const PRICING_OPERATION_OPTIONS = [
	"text.generate", "text.embed", "text.rerank", "text.moderate",
	"image.generate", "image.edit", "audio.generate", "audio.speech",
	"audio.transcribe", "audio.transcription", "audio.translations", "audio.realtime",
	"music.generate", "video.generate", "video.edit", "voice.design", "ocr",
] as const;

const CONDITION_PATH_OPTIONS = [
	{ value: "input_tokens", key: "inputTokens" },
	{ value: "output_tokens", key: "outputTokens" },
	{ value: "total_tokens", key: "totalTokens" },
	{ value: "cache_duration_seconds", key: "cacheDuration" },
	{ value: "request_count", key: "requestCount" },
] as const;

const CONDITION_OPERATOR_OPTIONS = [
	{ value: "lt", key: "lessThan" },
	{ value: "lte", key: "atMost" },
	{ value: "gte", key: "atLeast" },
	{ value: "gt", key: "greaterThan" },
	{ value: "eq", key: "equals" },
	{ value: "neq", key: "notEquals" },
] as const;

const toLocalInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const nowInput = () => toLocalInput(new Date());
const toInputDate = (value: unknown) => typeof value === "string" && value ? toLocalInput(new Date(value)) : "";
const formatOfferDate = (value: string, locale: string) => value ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : null;

function emptyMeter(): MeterDraft {
	return { meter_key: "input_tokens", modality: "text", direction: "input", unit: "token", unit_quantity: "1000000", price_usd: "0", display_label: "", display_unit: "", billable: true, meter_order: "100", metadata: {} };
}

function automaticSkuCode(draft: Pick<SkuDraft, "operation" | "service_tier_slug" | "region" | "effective_from" | "metadata">) {
	const date = draft.effective_from.slice(0, 10).replaceAll("-", "") || "undated";
	const conditions = Array.isArray(draft.metadata.match)
		? draft.metadata.match.map((condition) => {
			if (!condition || typeof condition !== "object" || Array.isArray(condition)) return "condition";
			const row = condition as Record<string, unknown>;
			return [row.path, row.op, row.value].filter((value) => value !== undefined).join("-");
		}).join("-and-")
		: "";
	return [draft.operation, draft.service_tier_slug, draft.region || "global", conditions, date]
		.filter(Boolean)
		.join(".")
		.toLowerCase()
		.replace(/[^a-z0-9._:-]+/g, "-")
		.replace(/-+/g, "-");
}

function operationLabel(operation: string) {
	return operation.replaceAll(".", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function automaticOfferLabel(draft: Pick<SkuDraft, "operation" | "service_tier_slug" | "region">) {
	const tier = draft.service_tier_slug.replace(/\b\w/g, (character) => character.toUpperCase());
	return `${tier} · ${operationLabel(draft.operation)}${draft.region ? ` · ${draft.region.toUpperCase()}` : ""}`;
}

function offerDateState(draft: Pick<SkuDraft, "effective_from" | "effective_to">) {
	const now = Date.now();
	const from = draft.effective_from ? new Date(draft.effective_from).getTime() : null;
	const to = draft.effective_to ? new Date(draft.effective_to).getTime() : null;
	if (from && from > now) return "scheduled";
	if (to && to <= now) return "expired";
	return "current";
}

function formatTokenLimit(value: number | null | undefined, notSetLabel: string) {
	if (!value) return notSetLabel;
	if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`;
	if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
	return value.toLocaleString();
}

function pricingConditions(metadata: Record<string, unknown>): PricingCondition[] {
	if (!Array.isArray(metadata.match)) return [];
	return metadata.match.flatMap((condition) => {
		if (!condition || typeof condition !== "object" || Array.isArray(condition)) return [];
		const row = condition as Record<string, unknown>;
		if (typeof row.path !== "string" || typeof row.op !== "string" || !["string", "number", "boolean"].includes(typeof row.value)) return [];
		return [{
			path: row.path,
			op: row.op,
			value: row.value as string | number | boolean,
			...(typeof row.or_group === "number" ? { or_group: row.or_group } : {}),
			...(typeof row.and_index === "number" ? { and_index: row.and_index } : {}),
		}];
	});
}

function emptySku(providerModelId: string, operation = "text.generate"): SkuDraft {
	const draft = { provider_model_id: providerModelId, sku_code: "", version: "1", operation, status: "active" as const, region: "", service_tier_slug: "standard", display_name: "", description: "", currency: "USD", effective_from: nowInput(), effective_to: "", metadata: {}, meters: [emptyMeter()] };
	return { ...draft, sku_code: automaticSkuCode(draft), display_name: automaticOfferLabel(draft) };
}

function buildSkuDraft(sku: Record<string, any>, meters: Array<Record<string, any>>): SkuDraft {
	return {
		sku_id: sku.sku_id,
		provider_model_id: sku.provider_model_id,
		sku_code: String(sku.sku_code ?? "standard"),
		version: String(sku.version ?? 1),
		operation: String(sku.operation ?? "inference"),
		status: sku.status ?? "active",
		region: String(sku.region ?? ""),
		service_tier_slug: String(sku.service_tier_slug ?? "standard"),
		display_name: String(sku.display_name ?? ""),
		description: String(sku.description ?? ""),
		currency: String(sku.currency ?? "USD"),
		effective_from: toInputDate(sku.effective_from),
		effective_to: toInputDate(sku.effective_to),
		metadata: sku.metadata && typeof sku.metadata === "object" ? sku.metadata : {},
		meters: meters.map((meter) => ({
			meter_key: String(meter.meter_key), modality: String(meter.modality ?? "text"), direction: meter.direction === "input" || meter.direction === "output" ? meter.direction : "", unit: String(meter.unit ?? "unit"), unit_quantity: String(meter.unit_quantity ?? 1), price_usd: String(Number(meter.price_nanos ?? 0) / 1_000_000_000), display_label: String(meter.display_label ?? ""), display_unit: String(meter.display_unit ?? ""), billable: meter.billable !== false, meter_order: String(meter.meter_order ?? 100), metadata: meter.metadata && typeof meter.metadata === "object" ? meter.metadata : {},
		})),
	};
}

function buildDrafts(source: AdminPricingEditorSource): SkuDraft[] {
	return source.skus.map((sku) => buildSkuDraft(sku, source.meters.filter((meter) => meter.sku_id === sku.sku_id)));
}

export default function V2PricingEditor({ modelId, focusProviderId }: { modelId: string; focusProviderId?: string }) {
	const tUi = useTranslations("Common.ui");
	const tPricing = useTranslations("Common.ui.versionedPricing");
	const locale = useLocale();
	const [source, setSource] = useState<AdminPricingEditorSource | null>(null);
	const [drafts, setDrafts] = useState<SkuDraft[]>([]);
	const [routeDrafts, setRouteDrafts] = useState<AdminPricingEditorSource["routes"]>([]);
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [selectedSkuIndex, setSelectedSkuIndex] = useState(0);
	const [skuQuery, setSkuQuery] = useState("");
	const [providerQuery, setProviderQuery] = useState("");
	const [activeProviderSlug, setActiveProviderSlug] = useState(focusProviderId ?? "");
	const [connectingProviderSlug, setConnectingProviderSlug] = useState<string | null>(null);
	const [providerModelSlug, setProviderModelSlug] = useState(modelId);
	const conditionLabel = (condition: PricingCondition) => {
		const pathOption = CONDITION_PATH_OPTIONS.find((option) => option.value === condition.path);
		const operatorOption = CONDITION_OPERATOR_OPTIONS.find((option) => option.value === condition.op);
		const path = pathOption ? tPricing(`conditionPaths.${pathOption.key}` as never) : condition.path.replaceAll("_", " ");
		const operator = operatorOption ? tPricing(`conditionOperators.${operatorOption.key}` as never) : condition.op;
		const value = typeof condition.value === "number" && condition.path.includes("tokens")
			? `${formatTokenLimit(condition.value, tPricing("notSet"))} ${tPricing("tokens")}`
			: String(condition.value);
		return `${path} ${operator} ${value}`;
	};
	const pricingConditionLabel = (metadata: Record<string, unknown>) => {
		const conditions = pricingConditions(metadata);
		return conditions.length ? conditions.map(conditionLabel).join(` ${tPricing("and")} `) : tPricing("allRequests");
	};
	const formatOfferWindow = (from: string, to: string) => {
		const fromLabel = formatOfferDate(from, locale);
		const toLabel = formatOfferDate(to, locale);
		if (fromLabel && toLabel) return tPricing("dateWindow.range", { from: fromLabel, to: toLabel });
		if (fromLabel) return tPricing("dateWindow.from", { date: fromLabel });
		if (toLabel) return tPricing("dateWindow.until", { date: toLabel });
		return tPricing("dateWindow.none");
	};

	const load = useCallback(async () => {
		const next = await fetchAdminPricingEditorSource(modelId);
		setSource(next);
		setDrafts(buildDrafts(next));
		setRouteDrafts(next.routes);
		setSelectedSkuIndex(0);
		setActiveProviderSlug((current) => current || focusProviderId || next.routes[0]?.provider_slug || next.providers[0]?.provider_slug || "");
	}, [focusProviderId, modelId]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- load resolves asynchronously before updating editor state.
		void load().catch(() => toast.error(tPricing("loadFailed")));
	}, [load, tPricing]);

	const routes = useMemo(() => {
		const rows = source?.routes ?? [];
		return focusProviderId ? [...rows].sort((a, b) => Number(b.provider_slug === focusProviderId) - Number(a.provider_slug === focusProviderId)) : rows;
	}, [focusProviderId, source]);
	const activeProviderRoutes = routeDrafts.filter((route) => route.provider_slug === activeProviderSlug);
	const visibleProviders = (source?.providers ?? [])
		.filter((provider) => `${provider.name} ${provider.provider_slug}`.toLowerCase().includes(providerQuery.trim().toLowerCase()))
		.sort((a, b) => {
			const routesForA = routes.filter((route) => route.provider_slug === a.provider_slug);
			const routesForB = routes.filter((route) => route.provider_slug === b.provider_slug);
			const rank = (providerRoutes: typeof routes) => providerRoutes.some((route) => route.status === "active" && route.routing_enabled) ? 0 : providerRoutes.some((route) => route.status === "active") ? 1 : providerRoutes.length ? 2 : 3;
			return rank(routesForA) - rank(routesForB) || a.name.localeCompare(b.name);
		});

	const updateSku = (index: number, patch: Partial<SkuDraft>) => setDrafts((rows) => rows.map((row, rowIndex) => {
		if (rowIndex !== index) return row;
		const next = { ...row, ...patch };
		if (row.sku_id) return next;
		const shouldRefreshLabel = !("display_name" in patch) && (!row.display_name || row.display_name === automaticOfferLabel(row));
		return { ...next, sku_code: automaticSkuCode(next), ...(shouldRefreshLabel ? { display_name: automaticOfferLabel(next) } : {}) };
	}));
	const updateMeter = (skuIndex: number, meterIndex: number, patch: Partial<MeterDraft>) => setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === skuIndex ? { ...row, meters: row.meters.map((meter, index) => index === meterIndex ? { ...meter, ...patch } : meter) } : row));
	const updateConditions = (skuIndex: number, conditions: PricingCondition[]) => setDrafts((rows) => rows.map((row, rowIndex) => {
		if (rowIndex !== skuIndex) return row;
		const next = { ...row, metadata: { ...row.metadata, match: conditions } };
		return row.sku_id ? next : { ...next, sku_code: automaticSkuCode(next) };
	}));
	const updateRoute = (providerModelId: string, patch: Partial<AdminPricingEditorSource["routes"][number]>) => setRouteDrafts((rows) => rows.map((route) => route.provider_model_id === providerModelId ? { ...route, ...patch } : route));
	const saveRoute = async (providerModelId: string) => {
		const route = routeDrafts.find((item) => item.provider_model_id === providerModelId);
		if (!route) return;
		setBusyKey(`route-${providerModelId}`);
		try {
			await saveAdminProviderRoute(modelId, { provider_model_id: route.provider_model_id, provider_slug: route.provider_slug, provider_model_slug: route.provider_model_slug, status: route.status, routing_enabled: route.routing_enabled, input_modalities: route.input_modalities ?? [], output_modalities: route.output_modalities ?? [], regions: route.regions ?? [], context_length: route.context_length, max_output_tokens: route.max_output_tokens, effective_from: route.effective_from, effective_to: route.effective_to });
			await load();
			toast.success(tPricing("routeSaved"));
		} catch { toast.error(tPricing("routeSaveFailed")); }
		finally { setBusyKey(null); }
	};
	const addOffer = (providerModelId: string) => {
		const supportedOperation = source?.capabilities.find((capability) => capability.provider_model_id === providerModelId && PRICING_OPERATION_OPTIONS.includes(capability.capability_id as (typeof PRICING_OPERATION_OPTIONS)[number]))?.capability_id ?? "text.generate";
		setDrafts((rows) => [...rows, emptySku(providerModelId, supportedOperation)]);
		setSelectedSkuIndex(drafts.length);
	};
	const connectProvider = async () => {
		if (!connectingProviderSlug || !providerModelSlug.trim()) return;
		setBusyKey(`provider-${connectingProviderSlug}`);
		try {
			await saveAdminProviderRoute(modelId, { provider_slug: connectingProviderSlug, provider_model_slug: providerModelSlug.trim(), status: "active", routing_enabled: false, input_modalities: [], output_modalities: [], regions: [] });
			await load();
			setActiveProviderSlug(connectingProviderSlug);
			setConnectingProviderSlug(null);
			toast.success(tPricing("providerConnected"));
		} catch { toast.error(tPricing("providerConnectionFailed")); }
		finally { setBusyKey(null); }
	};

	const save = async (index: number) => {
		const draft = drafts[index];
		const key = draft.sku_id ?? `new-${index}`;
		setBusyKey(key);
		try {
			const metadata = { ...draft.metadata, match: pricingConditions(draft.metadata).filter((condition) => condition.value !== "") };
			const result = await saveAdminPricingSku(modelId, {
				...draft,
				metadata,
				version: Number(draft.version),
				region: draft.region || null,
				description: draft.description || null,
				effective_from: new Date(draft.effective_from).toISOString(),
				effective_to: draft.effective_to ? new Date(draft.effective_to).toISOString() : null,
				meters: draft.meters.map((meter) => ({ ...meter, direction: meter.direction || null, unit_quantity: Number(meter.unit_quantity), price_nanos: Math.round(Number(meter.price_usd) * 1_000_000_000), meter_order: Number(meter.meter_order), metadata: meter.metadata })),
			});
			await revalidateSingleModelApiInfoAction(modelId);
			const saved = result.pricing as { sku?: Record<string, any>; meters?: Array<Record<string, any>> };
			if (saved.sku) setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === index ? buildSkuDraft(saved.sku!, saved.meters ?? []) : row));
			toast.success(tPricing("pricingSaved"));
		} catch { toast.error(tPricing("pricingSaveFailed")); } finally { setBusyKey(null); }
	};

	const remove = async (index: number) => {
		const draft = drafts[index];
		if (!draft.sku_id) { setDrafts((rows) => rows.filter((_, rowIndex) => rowIndex !== index)); setSelectedSkuIndex((current) => Math.max(0, Math.min(current, drafts.length - 2))); return; }
		if (!window.confirm(tPricing("confirmDelete", { offer: draft.display_name || draft.sku_code }))) return;
		setBusyKey(draft.sku_id);
		try { await deleteAdminPricingSku(modelId, draft.sku_id); await revalidateSingleModelApiInfoAction(modelId); setDrafts((rows) => rows.filter((_, rowIndex) => rowIndex !== index)); setSelectedSkuIndex((current) => Math.max(0, Math.min(current, drafts.length - 2))); toast.success(tPricing("skuDeleted")); }
		catch { toast.error(tPricing("deleteFailed")); }
		finally { setBusyKey(null); }
	};

	if (!source) return <div className="rounded-md border p-4 text-sm text-muted-foreground sm:p-6">{tPricing("loading")}</div>;
	const activeRouteIds = new Set(activeProviderRoutes.map((route) => route.provider_model_id));
	const providerOfferIndexes = drafts.map((draft, index) => ({ draft, index })).filter(({ draft }) => activeRouteIds.has(draft.provider_model_id));
	const matchingSkuIndexes = drafts.map((draft, index) => ({ draft, index })).filter(({ draft }) => {
		const route = routes.find((item) => item.provider_model_id === draft.provider_model_id);
		const haystack = `${route?.provider_slug ?? ""} ${draft.display_name} ${draft.sku_code} ${draft.operation} ${draft.service_tier_slug} ${pricingConditionLabel(draft.metadata)}`.toLowerCase();
		return route?.provider_slug === activeProviderSlug && haystack.includes(skuQuery.trim().toLowerCase());
	});
	const selectProvider = (providerSlug: string) => {
		setActiveProviderSlug(providerSlug);
		setConnectingProviderSlug(null);
		const routeIds = new Set(routes.filter((route) => route.provider_slug === providerSlug).map((route) => route.provider_model_id));
		const firstOffer = drafts.findIndex((draft) => routeIds.has(draft.provider_model_id));
		if (firstOffer >= 0) setSelectedSkuIndex(firstOffer);
	};

	return <div className="space-y-4 sm:space-y-5">
		<div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div><h2 className="font-semibold">{tPricing("title")}</h2><p className="text-sm text-muted-foreground">{tPricing("description")}</p></div>
			<Button className="w-full sm:w-auto" type="button" variant="outline" disabled={!activeProviderRoutes.length} onClick={() => addOffer(activeProviderRoutes[0].provider_model_id)}><Plus className="mr-1 h-4 w-4" />{tPricing("addOffer")}</Button>
		</div>
		<section className="overflow-hidden rounded-xl border bg-background">
			<div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"><div><h3 className="text-sm font-semibold">{tPricing("chooseProviderHeading")}</h3><p className="text-xs text-muted-foreground">{tPricing("providersDescription")}</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="relative block sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={providerQuery} onChange={(event) => setProviderQuery(event.target.value)} placeholder={tPricing("searchProviders")} /></label><Button asChild type="button" variant="outline"><Link href="/internal/data/api-providers/new"><Plus className="mr-1.5 h-4 w-4" />{tPricing("newProvider")}</Link></Button>{activeProviderSlug ? <Button asChild type="button" variant="ghost" size="icon"><Link aria-label={tPricing("editProviderAria")} href={`/internal/data/api-providers/${activeProviderSlug}/edit`}><ExternalLink className="h-4 w-4" /></Link></Button> : null}</div></div>
			<div className="flex gap-2 overflow-x-auto p-3 sm:p-4">{visibleProviders.map((provider) => { const providerRoutes = routes.filter((route) => route.provider_slug === provider.provider_slug); const offerCount = drafts.filter((draft) => providerRoutes.some((route) => route.provider_model_id === draft.provider_model_id)).length; const selected = provider.provider_slug === activeProviderSlug; return <button key={provider.provider_slug} type="button" onClick={() => selectProvider(provider.provider_slug)} className={`min-w-52 rounded-xl border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/30"}`}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/20"><Logo id={provider.provider_slug} width={22} height={22} className="size-5.5" /></div><div className="min-w-0"><div className="truncate text-sm font-semibold">{provider.name}</div><div className="truncate font-mono text-[10px] text-muted-foreground">{provider.provider_slug}</div></div></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${providerRoutes.length ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{providerRoutes.length ? tPricing("connected") : tPricing("available")}</span></div><div className="mt-3 flex gap-3 border-t pt-2 text-[11px] text-muted-foreground"><span>{tPricing("routeCount", { count: providerRoutes.length })}</span><span>{tPricing("offerCount", { count: offerCount })}</span>{!provider.routable ? <span>{tPricing("external")}</span> : null}</div></button>; })}</div>
		</section>
		{!activeProviderRoutes.length && activeProviderSlug ? <section className="rounded-xl border border-dashed bg-muted/10 p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-medium">{tPricing("connectHeading", { provider: source.providers.find((provider) => provider.provider_slug === activeProviderSlug)?.name ?? activeProviderSlug })}</h3><p className="mt-1 max-w-xl text-sm text-muted-foreground">{tPricing("connectDescription")}</p></div><Button asChild type="button" variant="ghost" size="sm"><Link href={`/internal/data/api-providers/${activeProviderSlug}/edit`}><ExternalLink className="mr-1.5 h-3.5 w-3.5" />{tPricing("editProvider")}</Link></Button></div>{connectingProviderSlug === activeProviderSlug ? <div className="mt-4 grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="text-xs">{tPricing("providerModelIdentifier")}<Input className="mt-1" value={providerModelSlug} onChange={(event) => setProviderModelSlug(event.target.value)} placeholder={modelId} /></label><Button className="self-end" type="button" disabled={busyKey === `provider-${activeProviderSlug}`} onClick={() => void connectProvider()}>{busyKey === `provider-${activeProviderSlug}` ? tPricing("connecting") : tPricing("createRoute")}</Button></div> : <Button className="mt-4 w-full sm:w-auto" type="button" onClick={() => { setConnectingProviderSlug(activeProviderSlug); setProviderModelSlug(modelId); }}><Plus className="mr-1.5 h-4 w-4" />{tPricing("connectProvider")}</Button>}</section> : null}
		{activeProviderRoutes.length ? <section className="rounded-xl border bg-background"><div className="border-b p-3 sm:p-4"><h3 className="text-sm font-semibold">{tPricing("configureRoutes")}</h3><p className="text-xs text-muted-foreground">{tPricing("routeLimitsDescription")}</p></div><div className="grid gap-3 p-3 sm:p-4">{activeProviderRoutes.map((route) => <div key={route.provider_model_id} className="rounded-lg border bg-muted/10 p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="truncate text-sm font-medium">{route.provider_model_slug}</div><div className="truncate font-mono text-[10px] text-muted-foreground">{route.provider_model_id}</div></div><div className="flex gap-2"><span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">{tPricing("context")} {formatTokenLimit(route.context_length, tPricing("notSet"))}</span><span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">{tPricing("output")} {formatTokenLimit(route.max_output_tokens, tPricing("notSet"))}</span></div></div><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs">{tPricing("contextLength")}<Input className="mt-1" type="number" min="1" inputMode="numeric" value={route.context_length ?? ""} onChange={(event) => updateRoute(route.provider_model_id, { context_length: event.target.value ? Number(event.target.value) : null })} placeholder="400000" /></label><label className="text-xs">{tPricing("maxOutputTokens")}<Input className="mt-1" type="number" min="1" inputMode="numeric" value={route.max_output_tokens ?? ""} onChange={(event) => updateRoute(route.provider_model_id, { max_output_tokens: event.target.value ? Number(event.target.value) : null })} placeholder="128000" /></label><label className="text-xs">{tPricing("routeLifecycle")}<Select value={route.status} onValueChange={(value) => updateRoute(route.provider_model_id, { status: value })}><SelectTrigger className="mt-1 h-9 w-full rounded-md"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{tUi("status.active")}</SelectItem><SelectItem value="degraded">{tUi("status.degraded")}</SelectItem><SelectItem value="disabled">{tUi("status.disabled")}</SelectItem><SelectItem value="retired">{tUi("status.retired")}</SelectItem></SelectContent></Select></label><Button className="self-end" type="button" disabled={busyKey === `route-${route.provider_model_id}`} onClick={() => void saveRoute(route.provider_model_id)}><Save className="mr-1.5 h-4 w-4" />{busyKey === `route-${route.provider_model_id}` ? tPricing("saving") : tPricing("saveRoute")}</Button></div></div>)}</div></section> : null}
		{activeProviderRoutes.length && providerOfferIndexes.length ? <>
		<section className="overflow-hidden rounded-xl border bg-muted/10">
			<div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-start sm:justify-between sm:p-4"><div className="flex items-start gap-3"><Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><h3 className="text-sm font-medium">{tPricing("websitePreview")}</h3><p className="text-xs text-muted-foreground">{tPricing("websitePreviewDescription")}</p></div></div>{drafts[selectedSkuIndex] ? <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300"><GitBranch className="h-3 w-3" />{pricingConditionLabel(drafts[selectedSkuIndex].metadata)}</div> : null}</div>
			<div className="overflow-x-auto">
				<table className="w-full min-w-[680px] text-left text-sm">
					<thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">{tPricing("provider")}</th><th className="px-4 py-2 font-medium">{tPricing("offer")}</th><th className="px-4 py-2 font-medium">{tPricing("operation")}</th><th className="px-4 py-2 font-medium">{tPricing("meter")}</th><th className="px-4 py-2 text-right font-medium">{tPricing("price")}</th></tr></thead>
					<tbody>{drafts[selectedSkuIndex] ? drafts[selectedSkuIndex].meters.map((meter, meterIndex) => { const draft = drafts[selectedSkuIndex]; const route = routeDrafts.find((item) => item.provider_model_id === draft.provider_model_id); return <tr key={`preview-${selectedSkuIndex}-${meterIndex}`} className="border-t"><td className="px-4 py-2.5"><div className="flex items-center gap-2 font-medium"><Logo id={route?.provider_slug ?? "unknown"} width={20} height={20} className="size-5 rounded-sm" /><span>{route?.provider_slug ?? tPricing("unknownProvider")}</span></div><div className="mt-1 text-[10px] text-muted-foreground">{tPricing("contextOutputSummary", { context: formatTokenLimit(route?.context_length, tPricing("notSet")), output: formatTokenLimit(route?.max_output_tokens, tPricing("notSet")) })}</div></td><td className="px-4 py-2.5"><div>{draft.display_name || draft.sku_code}</div><div className="text-xs text-muted-foreground">{draft.service_tier_slug}{draft.region ? ` · ${draft.region}` : ""}</div><div className="mt-0.5 text-[11px] font-medium text-foreground/70">{formatOfferWindow(draft.effective_from, draft.effective_to)}</div></td><td className="px-4 py-2.5 font-mono text-xs">{draft.operation}</td><td className="px-4 py-2.5"><div>{meter.display_label || (meter.meter_key === "input_tokens" ? tPricing("inputTokensExample") : meter.meter_key)}</div><div className="text-xs text-muted-foreground">{tPricing("perUnit", { unit: meter.display_unit || (meter.meter_key === "input_tokens" ? tPricing("oneMillionTokens") : meter.unit_quantity + " " + meter.unit) })}</div></td><td className="px-4 py-2.5 text-right font-mono">${Number(meter.price_usd || 0).toLocaleString(locale, { maximumFractionDigits: 8 })}</td></tr>; }) : null}</tbody>
				</table>
			</div>
		</section>
		<div className="grid min-w-0 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
			<aside className="min-w-0 space-y-2 rounded-xl border p-2 lg:sticky lg:top-4 lg:self-start">
				<label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={skuQuery} onChange={(event) => setSkuQuery(event.target.value)} placeholder={tPricing("findOffer")} /></label>
				<div className="flex gap-2 overflow-x-auto pb-1 lg:max-h-[65vh] lg:flex-col lg:overflow-y-auto lg:pb-0">{matchingSkuIndexes.map(({ draft, index }) => { const route = routes.find((item) => item.provider_model_id === draft.provider_model_id); return <button key={draft.sku_id ?? `nav-${index}`} type="button" onClick={() => setSelectedSkuIndex(index)} className={`min-w-56 rounded-lg border p-3 text-left transition-colors lg:min-w-0 ${selectedSkuIndex === index ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><Logo id={route?.provider_slug ?? "unknown"} width={20} height={20} className="size-5 shrink-0 rounded-sm" /><div className="truncate text-sm font-medium">{route?.provider_slug ?? tPricing("provider")}</div></div><span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">v{draft.version}</span></div><div className="mt-2 truncate text-xs font-medium">{draft.display_name || draft.sku_code}</div><div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{draft.operation} · {draft.service_tier_slug}</div><div className="mt-2 flex items-start gap-1 border-t pt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300"><GitBranch className="mt-0.5 h-3 w-3 shrink-0" /><span className="line-clamp-2">{pricingConditionLabel(draft.metadata)}</span></div><div className="mt-1 text-[11px] font-medium text-foreground/75">{formatOfferWindow(draft.effective_from, draft.effective_to)}</div></button>; })}</div>
				{!matchingSkuIndexes.length ? <p className="p-3 text-center text-xs text-muted-foreground">{tPricing("noMatchingOffers")}</p> : null}
			</aside>
			<div className="min-w-0">
		{drafts.map((draft, skuIndex) => {
			if (skuIndex !== selectedSkuIndex) return null;
			const route = routes.find((item) => item.provider_model_id === draft.provider_model_id);
			const tierOptions = source.serviceTiers.some((tier) => tier.service_tier_slug === draft.service_tier_slug)
				? source.serviceTiers
				: [{ service_tier_slug: draft.service_tier_slug, display_name: `${draft.service_tier_slug} (legacy)`, status: "disabled" }, ...source.serviceTiers];
			const operationOptions = [...new Set([
				...PRICING_OPERATION_OPTIONS,
				...source.capabilities.filter((capability) => capability.provider_model_id === draft.provider_model_id && capability.capability_id.includes(".")).map((capability) => capability.capability_id),
				draft.operation,
			].filter(Boolean))];
			const regionOptions = source.regions.filter((region) => region.provider_slug === route?.provider_slug);
			const currentRegionIsKnown = !draft.region || regionOptions.some((region) => region.region_code === draft.region);
			const key = draft.sku_id ?? `new-${skuIndex}`;
			const conditions = pricingConditions(draft.metadata);
			return <section key={key} className="space-y-5 overflow-hidden rounded-xl border bg-background p-3 sm:p-5">
				<div className="flex min-w-0 items-start justify-between gap-2 border-b pb-4"><div className="flex min-w-0 items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/30"><Logo id={route?.provider_slug ?? "unknown"} width={24} height={24} className="size-6" /></div><div className="min-w-0"><div className="truncate font-medium">{route?.provider_slug ?? tPricing("provider")} · {draft.display_name || draft.sku_code}</div><div className="truncate font-mono text-[11px] text-muted-foreground sm:text-xs">{draft.provider_model_id}</div><div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{tPricing("skuLabel")} {draft.sku_code}</div></div></div><Button aria-label={tPricing("deleteSku")} className="shrink-0" type="button" variant="ghost" size="icon" disabled={busyKey === key} onClick={() => void remove(skuIndex)}><Trash2 className="h-4 w-4" /></Button></div>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
					<label className="text-xs sm:col-span-2 xl:col-span-1">{tPricing("providerRoute")}<Select value={draft.provider_model_id} onValueChange={(value) => updateSku(skuIndex, { provider_model_id: value })}><SelectTrigger className="mt-1 h-10 w-full rounded-md sm:h-9"><SelectValue /></SelectTrigger><SelectContent>{routes.map((item) => <SelectItem key={item.provider_model_id} value={item.provider_model_id}>{item.provider_slug} / {item.provider_model_slug}</SelectItem>)}</SelectContent></Select></label>
					<label className="text-xs">{tPricing("offerLabel")}<Input className="mt-1" value={draft.display_name} onChange={(e) => updateSku(skuIndex, { display_name: e.target.value })} /><span className="mt-1 block text-[10px] text-muted-foreground">{tPricing("offerLabelDescription")}</span></label>
					<label className="text-xs">{tPricing("serviceTier")}<Select value={draft.service_tier_slug} onValueChange={(value) => updateSku(skuIndex, { service_tier_slug: value })}><SelectTrigger className="mt-1 h-10 w-full rounded-md sm:h-9"><SelectValue /></SelectTrigger><SelectContent>{tierOptions.map((tier) => <SelectItem key={tier.service_tier_slug} value={tier.service_tier_slug} disabled={tier.status === "disabled"}>{tier.display_name}</SelectItem>)}</SelectContent></Select></label>
					<label className="text-xs">{tPricing("operation")}<Select value={draft.operation} onValueChange={(value) => updateSku(skuIndex, { operation: value })}><SelectTrigger className="mt-1 h-10 w-full rounded-md sm:h-9"><SelectValue /></SelectTrigger><SelectContent>{operationOptions.map((operation) => <SelectItem key={operation} value={operation}>{operation}</SelectItem>)}</SelectContent></Select></label>
					<label className="text-xs">{tPricing("version")}<Input className="mt-1" type="number" min="1" value={draft.version} onChange={(e) => updateSku(skuIndex, { version: e.target.value })} /></label>
					<label className="text-xs">{tPricing("currency")}<Input className="mt-1" maxLength={3} value={draft.currency} onChange={(e) => updateSku(skuIndex, { currency: e.target.value.toUpperCase() })} /></label>
					<label className="text-xs">{tPricing("region")}<Select value={draft.region || "global"} onValueChange={(value) => updateSku(skuIndex, { region: value === "global" ? "" : value })}><SelectTrigger className="mt-1 h-10 w-full rounded-md sm:h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="global">{tUi("status.global")}</SelectItem>{!currentRegionIsKnown ? <SelectItem value={draft.region}>{draft.region}</SelectItem> : null}{regionOptions.filter((region) => region.region_code !== "global").map((region) => <SelectItem key={region.region_code} value={region.region_code}>{region.display_name || region.region_code}</SelectItem>)}</SelectContent></Select></label>
					<label className="text-xs">{tPricing("lifecycle")}<Select value={draft.status} onValueChange={(value) => updateSku(skuIndex, { status: value as SkuDraft["status"] })}><SelectTrigger className="mt-1 h-10 w-full rounded-md sm:h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">{tUi("status.active")}</SelectItem><SelectItem value="deprecated">{tUi("status.deprecated")}</SelectItem><SelectItem value="disabled">{tUi("status.disabled")}</SelectItem>{draft.status === "draft" ? <SelectItem value="draft" disabled>{tUi("status.draftLegacy")}</SelectItem> : null}</SelectContent></Select><span className="mt-1 block text-[10px] text-muted-foreground">{tPricing("dateStateLabel")} {tPricing(offerDateState(draft) === "scheduled" ? "offerStates.scheduled" : offerDateState(draft) === "expired" ? "offerStates.expired" : "offerStates.current")}</span></label>
					<label className="text-xs">{tPricing("effectiveFrom")}<Input className="mt-1" type="datetime-local" value={draft.effective_from} onChange={(e) => updateSku(skuIndex, { effective_from: e.target.value })} /></label>
					<label className="text-xs">{tPricing("effectiveTo")}<Input className="mt-1" type="datetime-local" value={draft.effective_to} onChange={(e) => updateSku(skuIndex, { effective_to: e.target.value })} /></label>
				</div>
					<div className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 sm:p-4">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-medium"><GitBranch className="h-4 w-4 text-amber-600" />{tPricing("appliesWhen")}</div><p className="mt-1 text-xs text-muted-foreground">{tPricing("conditionDescription")}</p></div><Button type="button" size="sm" variant="outline" onClick={() => updateConditions(skuIndex, [...conditions, { path: "input_tokens", op: "gte", value: 272000, or_group: 1, and_index: conditions.length + 1 }])}><Plus className="mr-1 h-3.5 w-3.5" />{tPricing("addCondition")}</Button></div>
						{conditions.length ? <div className="space-y-2">{conditions.map((condition, conditionIndex) => {
							const pathOptions = CONDITION_PATH_OPTIONS.some((option) => option.value === condition.path) ? CONDITION_PATH_OPTIONS.map((option) => ({ value: option.value, label: tPricing(("conditionPaths." + option.key) as never) })) : [{ value: condition.path, label: condition.path }, ...CONDITION_PATH_OPTIONS.map((option) => ({ value: option.value, label: tPricing(("conditionPaths." + option.key) as never) }))];
							const operatorOptions = CONDITION_OPERATOR_OPTIONS.some((option) => option.value === condition.op) ? CONDITION_OPERATOR_OPTIONS.map((option) => ({ value: option.value, label: tPricing(("conditionOperators." + option.key) as never) })) : [{ value: condition.op, label: condition.op }, ...CONDITION_OPERATOR_OPTIONS.map((option) => ({ value: option.value, label: tPricing(("conditionOperators." + option.key) as never) }))];
							return <div key={`${key}-condition-${conditionIndex}`} className="grid grid-cols-1 gap-2 rounded-md border bg-background p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(120px,0.7fr)_auto]">
								<label className="text-xs">{tPricing("field")}<Select value={condition.path} onValueChange={(value) => updateConditions(skuIndex, conditions.map((row, index) => index === conditionIndex ? { ...row, path: value } : row))}><SelectTrigger className="mt-1 h-9 w-full"><SelectValue /></SelectTrigger><SelectContent>{pathOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>
								<label className="text-xs">{tPricing("comparison")}<Select value={condition.op} onValueChange={(value) => updateConditions(skuIndex, conditions.map((row, index) => index === conditionIndex ? { ...row, op: value } : row))}><SelectTrigger className="mt-1 h-9 w-full"><SelectValue /></SelectTrigger><SelectContent>{operatorOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></label>
								<label className="text-xs">{tPricing("value")}<Input className="mt-1 font-mono" type="number" inputMode="numeric" value={String(condition.value)} onChange={(event) => updateConditions(skuIndex, conditions.map((row, index) => index === conditionIndex ? { ...row, value: event.target.value === "" ? "" : Number(event.target.value) } : row))} /></label>
								<div className="flex items-end"><Button aria-label={tPricing("deleteCondition")} className="w-full sm:w-9" type="button" variant="outline" size="icon" onClick={() => updateConditions(skuIndex, conditions.filter((_, index) => index !== conditionIndex))}><Trash2 className="h-4 w-4" /><span className="ml-2 sm:hidden">{tPricing("deleteCondition")}</span></Button></div>
							</div>;
						})}</div> : <div className="rounded-md border border-dashed bg-background/60 px-3 py-4 text-center text-xs text-muted-foreground">{tPricing("allRequestsUseOffer")}</div>}
					</div>
					<div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium">{tPricing("priceMeters")}</h3><Button type="button" size="sm" variant="outline" onClick={() => updateSku(skuIndex, { meters: [...draft.meters, emptyMeter()] })}><Plus className="mr-1 h-3.5 w-3.5" />{tPricing("addMeter")}</Button></div>
					{draft.meters.map((meter, meterIndex) => <div key={`${key}-${meterIndex}`} className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3 xl:grid-cols-10">
						<label className="col-span-2 text-xs sm:col-span-1">{tPricing("meterKey")}<Select value={meter.meter_key} onValueChange={(value) => { const definition = source.meterDefinitions.find((item) => item.meter_key === value); updateMeter(skuIndex, meterIndex, definition ? { meter_key: definition.meter_key, display_label: definition.display_name, modality: definition.modality, direction: definition.direction ?? "", unit: definition.unit, unit_quantity: String(definition.default_unit_quantity) } : { meter_key: value }); }}><SelectTrigger className="mt-1 h-9 w-full rounded-md"><SelectValue /></SelectTrigger><SelectContent>{source.meterDefinitions.map((definition) => <SelectItem key={definition.meter_key} value={definition.meter_key}>{definition.display_name}</SelectItem>)}</SelectContent></Select></label>
						<label className="col-span-2 text-xs sm:col-span-1">{tPricing("label")}<Input className="mt-1" value={meter.display_label} onChange={(e) => updateMeter(skuIndex, meterIndex, { display_label: e.target.value })} placeholder={tPricing("inputTokensExample")} /></label>
						<label className="text-xs">{tPricing("modality")}<Input className="mt-1" value={meter.modality} onChange={(e) => updateMeter(skuIndex, meterIndex, { modality: e.target.value.toLowerCase() })} placeholder="text" /></label>
						<label className="text-xs">{tPricing("direction")}<Select value={meter.direction || "none"} onValueChange={(value) => updateMeter(skuIndex, meterIndex, { direction: value === "none" ? "" : value as MeterDraft["direction"] })}><SelectTrigger className="mt-1 h-9 w-full rounded-md"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{tUi("select.neither")}</SelectItem><SelectItem value="input">{tUi("select.input")}</SelectItem><SelectItem value="output">{tUi("select.output")}</SelectItem></SelectContent></Select></label>
						<label className="text-xs">{tPricing("unit")}<Input className="mt-1" value={meter.unit} onChange={(e) => updateMeter(skuIndex, meterIndex, { unit: e.target.value })} placeholder="token" /></label>
						<label className="text-xs">{tPricing("quantity")}<Input className="mt-1" type="number" value={meter.unit_quantity} onChange={(e) => updateMeter(skuIndex, meterIndex, { unit_quantity: e.target.value })} placeholder="1000000" /></label>
						<label className="col-span-2 text-xs sm:col-span-1">{tPricing("priceUsd")}<Input className="mt-1 font-mono" type="number" step="any" inputMode="decimal" value={meter.price_usd} onChange={(e) => updateMeter(skuIndex, meterIndex, { price_usd: e.target.value })} placeholder="0.00" /></label>
						<label className="text-xs">{tPricing("displayUnit")}<Input className="mt-1" value={meter.display_unit} onChange={(e) => updateMeter(skuIndex, meterIndex, { display_unit: e.target.value })} placeholder={tPricing("displayUnitExample")} /></label>
						<label className="text-xs">{tPricing("order")}<Input className="mt-1" type="number" min="0" value={meter.meter_order} onChange={(e) => updateMeter(skuIndex, meterIndex, { meter_order: e.target.value })} placeholder="100" /></label>
						<div className="col-span-2 flex items-end justify-end sm:col-span-1"><Button aria-label={tPricing("deleteMeter")} className="w-full sm:w-9" type="button" variant="outline" size="icon" disabled={draft.meters.length === 1} onClick={() => updateSku(skuIndex, { meters: draft.meters.filter((_, index) => index !== meterIndex) })}><Trash2 className="h-4 w-4" /><span className="ml-2 sm:hidden">{tPricing("deleteMeter")}</span></Button></div>
					</div>)}
				</div>
				<div className="sticky bottom-2 z-10 -mx-1 flex rounded-lg border bg-background/95 p-2 shadow-lg backdrop-blur sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"><Button className="w-full sm:w-auto" type="button" disabled={busyKey === key} onClick={() => void save(skuIndex)}><Save className="mr-2 h-4 w-4" />{busyKey === key ? tPricing("saving") : tPricing("saveSku")}</Button></div>
			</section>;
		})}
			</div>
		</div>
		</> : activeProviderRoutes.length ? <section className="rounded-xl border border-dashed p-6 text-center"><h3 className="font-medium">{tPricing("noOffersForProvider")}</h3><p className="mt-1 text-sm text-muted-foreground">{tPricing("connectedRouteDescription")}</p><Button className="mt-4" type="button" onClick={() => addOffer(activeProviderRoutes[0].provider_model_id)}><Plus className="mr-1.5 h-4 w-4" />{tPricing("addFirstOffer")}</Button></section> : null}
	</div>;
}
