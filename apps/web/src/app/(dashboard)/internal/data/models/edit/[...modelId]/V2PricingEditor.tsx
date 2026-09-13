"use client";

import { useSearchParams } from "next/navigation";
import { RegionSelection, ProviderResidencySummary } from "./RegionalRoutingFields";
import { useCallback, useEffect, useMemo, useState } from "react";
import { UnsavedChangesGuard } from "@/components/(data)/UnsavedChangesGuard";
import { ArrowRight, Plus, Save, Search, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PricingChoice, PricingDate } from "./PricingFields";
import { billingUnit, formatPrice, readablePricingLabel, rebasePrice, validatePriceAmounts } from "./pricingPresentation";
import { Logo } from "@/components/Logo";
import {
	endDateAdminPricingSku,
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
	{ value: "input_tokens", label: "Input tokens" },
	{ value: "output_tokens", label: "Output tokens" },
	{ value: "total_tokens", label: "Total tokens" },
	{ value: "cache_duration_seconds", label: "Cache duration" },
	{ value: "request_count", label: "Request count" },
] as const;

const CONDITION_OPERATOR_OPTIONS = [
	{ value: "lt", label: "is less than" },
	{ value: "lte", label: "is at most" },
	{ value: "gte", label: "is at least" },
	{ value: "gt", label: "is greater than" },
	{ value: "eq", label: "equals" },
	{ value: "neq", label: "does not equal" },
] as const;

const toLocalInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const nowInput = () => toLocalInput(new Date());
const toInputDate = (value: unknown) => typeof value === "string" && value ? toLocalInput(new Date(value)) : "";
const formatOfferDate = (value: string) => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : null;
const formatOfferWindow = (from: string, to: string) => {
	const fromLabel = formatOfferDate(from);
	const toLabel = formatOfferDate(to);
	if (fromLabel && toLabel) return `${fromLabel} – ${toLabel}`;
	if (fromLabel) return `From ${fromLabel}`;
	if (toLabel) return `Until ${toLabel}`;
	return "No date window";
};

function emptyMeter(): MeterDraft {
	return { meter_key: "input_text_tokens", modality: "text", direction: "input", unit: "token", unit_quantity: "1000000", price_usd: "", display_label: "Input text tokens", display_unit: "1M tokens", billable: true, meter_order: "100", metadata: {} };
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
	if (from && from > now) return "Scheduled";
	if (to && to <= now) return "Expired";
	return "Current";
}

function formatTokenLimit(value: number | null | undefined) {
	if (!value) return "Not set";
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

function conditionLabel(condition: PricingCondition) {
	const path = CONDITION_PATH_OPTIONS.find((option) => option.value === condition.path)?.label ?? condition.path.replaceAll("_", " ");
	const operator = CONDITION_OPERATOR_OPTIONS.find((option) => option.value === condition.op)?.label ?? condition.op;
	const value = typeof condition.value === "number" && condition.path.includes("tokens") ? `${formatTokenLimit(condition.value)} tokens` : String(condition.value);
	return `${path} ${operator} ${value}`;
}

function pricingConditionLabel(metadata: Record<string, unknown>) {
	const conditions = pricingConditions(metadata);
	if (!conditions.length) return "All requests";
	const groups = new Map<number, PricingCondition[]>();
	for (const condition of conditions) {
		const key = condition.or_group ?? 1;
		groups.set(key, [...(groups.get(key) ?? []), condition]);
	}
	return [...groups.values()].map((group) => group.map(conditionLabel).join(" and ")).join(" or ");
}

function emptySku(providerModelId: string, operation = "text.generate"): SkuDraft {
	const draft = { provider_model_id: providerModelId, sku_code: "", version: "1", operation, status: "active" as const, region: "", service_tier_slug: "standard", display_name: "", description: "", currency: "USD", effective_from: nowInput(), effective_to: "", metadata: {}, meters: operation.startsWith("text.") ? [emptyMeter()] : [] };
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
			meter_key: String(meter.meter_key), modality: String(meter.modality ?? "text"), direction: meter.direction === "input" || meter.direction === "output" ? meter.direction : "", unit: String(meter.unit ?? "unit"), unit_quantity: String(meter.unit_quantity ?? 1), price_usd: String(Number(meter.price_nanos ?? 0) / 1_000_000_000), display_label: String(meter.display_label ?? meter.meter_key), display_unit: String(meter.display_unit ?? meter.unit), billable: meter.billable !== false, meter_order: String(meter.meter_order ?? 100), metadata: meter.metadata && typeof meter.metadata === "object" ? meter.metadata : {},
		})),
	};
}

function buildDrafts(source: AdminPricingEditorSource): SkuDraft[] {
	return source.skus.map((sku) => buildSkuDraft(sku, source.meters.filter((meter) => meter.sku_id === sku.sku_id)));
}

export default function V2PricingEditor({ modelId, focusProviderId }: { modelId: string; focusProviderId?: string }) {
	const [source, setSource] = useState<AdminPricingEditorSource | null>(null);
	const [drafts, setDrafts] = useState<SkuDraft[]>([]);
	const [routeDrafts, setRouteDrafts] = useState<AdminPricingEditorSource["routes"]>([]);
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [selectedSkuIndex, setSelectedSkuIndex] = useState<number | null>(null);
	const [savedDrafts, setSavedDrafts] = useState<Record<string, string>>({});
	const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
	const [endDate, setEndDate] = useState(nowInput);
	const [revisionStarts, setRevisionStarts] = useState(nowInput);
	const [showHistory, setShowHistory] = useState(false);
	const searchParams = useSearchParams();
	const [routeSettingsOpen, setRouteSettingsOpen] = useState(searchParams.get("routing") === "1");
	const [loadError, setLoadError] = useState<string | null>(null);
	const [skuQuery, setSkuQuery] = useState("");
	const [showAllProviders, setShowAllProviders] = useState(false);
	const [activeProviderSlug, setActiveProviderSlug] = useState(focusProviderId ?? "");

	const [providerModelSlug, setProviderModelSlug] = useState(modelId);
	const [addingRoute, setAddingRoute] = useState(false);
	const [stealthProvider, setStealthProvider] = useState(modelId.startsWith("stealth/"));

	const load = useCallback(async () => {
		const next = await fetchAdminPricingEditorSource(modelId);
		setSource(next);
		setDrafts(buildDrafts(next));
		setSavedDrafts(Object.fromEntries(buildDrafts(next).map((draft) => [draft.sku_id!, JSON.stringify(draft)])));
		setRouteDrafts(next.routes);
		setSelectedSkuIndex(null);
		setLoadError(null);
		setActiveProviderSlug((current) => current || focusProviderId || next.routes.find((route) => next.skus.some((sku) => sku.provider_model_id === route.provider_model_id))?.provider_slug || next.routes[0]?.provider_slug || next.providers[0]?.provider_slug || "");
	}, [focusProviderId, modelId]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- load resolves asynchronously before updating editor state.
		void load().catch((error) => setLoadError(error instanceof Error ? error.message : "Failed to load pricing"));
	}, [load]);

	const routes = useMemo(() => {
		const rows = source?.routes ?? [];
		return focusProviderId ? [...rows].sort((a, b) => Number(b.provider_slug === focusProviderId) - Number(a.provider_slug === focusProviderId)) : rows;
	}, [focusProviderId, source]);
	const activeProviderRoutes = routeDrafts.filter((route) => route.provider_slug === activeProviderSlug);
	const visibleProviders = (source?.providers ?? [])
		.filter((provider) => {
			const isConnected = routes.some((route) => route.provider_slug === provider.provider_slug);
			return showAllProviders || isConnected;
		})
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
	const updateRoute = (providerModelId: string, patch: Partial<AdminPricingEditorSource["routes"][number]>) => setRouteDrafts((rows) => rows.map((route) => {
		if (route.provider_model_id !== providerModelId) return route;
		const next = { ...route, ...patch };
		if (next.phaseo_status !== "enabled" || next.access_scope !== "public" || !["available", "preview", "limited_access"].includes(next.provider_availability_status)) next.routing_enabled = false;
		return next;
	}));
	const saveRoute = async (providerModelId: string) => {
		const route = routeDrafts.find((item) => item.provider_model_id === providerModelId);
		if (!route) return;
		setBusyKey(`route-${providerModelId}`);
		try {
			await saveAdminProviderRoute(modelId, { provider_model_id: route.provider_model_id, provider_slug: route.provider_slug, provider_model_slug: route.provider_model_slug, status: route.status, is_stealth: route.is_stealth, provider_availability_status: route.provider_availability_status, phaseo_status: route.phaseo_status, access_scope: route.access_scope, routing_enabled: route.routing_enabled, input_modalities: route.input_modalities ?? [], output_modalities: route.output_modalities ?? [], regions: route.regions ?? [], context_length: route.context_length, max_output_tokens: route.max_output_tokens, effective_from: route.effective_from, effective_to: route.effective_to, metadata: route.metadata ?? {} });
			const next = await fetchAdminPricingEditorSource(modelId);
			setSource(next);
			setRouteDrafts(next.routes);
			toast.success("Provider route saved");
		} catch (error) { toast.error(error instanceof Error ? error.message : "Provider route save failed"); }
		finally { setBusyKey(null); }
	};
	const addOffer = (providerModelId: string) => {
		const supportedOperation = source?.capabilities.find((capability) => capability.provider_model_id === providerModelId && PRICING_OPERATION_OPTIONS.includes(capability.capability_id as (typeof PRICING_OPERATION_OPTIONS)[number]))?.capability_id ?? "text.generate";
		setDrafts((rows) => [...rows, emptySku(providerModelId, supportedOperation)]);
		setSelectedSkuIndex(drafts.length);
	};
	const connectProvider = async () => {
		if (!activeProviderSlug || !providerModelSlug.trim()) return;
		setBusyKey(`provider-${activeProviderSlug}`);
		try {
			await saveAdminProviderRoute(modelId, { provider_slug: activeProviderSlug, provider_model_slug: providerModelSlug.trim(), is_stealth: stealthProvider, status: "active", provider_availability_status: "unknown", phaseo_status: "disabled", access_scope: "public", routing_enabled: false, input_modalities: [], output_modalities: [], regions: [], metadata: {} });
			const next = await fetchAdminPricingEditorSource(modelId);
			setSource(next);
			setRouteDrafts(next.routes);

			setAddingRoute(false);
			toast.success("Provider connected to model");
		} catch (error) { toast.error(error instanceof Error ? error.message : "Provider connection failed"); }
		finally { setBusyKey(null); }
	};

	const save = async (index: number) => {
		const draft = drafts[index];
		const key = draft.sku_id ?? `new-${index}`;
		setBusyKey(key);
		try {
			validatePriceAmounts(draft.meters);
			if (pricingConditions(draft.metadata).some((condition) => condition.value === "")) throw new Error("Enter a value for every condition, or remove the unused condition.");
			const metadata = { ...draft.metadata };
			const result = await saveAdminPricingSku(modelId, {
				...draft,
				metadata,
				version: Number(draft.version),
				region: draft.region || null,
				description: draft.description || null,
				effective_from: new Date(draft.sku_id ? revisionStarts : draft.effective_from).toISOString(),
				effective_to: draft.effective_to ? new Date(draft.effective_to).toISOString() : null,
				meters: draft.meters.map((meter) => ({ ...meter, direction: meter.direction || null, unit_quantity: Number(meter.unit_quantity), price_nanos: Math.round(Number(meter.price_usd) * 1_000_000_000), meter_order: Number(meter.meter_order), metadata: meter.metadata })),
			});
			await revalidateSingleModelApiInfoAction(modelId);
			const saved = result.pricing as { sku?: Record<string, any>; meters?: Array<Record<string, any>> };
			if (!saved.sku) throw new Error("The server did not return the saved price. Reload to verify before retrying.");
			const savedDraft = buildSkuDraft(saved.sku, saved.meters ?? []);
			const previous = draft.sku_id && savedDrafts[draft.sku_id] ? { ...JSON.parse(savedDrafts[draft.sku_id]) as SkuDraft, effective_to: savedDraft.effective_from } : null;
			setDrafts((rows) => [...rows.map((row, rowIndex) => rowIndex === index ? savedDraft : row), ...(previous ? [previous] : [])]);
			if (previous?.sku_id) setSavedDrafts((rows) => ({ ...rows, [previous.sku_id!]: JSON.stringify(previous) }));
			setSavedDrafts((rows) => ({ ...rows, [savedDraft.sku_id!]: JSON.stringify(savedDraft) }));
			setSelectedSkuIndex(null);
			toast.success("Pricing saved");
		} catch (error) { toast.error(error instanceof Error ? error.message : "Pricing save failed"); } finally { setBusyKey(null); }
	};

	const remove = async (index: number) => {
		const draft = drafts[index];
		if (!draft.sku_id) { setDrafts((rows) => rows.filter((_, rowIndex) => rowIndex !== index)); setSelectedSkuIndex(null); setDeleteIndex(null); return; }
		setBusyKey(draft.sku_id);
		try {
            const result = await endDateAdminPricingSku(modelId, draft.sku_id, new Date(endDate).toISOString());
            const saved = result.pricing as { sku: Record<string, any>; meters: Array<Record<string, any>> };
            const ended = buildSkuDraft(saved.sku, saved.meters);
            setDrafts((rows) => rows.map((row, rowIndex) => rowIndex === index ? ended : row));
            setSavedDrafts((rows) => ({ ...rows, [ended.sku_id!]: JSON.stringify(ended) }));
            setSelectedSkuIndex(null); setDeleteIndex(null);
            await revalidateSingleModelApiInfoAction(modelId);
            toast.success("Price group end-dated");
        } catch (error) { toast.error(error instanceof Error ? error.message : "End date failed"); }
		finally { setBusyKey(null); }
	};

		const isDirty = (draft: SkuDraft) => !draft.sku_id || savedDrafts[draft.sku_id] !== JSON.stringify(draft);
	const unsavedCount = drafts.filter(isDirty).length;

	if (loadError) return <div role="alert" className="space-y-3 rounded-lg border p-5"><p>{loadError}</p><Button variant="outline" onClick={() => void load().catch((error) => setLoadError(error.message))}>Retry loading prices</Button></div>;
	if (!source) return <p role="status" className="p-6 text-sm text-muted-foreground">Loading prices…</p>;

	const activeRouteIds = new Set(activeProviderRoutes.map((route) => route.provider_model_id));
	const providerOffers = drafts.map((draft, index) => ({ draft, index })).filter(({ draft }) => activeRouteIds.has(draft.provider_model_id));
	const matchingOffers = providerOffers.filter(({ draft }) => (showHistory || offerDateState(draft) !== "Expired") && (draft.display_name + " " + draft.operation + " " + draft.service_tier_slug + " " + pricingConditionLabel(draft.metadata)).toLowerCase().includes(skuQuery.trim().toLowerCase()));
	const draft = selectedSkuIndex === null ? null : drafts[selectedSkuIndex];
	const selectedRoute = draft ? routes.find((route) => route.provider_model_id === draft.provider_model_id) : null;
	const providerName = source.providers.find((provider) => provider.provider_slug === activeProviderSlug)?.name ?? activeProviderSlug;
	const conditions = draft ? pricingConditions(draft.metadata) : [];
	const choices = (values: readonly string[]) => values.map((value) => ({ value, label: readablePricingLabel(value) }));
	const changeDraft = (patch: Partial<SkuDraft>) => { if (selectedSkuIndex !== null) updateSku(selectedSkuIndex, patch); };
	const discardChanges = () => {
		if (selectedSkuIndex === null || !draft) return;
		const baseline = draft.sku_id ? savedDrafts[draft.sku_id] : null;
		setDrafts((rows) => baseline ? rows.map((row, index) => index === selectedSkuIndex ? JSON.parse(baseline) as SkuDraft : row) : rows.filter((_, index) => index !== selectedSkuIndex));
		if (!baseline) setSelectedSkuIndex(null);
	};
	const selectProvider = (value: string) => { setActiveProviderSlug(value); setAddingRoute(false); setSkuQuery(""); setSelectedSkuIndex(null);  };
	const addCharge = (meterKey: string) => {
		if (!draft) return;
		const definition = source.meterDefinitions.find((item) => item.meter_key === meterKey);
		if (!definition) return;
		const quantity = definition.unit === "token" ? 1_000_000 : definition.default_unit_quantity;
		changeDraft({ meters: [...draft.meters, { ...emptyMeter(), meter_key: definition.meter_key, display_label: readablePricingLabel(definition.display_name), modality: definition.modality, direction: definition.direction ?? "", unit: definition.unit, unit_quantity: String(quantity), display_unit: billingUnit(quantity, definition.unit), price_usd: "", meter_order: String((draft.meters.length + 1) * 100) }] });
	};

	return <div className="space-y-5">
		<UnsavedChangesGuard dirty={unsavedCount > 0 || JSON.stringify(routeDrafts) !== JSON.stringify(source.routes)} saving={busyKey !== null} />
		<div className="flex flex-wrap items-end justify-between gap-4">
			<div><h2 className="text-xl font-semibold">Prices by provider</h2><p className="mt-1 text-sm text-muted-foreground">Review the rates, then select a price to edit.</p></div>
			{unsavedCount > 0 ? <Badge variant="secondary">{unsavedCount} unsaved price {unsavedCount === 1 ? "group" : "groups"}</Badge> : null}
		</div>
		<div className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-end">
			<div className="min-w-0 flex-1"><PricingChoice label="Provider" value={activeProviderSlug} onChange={selectProvider}
				options={visibleProviders.map((provider) => ({ value: provider.provider_slug, label: provider.name + " · " + routes.filter((route) => route.provider_slug === provider.provider_slug).length + " routes", icon: <Logo id={provider.provider_slug} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" /> }))} /></div>
			<Button variant="outline" className="min-h-11" onClick={() => setShowAllProviders((value) => !value)}>{showAllProviders ? "Connected providers" : "Find another provider"}</Button>
			<Button variant="outline" className="min-h-11" onClick={() => setAddingRoute((value) => !value)}><Plus className="size-4" />Add route</Button>
			<Button variant="outline" className="min-h-11" disabled={!activeProviderRoutes.length} onClick={() => setRouteSettingsOpen(true)}><Settings2 className="size-4" />Routing & regions</Button>
		</div>
		{(!activeProviderRoutes.length || addingRoute) ? <div className="space-y-4 rounded-xl border border-dashed p-5"><h3 className="font-medium">Connect {providerName || "a provider"}</h3><p className="text-sm text-muted-foreground">Enter the model ID used by this provider. The new route starts with gateway routing disabled.</p><Input aria-label="Provider model ID" value={providerModelSlug} onChange={(event) => setProviderModelSlug(event.target.value)} /><div className="space-y-2"><div className="flex items-center gap-2"><Checkbox id="new-stealth-provider" checked={stealthProvider} onCheckedChange={setStealthProvider} /><Label htmlFor="new-stealth-provider">Stealth provider</Label></div><p className="text-xs text-muted-foreground">Show the provider as Stealth publicly. The real provider and upstream model ID stay private.</p></div><Button disabled={!activeProviderSlug || !providerModelSlug.trim() || busyKey !== null} onClick={() => void connectProvider()}>Connect provider</Button></div> : null}
		{activeProviderRoutes.length ? <>
			<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
				<div className="flex items-center gap-3"><Logo id={activeProviderSlug} width={28} height={28} className="size-7" /><div><h3 className="font-medium">{providerName}</h3><p className="text-xs text-muted-foreground">{providerOffers.length} price groups · {activeProviderRoutes.length} routes</p></div></div>
				<div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input aria-label="Filter prices" className="min-h-11 pl-9" placeholder="Filter by tier or condition" value={skuQuery} onChange={(event) => setSkuQuery(event.target.value)} /></div><Button className="min-h-11" onClick={() => addOffer(activeProviderRoutes[0].provider_model_id)}><Plus className="size-4" />Add prices</Button></div>
			</div>
			<div className="flex items-center gap-2"><Checkbox id="show-price-history" checked={showHistory} onCheckedChange={setShowHistory} /><Label htmlFor="show-price-history">Show ended prices</Label></div>
            <div className="space-y-3">
				{matchingOffers.map(({ draft: offer, index }) => <Button key={offer.sku_id ?? "new-" + index} variant="outline" className="h-auto w-full justify-start whitespace-normal rounded-xl p-4 text-left" onClick={() => { setRevisionStarts(nowInput()); setSelectedSkuIndex(index); }}>
					<div className="w-full min-w-0">
						<div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{source.serviceTiers.find((tier) => tier.service_tier_slug === offer.service_tier_slug)?.display_name ?? readablePricingLabel(offer.service_tier_slug)}</span><Badge variant={isDirty(offer) ? "secondary" : "outline"}>{isDirty(offer) ? "Unsaved" : offer.status === "active" ? offerDateState(offer) : readablePricingLabel(offer.status)}</Badge></div><div className="mt-1 text-xs font-normal text-muted-foreground">{operationLabel(offer.operation)} · {offer.region || "Global"} · {pricingConditionLabel(offer.metadata)}</div></div><span className="inline-flex shrink-0 items-center gap-1 text-sm">Edit <ArrowRight className="size-4" /></span></div>
						<div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t pt-3 md:grid-cols-4">
							{offer.meters.map((meter, index) => <div key={index} className="min-w-0"><div className="text-xs font-normal text-muted-foreground">{readablePricingLabel(meter.display_label || meter.meter_key)}</div><div className="mt-1 font-semibold tabular-nums">{formatPrice(meter.price_usd, offer.currency)} <span className="text-xs font-normal text-muted-foreground">/ {billingUnit(meter.unit_quantity, meter.unit)}</span></div></div>)}
						</div>
						{offer.effective_to || offerDateState(offer) === "Scheduled" ? <p className="mt-3 text-xs font-normal text-muted-foreground">{formatOfferWindow(offer.effective_from, offer.effective_to)}</p> : null}
					</div>
				</Button>)}
				{!matchingOffers.length ? <div className="rounded-xl border border-dashed py-12 text-center"><h3 className="font-medium">{providerOffers.length ? "No matching prices" : "No prices yet"}</h3><p className="mt-2 text-sm text-muted-foreground">{providerOffers.length ? "Try a different tier or clear the filter." : "Add a price group for this provider to get started."}</p></div> : null}
			</div>
		</> : null}

		<Sheet open={draft !== null && draft !== undefined} onOpenChange={(open) => { if (!open && !busyKey) setSelectedSkuIndex(null); }}>
			<SheetContent inert={busyKey !== null} className="data-[side=right]:w-full data-[side=right]:sm:max-w-2xl" showCloseButton={!busyKey}>
				{draft && selectedSkuIndex !== null ? <>
					<SheetHeader className="border-b pr-14"><SheetTitle>{draft.sku_id ? draft.effective_to ? "Price history" : "Revise prices" : "Add prices"} · {providerName}</SheetTitle><SheetDescription>{operationLabel(draft.operation)} · {pricingConditionLabel(draft.metadata)}</SheetDescription></SheetHeader>
					<fieldset disabled={busyKey !== null || Boolean(draft.sku_id && draft.effective_to)} className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5 disabled:opacity-70 [&_input]:text-base sm:[&_input]:text-sm">
						{draft.sku_id ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Version {draft.version} · {formatOfferWindow(draft.effective_from, draft.effective_to)}. {draft.effective_to ? "This version is retained for history." : "Saving creates a new version and ends the previous rates at the same time."}</p>{!draft.effective_to ? <PricingDate label="New rates start" value={revisionStarts} onChange={setRevisionStarts} /> : null}</div> : null}
                        <div className="grid gap-4 sm:grid-cols-2">
							<PricingChoice label="Service tier" value={draft.service_tier_slug} options={source.serviceTiers.map((tier) => ({ value: tier.service_tier_slug, label: tier.display_name, disabled: tier.status === "disabled" }))} onChange={(value) => changeDraft({ service_tier_slug: value })} />
							<PricingChoice label="Operation" value={draft.operation} options={choices([...new Set([...source.capabilities.filter((item) => item.provider_model_id === draft.provider_model_id).map((item) => item.capability_id), ...PRICING_OPERATION_OPTIONS])])} onChange={(value) => changeDraft({ operation: value })} />
						</div>
						<section aria-label="Charges" className="space-y-3">
							<div className="flex items-center justify-between"><h3 className="font-semibold">Charges</h3><span className="text-xs text-muted-foreground">{draft.currency} per billing unit</span></div>
							{draft.meters.map((meter, meterIndex) => <div key={meterIndex} className="space-y-3 rounded-lg border p-4">
								<div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><PricingChoice label="Charge for" value={meter.meter_key} options={source.meterDefinitions.map((item) => ({ value: item.meter_key, label: readablePricingLabel(item.display_name) }))} onChange={(value) => {
									const definition = source.meterDefinitions.find((item) => item.meter_key === value);
									if (!definition) return;
									const quantity = definition.unit === "token" ? 1_000_000 : definition.default_unit_quantity;
									updateMeter(selectedSkuIndex, meterIndex, { meter_key: value, display_label: readablePricingLabel(definition.display_name), modality: definition.modality, direction: definition.direction ?? "", unit: definition.unit, unit_quantity: String(quantity), display_unit: billingUnit(quantity, definition.unit), price_usd: "" });
								}} /></div><Button className="mt-6 min-h-11" variant="ghost" size="icon" aria-label={"Remove " + readablePricingLabel(meter.meter_key)} disabled={draft.meters.length === 1} onClick={() => changeDraft({ meters: draft.meters.filter((_, index) => index !== meterIndex) })}><Trash2 className="size-4" /></Button></div>
								<div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={"price-" + meterIndex}>Price ({draft.currency})</Label><Input id={"price-" + meterIndex} className="min-h-11 font-mono" type="number" min="0" step="any" inputMode="decimal" value={meter.price_usd} placeholder="Enter amount" onChange={(event) => updateMeter(selectedSkuIndex, meterIndex, { price_usd: event.target.value })} /></div>
									<PricingChoice label="Per" value={meter.unit_quantity} options={[...new Set([meter.unit_quantity, ...(meter.unit === "token" || meter.unit === "character" ? ["1000000", "1000", "1"] : ["1", "60", "1000"])])].map((value) => ({ value, label: billingUnit(value, meter.unit) }))} onChange={(value) => updateMeter(selectedSkuIndex, meterIndex, { unit_quantity: value, price_usd: rebasePrice(meter.price_usd, meter.unit_quantity, value), display_unit: billingUnit(value, meter.unit) })} />
								</div>
								<p className="text-xs text-muted-foreground">{formatPrice(meter.price_usd, draft.currency)} per {billingUnit(meter.unit_quantity, meter.unit)}</p>
							</div>)}
							<SearchableSelect label="Add a charge" value="" placeholder="Add a charge…" onValueChange={addCharge} options={source.meterDefinitions.filter((item) => !draft.meters.some((meter) => meter.meter_key === item.meter_key)).map((item) => ({ value: item.meter_key, label: readablePricingLabel(item.display_name) }))} />
							<p className="text-xs text-muted-foreground">Changing the billing quantity converts the amount to preserve the same rate.</p>
						</section>
						<Accordion type="multiple">
							<AccordionItem value="conditions"><AccordionTrigger>Conditions · {pricingConditionLabel(draft.metadata)}</AccordionTrigger><AccordionContent className="space-y-4 pb-4">
								<p className="text-sm text-muted-foreground">Use conditions for long-context pricing or other request-dependent rates.</p>
								{conditions.map((condition, conditionIndex) => <div className="space-y-3 rounded-lg border p-3" key={conditionIndex}>
									<div className="grid gap-3 sm:grid-cols-2"><PricingChoice label="Request field" value={condition.path} options={[...CONDITION_PATH_OPTIONS]} onChange={(value) => updateConditions(selectedSkuIndex, conditions.map((row, index) => index === conditionIndex ? { ...row, path: value } : row))} /><PricingChoice label="Comparison" value={condition.op} options={[...CONDITION_OPERATOR_OPTIONS]} onChange={(value) => updateConditions(selectedSkuIndex, conditions.map((row, index) => index === conditionIndex ? { ...row, op: value } : row))} /></div>
									<div className="flex items-end gap-2"><div className="flex-1 space-y-2"><Label htmlFor={"condition-" + conditionIndex}>Value</Label><Input id={"condition-" + conditionIndex} value={String(condition.value)} onChange={(event) => updateConditions(selectedSkuIndex, conditions.map((row, index) => index === conditionIndex ? { ...row, value: event.target.value === "" ? "" : typeof row.value === "boolean" ? event.target.value === "true" : Number.isFinite(Number(event.target.value)) ? Number(event.target.value) : event.target.value } : row))} /></div><Button variant="ghost" size="icon" aria-label="Remove condition" onClick={() => updateConditions(selectedSkuIndex, conditions.filter((_, index) => index !== conditionIndex))}><Trash2 className="size-4" /></Button></div>
								</div>)}
								<Button variant="outline" onClick={() => updateConditions(selectedSkuIndex, [...conditions, { path: "input_tokens", op: "gte", value: "", or_group: 1, and_index: conditions.length + 1 }])}><Plus className="size-4" />Add condition</Button>
							</AccordionContent></AccordionItem>
							<AccordionItem value="schedule"><AccordionTrigger>Schedule and availability · {readablePricingLabel(draft.status)}</AccordionTrigger><AccordionContent className="space-y-4 pb-4">
								<PricingChoice label="Status" value={draft.status} options={choices(["active", "deprecated", "disabled"])} onChange={(value) => changeDraft({ status: value as SkuDraft["status"] })} />
								{!draft.sku_id ? <PricingDate label="Starts" value={draft.effective_from} onChange={(value) => changeDraft({ effective_from: value })} /> : null}
								<PricingDate label="Ends" value={draft.effective_to} onChange={(value) => changeDraft({ effective_to: value })} optional />
								<p className="text-xs text-muted-foreground">Times use your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
								<PricingChoice label="Region" value={draft.region || "global"} options={[{ value: "global", label: "Global" }, ...source.regions.filter((item) => item.provider_slug === selectedRoute?.provider_slug && item.region_code !== "global").map((item) => ({ value: item.region_code, label: item.display_name || item.region_code }))]} onChange={(value) => changeDraft({ region: value === "global" ? "" : value })} />
							</AccordionContent></AccordionItem>
							<AccordionItem value="advanced"><AccordionTrigger>Advanced settings</AccordionTrigger><AccordionContent className="space-y-4 pb-4">
								<PricingChoice label="Provider route" value={draft.provider_model_id} options={activeProviderRoutes.map((route) => ({ value: route.provider_model_id, label: route.provider_model_slug + (route.is_stealth ? " (Stealth)" : "") }))} onChange={(value) => changeDraft({ provider_model_id: value })} />
								<Label>Display name<Input value={draft.display_name} onChange={(event) => changeDraft({ display_name: event.target.value })} /></Label>
								<div className="grid gap-4 sm:grid-cols-2"><PricingChoice label="Currency" value={draft.currency} options={choices(["USD", "EUR", "GBP", "CNY", "JPY", "CAD", "AUD"])} onChange={(value) => changeDraft({ currency: value })} /><p className="self-end pb-2 text-sm text-muted-foreground">Version assigned automatically</p></div>
								<p className="text-xs text-muted-foreground">Changing currency does not convert the amounts. Review every charge before saving.</p>
								{draft.meters.map((meter, index) => <div className="space-y-3 rounded-lg border p-3" key={index}><h4 className="text-sm font-medium">{readablePricingLabel(meter.meter_key)}</h4><Label>Display label<Input value={meter.display_label} onChange={(event) => updateMeter(selectedSkuIndex, index, { display_label: event.target.value })} /></Label><Label>Custom billing quantity<Input type="number" min="0" step="any" value={meter.unit_quantity} onChange={(event) => updateMeter(selectedSkuIndex, index, { unit_quantity: event.target.value, display_unit: billingUnit(event.target.value, meter.unit) })} /></Label><div className="flex items-center gap-2"><Checkbox checked={meter.billable} onCheckedChange={(checked) => updateMeter(selectedSkuIndex, index, { billable: checked })} id={"billable-" + index} /><Label htmlFor={"billable-" + index}>Billable</Label></div></div>)}
								<p className="break-all font-mono text-xs text-muted-foreground">ID: {draft.sku_code}</p>

							</AccordionContent></AccordionItem>
						</Accordion>
					</fieldset>
					<SheetFooter className="border-t p-4">
                        {draft.sku_id && offerDateState(draft) !== "Expired" ? <Button variant="outline" disabled={busyKey !== null} onClick={() => { setEndDate(nowInput()); setDeleteIndex(selectedSkuIndex); }}>End-date prices</Button> : null}
						{isDirty(draft) ? <Button variant="ghost" disabled={busyKey !== null} onClick={discardChanges}>Discard changes</Button> : null}
						<div className="flex items-center justify-between gap-3"><p role="status" className="text-xs text-muted-foreground">{isDirty(draft) ? "Unsaved changes" : "Saved to database"}</p><Button className="min-h-11" disabled={busyKey !== null || !isDirty(draft) || Boolean(draft.sku_id && draft.effective_to)} onClick={() => void save(selectedSkuIndex)}><Save className="size-4" />{busyKey ? "Saving…" : draft.sku_id ? "Save new version" : "Save prices"}</Button></div>
					</SheetFooter>
				</> : null}
			</SheetContent>
		</Sheet>

		<Sheet open={routeSettingsOpen} onOpenChange={setRouteSettingsOpen}>
			<SheetContent inert={busyKey !== null} className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
				<SheetHeader><SheetTitle>{providerName} route settings</SheetTitle><SheetDescription>Regional routing, availability and token limits.</SheetDescription></SheetHeader>
				<div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-5">{source.providers.filter((provider) => provider.provider_slug === activeProviderSlug).map((provider) => <ProviderResidencySummary key={provider.provider_slug} provider={provider} />)}{activeProviderRoutes.map((route) => <fieldset disabled={busyKey !== null} key={route.provider_model_id} className="space-y-4 border-b pb-6">
					<div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">Provider route</h3><Badge variant="outline">{route.is_stealth ? "Stealth" : "Public identity"}</Badge></div><Label className="block space-y-2">Provider model ID<Input value={route.provider_model_slug} onChange={(event) => updateRoute(route.provider_model_id, { provider_model_slug: event.target.value })} /></Label><RegionSelection label="Model availability regions" value={route.regions ?? []} options={source.regions.filter((region) => region.provider_slug === route.provider_slug)} onChange={(regions) => updateRoute(route.provider_model_id, { regions })} /><p className="text-xs text-muted-foreground">Catalog availability for this model route. Gateway residency filtering uses the provider’s regions.</p>
					<div className="grid gap-4 sm:grid-cols-2"><Label>Context length<Input type="number" min="1" value={route.context_length ?? ""} onChange={(event) => updateRoute(route.provider_model_id, { context_length: event.target.value ? Number(event.target.value) : null })} /></Label><Label>Maximum output<Input type="number" min="1" value={route.max_output_tokens ?? ""} onChange={(event) => updateRoute(route.provider_model_id, { max_output_tokens: event.target.value ? Number(event.target.value) : null })} /></Label></div>
					<PricingChoice label="Route lifecycle" value={route.status} options={choices(["active", "degraded", "disabled", "retired"])} onChange={(value) => updateRoute(route.provider_model_id, { status: value })} />
					<PricingChoice label="Provider availability" value={route.provider_availability_status} options={choices(["unknown", "coming_soon", "preview", "available", "limited_access", "deprecated", "removed"])} onChange={(value) => updateRoute(route.provider_model_id, { provider_availability_status: value as typeof route.provider_availability_status })} />
					<PricingChoice label="Phaseo status" value={route.phaseo_status} options={choices(["unsupported", "planned", "implementing", "testing", "enabled", "disabled", "blocked"])} onChange={(value) => updateRoute(route.provider_model_id, { phaseo_status: value as typeof route.phaseo_status })} />
					<div className="space-y-2"><div className="flex items-center gap-2"><Checkbox id={"stealth-" + route.provider_model_id} checked={route.is_stealth} disabled={!route.provider_model_id.startsWith("stealth:")} onCheckedChange={(checked) => updateRoute(route.provider_model_id, { is_stealth: checked })} /><Label htmlFor={"stealth-" + route.provider_model_id}>Stealth provider</Label></div><p className="text-xs text-muted-foreground">{route.provider_model_id.startsWith("stealth:") ? "When enabled, the public catalog hides the real provider and upstream model ID. Turning this off makes them public." : "This route has a public identity. Connect a new stealth provider route to keep its upstream identity private."}</p></div>
					<PricingChoice label="Access" value={route.access_scope} options={choices(["public", "internal"])} onChange={(value) => updateRoute(route.provider_model_id, { access_scope: value as typeof route.access_scope })} />
					<div className="flex items-center gap-2"><Checkbox id={"routing-" + route.provider_model_id} checked={route.routing_enabled} disabled={route.phaseo_status !== "enabled" || route.access_scope !== "public" || !["available", "preview", "limited_access"].includes(route.provider_availability_status)} onCheckedChange={(checked) => updateRoute(route.provider_model_id, { routing_enabled: checked })} /><Label htmlFor={"routing-" + route.provider_model_id}>Gateway routing enabled</Label></div>
					<Button onClick={() => void saveRoute(route.provider_model_id)} disabled={busyKey !== null}>Save route</Button>
				</fieldset>)}</div>
			</SheetContent>
		</Sheet>
		<AlertDialog open={deleteIndex !== null} onOpenChange={(open) => { if (!open) setDeleteIndex(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>End-date this price group</AlertDialogTitle><AlertDialogDescription>The rates and charges stay in history. They stop applying at the selected time.</AlertDialogDescription></AlertDialogHeader><PricingDate label="Prices end" value={endDate} onChange={setEndDate} /><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busyKey !== null || !endDate} onClick={(event) => { event.preventDefault(); if (deleteIndex !== null) void remove(deleteIndex); }}>Save end date</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
	</div>;
}
