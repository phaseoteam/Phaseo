"use client";
import { useInvalidatePrivateSettings } from "../PrivateSettingsQuery";

import { useMemo, useRef, useState, useTransition } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, DollarSign, Gauge, Layers3, Loader2, Plus, ShieldCheck, Sparkles, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { updateAutoRoutingSettings } from "@/app/(dashboard)/settings/routing/actions";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import type { AutoRoutingObjective, AutoRoutingSpendProfile, SettingsAutoRoutingInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { fetchJsonQuery } from "@/lib/query/fetchers";
import { WEB_QUERY_POLICIES } from "@/lib/query/policies";
import { webQueryKeys } from "@/lib/query/queryKeys";
import { cn } from "@/lib/utils";

type ModelOption = { id: string; label: string; organisationId: string; organisationName: string; releaseDate: string | null; releaseTimestamp: number | null; providerCount: number; inputPrice: number | null; outputPrice: number | null };
const TEXT_CAPABILITIES = new Set(["responses", "chat/completions", "chat.completions", "messages", "text.generate"]);
const PATTERN_RE = /^[a-z0-9*][a-z0-9._:/*-]*$/;
const MODEL_SORT_COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const OBJECTIVES: Array<{ value: AutoRoutingObjective; label: string; description: string; icon: typeof Sparkles }> = [
	{ value: "balanced", label: "Balanced", description: "Blend quality, reliability, speed, and price.", icon: Layers3 },
	{ value: "quality", label: "Quality", description: "Weight relevant benchmark performance most heavily.", icon: Sparkles },
	{ value: "cost", label: "Cost", description: "Prefer the lowest estimated token cost inside your limit.", icon: DollarSign },
	{ value: "latency", label: "Latency", description: "Prefer models with faster recent provider response times.", icon: Zap },
];
const SPEND_PROFILES: Array<{ value: Exclude<AutoRoutingSpendProfile, "custom">; label: string; description: string; inputCap: number | null; outputCap: number | null }> = [
	{ value: "economy", label: "Economy", description: "For high-volume, cost-sensitive work.", inputCap: 0.1, outputCap: 0.5 },
	{ value: "standard", label: "Standard", description: "Balanced coverage for everyday production work.", inputCap: 0.3, outputCap: 1.5 },
	{ value: "premium", label: "Premium", description: "Broader access to higher-cost models.", inputCap: 1, outputCap: 5 },
	{ value: "unrestricted", label: "Any price", description: "No price ceiling. Workspace policy still applies.", inputCap: null, outputCap: null },
];

function fallbackModelLabel(modelId: string): string { const leaf = modelId.split("/").pop() ?? modelId; return leaf.split(/[-_]/g).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function minimum(left: number | null, right: number | null | undefined): number | null { return typeof right === "number" && Number.isFinite(right) ? Math.min(left ?? Number.POSITIVE_INFINITY, right) : left; }
function releaseTimestamp(value: string | null | undefined): number | null { const parsed = value ? Date.parse(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : null; }
function compareModelOptions(left: ModelOption, right: ModelOption): number {
	const organisationOrder = MODEL_SORT_COLLATOR.compare(left.organisationName, right.organisationName) || MODEL_SORT_COLLATOR.compare(left.organisationId, right.organisationId);
	if (organisationOrder) return organisationOrder;
	if (left.releaseTimestamp !== right.releaseTimestamp) return (right.releaseTimestamp ?? Number.NEGATIVE_INFINITY) - (left.releaseTimestamp ?? Number.NEGATIVE_INFINITY);
	return MODEL_SORT_COLLATOR.compare(left.label, right.label) || MODEL_SORT_COLLATOR.compare(left.id, right.id);
}
function buildModelOptions(models: GatewaySupportedModel[]): ModelOption[] {
	const byId = new Map<string, ModelOption>();
	for (const model of models) {
		if (!model.isAvailable || !model.capabilities.some((capability) => TEXT_CAPABILITIES.has(capability))) continue;
		const id = model.selectorModelId || model.modelId;
		if (!id || id === "phaseo/auto" || id.startsWith("@")) continue;
		const organisationId = model.organisationId?.trim() || id.split("/")[0] || "phaseo";
		const modelReleaseTimestamp = releaseTimestamp(model.releaseDate);
		const existing = byId.get(id);
		if (existing) { existing.providerCount += 1; existing.inputPrice = minimum(existing.inputPrice, model.inputPricePerMillion); existing.outputPrice = minimum(existing.outputPrice, model.outputPricePerMillion); if (modelReleaseTimestamp !== null && (existing.releaseTimestamp === null || modelReleaseTimestamp > existing.releaseTimestamp)) { existing.releaseDate = model.releaseDate; existing.releaseTimestamp = modelReleaseTimestamp; } continue; }
		byId.set(id, { id, label: model.modelName?.trim() || fallbackModelLabel(id), organisationId, organisationName: model.organisationName ?? organisationId.replaceAll("-", " "), releaseDate: model.releaseDate, releaseTimestamp: modelReleaseTimestamp, providerCount: 1, inputPrice: minimum(null, model.inputPricePerMillion), outputPrice: minimum(null, model.outputPricePerMillion) });
	}
	return [...byId.values()].toSorted(compareModelOptions);
}
function matchesPattern(modelId: string, patterns: string[]): boolean { if (!patterns.length) return true; return patterns.some((pattern) => { const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*"); return new RegExp(`^${escaped}$`, "i").test(modelId); }); }
function priceLabel(value: number | null): string { return value === null ? "No limit" : `$${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)}`; }
function configurationFingerprint(value: { allowedPatterns: string[]; spendProfile: AutoRoutingSpendProfile; maxInputPricePerMillion: number | null; maxOutputPricePerMillion: number | null; objective: AutoRoutingObjective; allowFallbacks: boolean }) { return JSON.stringify([value.allowedPatterns, value.spendProfile, value.maxInputPricePerMillion, value.maxOutputPricePerMillion, value.objective, value.allowFallbacks]); }

function EligibleModelList({ models, loading, error }: { models: ModelOption[]; loading: boolean; error: unknown }) {
	const viewportRef = useRef<HTMLDivElement>(null);
	// TanStack Virtual intentionally exposes imperative functions tied to the scroll viewport.
	// eslint-disable-next-line react-hooks/incompatible-library
	const rowVirtualizer = useVirtualizer({
		count: models.length,
		getScrollElement: () => viewportRef.current,
		estimateSize: () => 58,
		overscan: 8,
	});

	if (loading) return <div className="flex h-[360px] items-center justify-center gap-2 rounded-lg border text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading model pricing…</div>;
	if (error) return <div className="grid h-[360px] place-items-center rounded-lg border p-6 text-center text-sm text-destructive">The eligible-model list could not be loaded.</div>;
	if (!models.length) return <div className="grid h-[360px] place-items-center rounded-lg border p-6 text-center"><div><p className="text-sm font-medium">No eligible models</p><p className="mt-1 text-xs text-muted-foreground">Raise the spend ceiling or broaden the model patterns.</p></div></div>;

	return (
		<ScrollArea className="h-[360px] rounded-lg border bg-background" viewportRef={viewportRef} keepScrollbarMounted>
			<ul aria-label="Eligible models" className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
				{rowVirtualizer.getVirtualItems().map((virtualRow) => {
					const model = models[virtualRow.index];
					if (!model) return null;
					return (
						<li key={model.id} className="absolute left-0 top-0 flex h-[58px] w-full items-center gap-3 border-b px-3 last:border-b-0" style={{ transform: `translateY(${virtualRow.start}px)` }}>
							<Logo id={model.organisationId} alt={model.organisationName} width={20} height={20} className="size-5 shrink-0 object-contain" />
							<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{model.label}</p><p className="truncate font-mono text-[10px] text-muted-foreground">{model.id}</p></div>
							<div className="shrink-0 text-right"><p className="text-[11px] tabular-nums">{priceLabel(model.inputPrice)} / {priceLabel(model.outputPrice)}</p><p className="text-[10px] text-muted-foreground">input / output</p></div>
						</li>
					);
				})}
			</ul>
		</ScrollArea>
	);
}

export default function AutoRoutingSettingsClient({ initialData }: { initialData: SettingsAutoRoutingInitialData }) {
	const invalidateSettings = useInvalidatePrivateSettings();
	const initial = initialData.autoRouting;
	const [objective, setObjective] = useState<AutoRoutingObjective>(initial.objective);
	const [spendProfile, setSpendProfile] = useState<AutoRoutingSpendProfile>(initial.spendProfile);
	const [maxInputPricePerMillion, setMaxInputPricePerMillion] = useState(initial.maxInputPricePerMillion);
	const [maxOutputPricePerMillion, setMaxOutputPricePerMillion] = useState(initial.maxOutputPricePerMillion);
	const [allowedPatterns, setAllowedPatterns] = useState(initial.allowedPatterns);
	const [patternDraft, setPatternDraft] = useState("");
	const [patternError, setPatternError] = useState<string | null>(null);
	const [allowFallbacks, setAllowFallbacks] = useState(initial.allowFallbacks);
	const [savedFingerprint, setSavedFingerprint] = useState(configurationFingerprint(initial));
	const [revision, setRevision] = useState(initial.revision);
	const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
	const [advancedOpen, setAdvancedOpen] = useState(initial.allowedPatterns.length > 0 || initial.spendProfile === "custom");
	const [isPending, startTransition] = useTransition();
	const { data: modelCatalog, error: modelCatalogError, isLoading: modelCatalogLoading } = useQuery<{ models: GatewaySupportedModel[] }>({
		queryKey: webQueryKeys.public.gatewayModels(),
		queryFn: ({ signal }) => fetchJsonQuery<{ models: GatewaySupportedModel[] }>("/api/gateway/models", { signal }),
		...WEB_QUERY_POLICIES.public,
	});
	const modelOptions = useMemo(() => buildModelOptions(modelCatalog?.models ?? []), [modelCatalog?.models]);
	const selectedProfileIndex = SPEND_PROFILES.findIndex((profile) => profile.value === spendProfile);
	const selectedProfile = selectedProfileIndex >= 0 ? SPEND_PROFILES[selectedProfileIndex] : null;
	const inputCap = spendProfile === "custom" ? maxInputPricePerMillion : selectedProfile?.inputCap ?? null;
	const outputCap = spendProfile === "custom" ? maxOutputPricePerMillion : selectedProfile?.outputCap ?? null;
	const eligibleModels = useMemo(() => modelOptions.filter((model) => model.inputPrice !== null && model.outputPrice !== null && (inputCap === null || model.inputPrice <= inputCap) && (outputCap === null || model.outputPrice <= outputCap) && matchesPattern(model.id, allowedPatterns)), [allowedPatterns, inputCap, modelOptions, outputCap]);
	const current = { allowedPatterns, spendProfile, maxInputPricePerMillion, maxOutputPricePerMillion, objective, allowFallbacks };
	const dirty = configurationFingerprint(current) !== savedFingerprint;
	const validCustomLimits = spendProfile !== "custom" || (maxInputPricePerMillion !== null && maxOutputPricePerMillion !== null && maxInputPricePerMillion >= 0 && maxOutputPricePerMillion >= 0);
	const valid = validCustomLimits && (modelCatalogLoading || Boolean(modelCatalogError) || eligibleModels.length > 0);
	const canEdit = initialData.canManage && !isPending;

	function addPattern(value = patternDraft) {
		const pattern = value.trim().toLowerCase();
		if (!pattern || pattern.length > 200 || !pattern.includes("/") || !PATTERN_RE.test(pattern)) { setPatternError("Use a canonical model pattern such as anthropic/* or openai/gpt-5.*"); return; }
		if (allowedPatterns.includes(pattern)) { setPatternError("That pattern is already included."); return; }
		if (allowedPatterns.length >= 16) { setPatternError("Use no more than 16 patterns."); return; }
		setAllowedPatterns((patterns) => [...patterns, pattern]); setPatternDraft(""); setPatternError(null);
	}

	function save() {
		if (!validCustomLimits) { toast.error("Enter both custom price limits."); return; }
		if (!modelCatalogLoading && !modelCatalogError && !eligibleModels.length) { toast.error("These limits and patterns do not leave any eligible text models."); return; }
		startTransition(async () => {
			const result = await updateAutoRoutingSettings(current);
			if (!result.ok) { toast.error(result.error); return; }
			void invalidateSettings();
			const saved = result.autoRouting;
			setAllowedPatterns(saved.allowedPatterns); setSpendProfile(saved.spendProfile); setMaxInputPricePerMillion(saved.maxInputPricePerMillion); setMaxOutputPricePerMillion(saved.maxOutputPricePerMillion); setObjective(saved.objective); setAllowFallbacks(saved.allowFallbacks); setRevision(saved.revision); setUpdatedAt(saved.updatedAt); setSavedFingerprint(configurationFingerprint(saved));
			toast.success(result.gatewayCacheInvalidated ? "Auto Routing updated" : "Auto Routing updated; gateway cache refresh pending");
		});
	}

	return (
		<div className="space-y-8">
			<section>
				<div>
					<h2 className="text-base font-semibold">Optimize for</h2>
					<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Choose what the router should prioritize when it scores eligible models.</p>
				</div>
				<div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{OBJECTIVES.map((option) => { const Icon = option.icon; const selected = objective === option.value; return <button key={option.value} type="button" disabled={!canEdit} onClick={() => setObjective(option.value)} className={cn("rounded-lg border p-4 text-left transition-[border-color,background-color,box-shadow]", selected ? "border-foreground/35 bg-foreground/[0.035] shadow-xs" : "hover:border-foreground/20 hover:bg-muted/20", !canEdit && "cursor-not-allowed opacity-60")}><div className="flex items-center gap-2"><Icon className="size-4" /><span className="text-sm font-semibold">{option.label}</span>{selected ? <Check className="ml-auto size-3.5" /> : null}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{option.description}</p></button>; })}</div>
			</section>

			<section>
				<div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-base font-semibold">Spend profile</h2><p className="mt-1 text-sm text-muted-foreground">Set the generation-model price ceiling. Classification is billed as a separate gateway request.</p></div><Badge variant="outline" className="gap-1.5 px-2.5 py-1"><DollarSign className="size-3.5" />{spendProfile === "custom" ? "Custom limits" : selectedProfile?.label}</Badge></div>
				<div className="mt-4 rounded-xl bg-muted/25 px-5 pb-5 pt-6">
					<div className="px-8">
						<Slider value={selectedProfileIndex >= 0 ? [selectedProfileIndex] : []} min={0} max={SPEND_PROFILES.length - 1} step={1} disabled={!canEdit} aria-label="Spend profile" aria-valuetext={spendProfile === "custom" ? "Custom limits" : selectedProfile?.label} onValueChange={([index]) => setSpendProfile(SPEND_PROFILES[index]?.value ?? "standard")} />
						<div className="relative mt-4 h-5">{SPEND_PROFILES.map((profile, index) => <button key={profile.value} type="button" disabled={!canEdit} onClick={() => setSpendProfile(profile.value)} style={{ left: `${(index / (SPEND_PROFILES.length - 1)) * 100}%` }} className={cn("absolute -translate-x-1/2 text-[11px] font-medium whitespace-nowrap transition-colors sm:text-xs", spendProfile === profile.value ? "text-foreground" : "text-muted-foreground hover:text-foreground", !canEdit && "cursor-not-allowed")}>{profile.label}</button>)}</div>
					</div>
					<div className="mt-5 flex flex-col gap-4 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{spendProfile === "custom" ? "Custom price ceiling" : selectedProfile?.description}</p><p className="mt-1 text-xs text-muted-foreground">Input {priceLabel(inputCap)} / 1M · Output {priceLabel(outputCap)} / 1M</p></div><div className="text-left sm:text-right"><p className="text-2xl font-semibold tabular-nums">{modelCatalogLoading ? "—" : eligibleModels.length}</p><p className="text-[11px] text-muted-foreground">eligible models now</p></div></div>
					{spendProfile === "custom" ? <div className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-medium">Maximum input price / 1M tokens<Input type="number" min="0" step="0.01" value={maxInputPricePerMillion ?? ""} disabled={!canEdit} onChange={(event) => setMaxInputPricePerMillion(event.target.value === "" ? null : Number(event.target.value))} /></label><label className="space-y-1.5 text-xs font-medium">Maximum output price / 1M tokens<Input type="number" min="0" step="0.01" value={maxOutputPricePerMillion ?? ""} disabled={!canEdit} onChange={(event) => setMaxOutputPricePerMillion(event.target.value === "" ? null : Number(event.target.value))} /></label></div> : null}
					<div className="mt-4"><Button type="button" variant="link" className="h-auto px-0 text-xs" disabled={!canEdit} onClick={() => { setSpendProfile("custom"); setAdvancedOpen(true); }}>Use exact monetary limits</Button></div>
				</div>
			</section>

			<section>
				<div><h2 className="text-base font-semibold">Model access</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Phaseo considers every active text model that fits your price ceiling unless you narrow the eligible model families.</p></div>
				<div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)] lg:gap-12">
				<div>
					<div className="mt-5 flex items-start justify-between gap-4 border-t pt-5"><div className="flex gap-3"><Gauge className="mt-0.5 size-4 shrink-0" /><div><p className="text-sm font-medium">Model fallbacks</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Try the remaining ranked shortlist after retryable provider failures.</p></div></div><Switch checked={allowFallbacks} disabled={!canEdit} onCheckedChange={setAllowFallbacks} aria-label="Enable model fallbacks" /></div>
					<Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="mt-6 border-t pt-5"><CollapsibleTrigger asChild><Button type="button" variant="ghost" className="h-auto w-full justify-between px-3 py-2 text-sm font-medium"><span>Restrict eligible models <span className="font-normal text-muted-foreground">· Optional</span></span><ChevronDown className={cn("size-4 transition-transform", advancedOpen && "rotate-180")} /></Button></CollapsibleTrigger><CollapsibleContent className="pt-4"><p className="text-xs leading-5 text-muted-foreground">Patterns are inclusive. Leave this empty to let Phaseo consider every eligible model.</p><div className="mt-3 flex gap-2"><Input value={patternDraft} disabled={!canEdit} placeholder="anthropic/*" onChange={(event) => { setPatternDraft(event.target.value); setPatternError(null); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPattern(); } }} /><Button type="button" variant="outline" disabled={!canEdit || !patternDraft.trim()} onClick={() => addPattern()}><Plus className="size-4" />Add</Button></div>{patternError ? <p className="mt-2 text-xs text-destructive">{patternError}</p> : null}<div className="mt-3 flex flex-wrap gap-2">{allowedPatterns.length ? allowedPatterns.map((pattern) => <Badge key={pattern} variant="secondary" className="gap-1.5 font-mono font-normal">{pattern}<button type="button" disabled={!canEdit} onClick={() => setAllowedPatterns((patterns) => patterns.filter((item) => item !== pattern))} aria-label={`Remove ${pattern}`} className="rounded-sm text-muted-foreground hover:text-foreground"><Trash2 className="size-3" /></button></Badge>) : <span className="text-xs text-muted-foreground">All eligible model families</span>}</div>{!allowedPatterns.length ? <div className="mt-3 flex flex-wrap gap-2">{["anthropic/*", "openai/gpt-*", "google/gemini-*"].map((pattern) => <Button key={pattern} type="button" size="sm" variant="outline" className="h-7 font-mono text-[11px]" disabled={!canEdit} onClick={() => addPattern(pattern)}>{pattern}</Button>)}</div> : null}</CollapsibleContent></Collapsible>
				</div>
				<div><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">Eligible models</p><span className="text-xs text-muted-foreground">{eligibleModels.length} total</span></div><div className="mt-3"><EligibleModelList key={`${spendProfile}:${inputCap ?? "none"}:${outputCap ?? "none"}:${allowedPatterns.join(",")}`} models={eligibleModels} loading={modelCatalogLoading} error={modelCatalogError} /></div></div>
				</div>
			</section>

			<section className="grid gap-6 pt-2 lg:grid-cols-[1fr_320px] lg:items-start"><div className="text-xs leading-5 text-muted-foreground"><p>{revision ? <>Revision <span className="font-mono text-foreground">{revision.slice(0, 8)}</span></> : "Using workspace defaults"}{updatedAt ? <> · Updated {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(updatedAt))}</> : null}</p>{!initialData.canManage ? <p className="mt-1">Only workspace owners and admins can make changes.</p> : null}</div><div className="space-y-3"><div className="rounded-lg border bg-zinc-950 p-4 text-zinc-100"><div className="flex items-center gap-2 text-xs font-medium text-zinc-300"><ShieldCheck className="size-3.5" />Request contract</div><pre className="mt-3 overflow-x-auto font-mono text-[11px] leading-5 text-zinc-300"><code>{`{\n  "model": "phaseo/auto",\n  "input": "Your prompt"\n}`}</code></pre></div><Button className="w-full" onClick={save} disabled={!initialData.canManage || !dirty || !valid || isPending}>{isPending ? <Loader2 className="size-4 animate-spin" /> : null}Save configuration</Button></div></section>
		</div>
	);
}
