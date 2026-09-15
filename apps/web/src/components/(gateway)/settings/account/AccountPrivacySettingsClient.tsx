"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "@/components/Logo";
import type { AccountPrivacyPolicy, SettingsAccountPrivacyInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { formatProviderOfferDisplayName, formatProviderOfferVariantLabel, resolveProviderLogoId } from "@/lib/providers/providerOffers";

type Props = Omit<SettingsAccountPrivacyInitialData, "signedIn"> & {
	workspaceId?: string | null;
	workspaceLogStorage?: {
		enabled: boolean;
		retentionDays: number;
		includeProviderPayloads: boolean;
	} | null;
};
type PrivacyModel = Props["models"][number];

const compareModelsByOrganisationAndName = (a: PrivacyModel, b: PrivacyModel) =>
	a.organisationName.localeCompare(b.organisationName, undefined, { sensitivity: "base" }) ||
	a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

function SettingRow({ title, description, checked, onCheckedChange }: { title: string; description: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
	return <div className="flex items-center justify-between gap-6 border-b border-border/60 py-4 last:border-b-0">
		<div><div className="text-sm font-medium">{title}</div><p className="mt-0.5 text-sm text-muted-foreground">{description}</p></div>
		<Switch checked={checked} onCheckedChange={onCheckedChange} />
	</div>;
}

function DebouncedSearchInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean }) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	useEffect(() => {
		if (draft === value) return;
		const timer = window.setTimeout(() => startTransition(() => onChange(draft)), 180);
		return () => window.clearTimeout(timer);
	}, [draft, onChange, value]);
	return <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} className="pl-9" disabled={disabled} /></div>;
}

export default function AccountPrivacySettingsClient({
	policy: initialPolicy,
	providers,
	models,
	workspaceId = null,
	workspaceLogStorage = null,
}: Props) {
	const [policy, setPolicy] = useState<AccountPrivacyPolicy>(() => {
		const legacy = initialPolicy as AccountPrivacyPolicy & { blockedProviderIds?: string[]; blockedApiModelIds?: string[] };
		const legacyProviders = legacy.blockedProviderIds ?? [];
		const legacyModels = legacy.blockedApiModelIds ?? [];
		return {
			...initialPolicy,
			providerRestrictionMode: initialPolicy.providerRestrictionMode ?? (legacyProviders.length ? "blocklist" : "none"),
			providerRestrictionProviderIds: initialPolicy.providerRestrictionProviderIds ?? legacyProviders,
			modelRestrictionMode: initialPolicy.modelRestrictionMode ?? (legacyModels.length ? "blocklist" : "none"),
			modelRestrictionModelIds: initialPolicy.modelRestrictionModelIds ?? legacyModels,
		};
	});
	const [query, setQuery] = useState("");
	const [routeKind, setRouteKind] = useState<"providers" | "models">("providers");
	const [availabilityKind, setAvailabilityKind] = useState<"providers" | "models">("models");
	const [availabilityState, setAvailabilityState] = useState<"all" | "available" | "unavailable">("all");
	const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "pending" | "error">("idle");
	const [logStorage, setLogStorage] = useState(workspaceLogStorage);
	const lastSavedPolicy = useRef(JSON.stringify(policy));
	const lastSavedLogStorage = useRef(JSON.stringify(workspaceLogStorage));
	useEffect(() => {
		const serialized = JSON.stringify(policy);
		if (serialized === lastSavedPolicy.current) return;
		setAutosaveStatus("saving");
		const controller = new AbortController();
		const timer = window.setTimeout(async () => {
			try {
				const response = await fetch("/api/account/settings/guardrails/global", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ ...policy, workspaceId }),
					signal: controller.signal,
				});
				if (!response.ok) throw new Error();
				const result = await response.json() as { cacheInvalidationPending?: boolean };
				lastSavedPolicy.current = serialized;
				setAutosaveStatus(result.cacheInvalidationPending ? "pending" : "saved");
			} catch {
				if (controller.signal.aborted) return;
				setAutosaveStatus("error");
				toast.error("Could not save the workspace data policy");
			}
		}, 650);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [policy, workspaceId]);
	useEffect(() => {
		if (!logStorage || !workspaceId) return;
		const serialized = JSON.stringify(logStorage);
		if (serialized === lastSavedLogStorage.current) return;
		setAutosaveStatus("saving");
		const controller = new AbortController();
		const timer = window.setTimeout(async () => {
			try {
				const response = await fetch("/api/account/settings/guardrails/global", {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						workspaceId,
						ioLoggingEnabled: logStorage.enabled,
						ioLoggingRetentionDays: logStorage.retentionDays,
						ioLoggingIncludeProviderPayloads: logStorage.includeProviderPayloads,
					}),
					signal: controller.signal,
				});
				if (!response.ok) throw new Error();
				lastSavedLogStorage.current = serialized;
				setAutosaveStatus("saved");
			} catch {
				if (controller.signal.aborted) return;
				setAutosaveStatus("error");
				toast.error("Could not save workspace log storage settings");
			}
		}, 650);
		return () => { window.clearTimeout(timer); controller.abort(); };
	}, [logStorage, workspaceId]);
	const normalized = query.trim().toLowerCase();
	const visibleProviders = useMemo(() => providers
		.filter((item) => `${item.name} ${item.id} ${item.offer_label ?? ""}`.toLowerCase().includes(normalized))
		.sort((a, b) => {
			const familyOrder = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
			if (familyOrder) return familyOrder;
			const aVariant = formatProviderOfferVariantLabel({ offerLabel: a.offer_label, offerScope: a.offer_scope as "global" | "regional" | "specialized" | null, providerId: a.id });
			const bVariant = formatProviderOfferVariantLabel({ offerLabel: b.offer_label, offerScope: b.offer_scope as "global" | "regional" | "specialized" | null, providerId: b.id });
			if (aVariant === "Standard") return -1;
			if (bVariant === "Standard") return 1;
			return aVariant.localeCompare(bVariant, undefined, { sensitivity: "base" });
		}), [normalized, providers]);
	const visibleModels = useMemo(() => models
		.filter((item) => `${item.name} ${item.organisationName}`.toLowerCase().includes(normalized))
		.sort(compareModelsByOrganisationAndName), [models, normalized]);
	const groupedModels = useMemo(() => Object.entries(Object.groupBy(visibleModels, (model) => model.organisationName))
		.sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" })), [visibleModels]);
	const toggleList = (key: "providerRestrictionProviderIds" | "modelRestrictionModelIds", id: string, checked: boolean) => setPolicy((current) => ({ ...current, [key]: checked ? [...new Set([...current[key], id])] : current[key].filter((value) => value !== id) }));
	const set = <K extends keyof AccountPrivacyPolicy>(key: K, value: AccountPrivacyPolicy[K]) => setPolicy((current) => ({ ...current, [key]: value }));
	const providerSelectionEnabled = policy.providerRestrictionMode !== "none";
	const modelSelectionEnabled = policy.modelRestrictionMode !== "none";
	const selectionLabel = (mode: "none" | "allowlist" | "blocklist", count: number) => mode === "none" ? "Allow all" : mode === "allowlist" ? `${count} allowed` : `${count} blocked`;
	const modeLabel = (mode: "none" | "allowlist" | "blocklist", subject: "providers" | "models") => mode === "none" ? `Allow all ${subject}` : mode === "allowlist" ? `Only allow selected ${subject}` : `Allow all except selected ${subject}`;
	const setOrganisation = (ids: string[], selected: boolean) => setPolicy((current) => ({ ...current, modelRestrictionModelIds: selected ? [...new Set([...current.modelRestrictionModelIds, ...ids])] : current.modelRestrictionModelIds.filter((id) => !ids.includes(id)) }));
	const routeAllowed = (candidatePolicy: AccountPrivacyPolicy, kind: "provider" | "model", id: string) => {
		const mode = kind === "provider" ? candidatePolicy.providerRestrictionMode : candidatePolicy.modelRestrictionMode;
		const ids = kind === "provider" ? candidatePolicy.providerRestrictionProviderIds : candidatePolicy.modelRestrictionModelIds;
		if (mode === "none") return true;
		const selected = ids.includes(id);
		return mode === "allowlist" ? selected : !selected;
	};
	const providerAvailability = useMemo(() => new Map(providers.map((provider) => {
		const workspaceAllowed = routeAllowed(policy, "provider", provider.id);
		const available = workspaceAllowed;
		const reason = !workspaceAllowed
			? policy.providerRestrictionMode === "allowlist" ? "Outside the workspace provider allowlist" : "Blocked by the workspace provider rule"
			: null;
		return [provider.id, { ...provider, available, reason }];
	})), [policy, providers]);
	const effectiveProviders = [...providerAvailability.values()];
	const providerCoverageGroups = useMemo(() => {
		const groups = Object.groupBy(effectiveProviders, (provider) => provider.provider_family_id || provider.id);
		return Object.entries(groups).map(([familyId, variants]) => ({
			familyId,
			name: (variants ?? []).find((variant) => variant.id === familyId)?.name ?? variants?.[0]?.name ?? familyId,
			variants: (variants ?? []).sort((a, b) => a.name.localeCompare(b.name)),
		})).sort((a, b) => a.name.localeCompare(b.name));
	}, [effectiveProviders]);
	const effectiveModels = useMemo(() => models.map((model) => {
		const workspaceAllowed = routeAllowed(policy, "model", model.id);
		const allowedByModel = workspaceAllowed;
		const providerRouteIds = model.providerIds ?? [];
		const permittedProviders = providerRouteIds.filter((id) => providerAvailability.get(id)?.available !== false);
		const hasPermittedRoute = providerRouteIds.length === 0 || permittedProviders.length > 0;
		const available = allowedByModel && hasPermittedRoute;
		const reason = !workspaceAllowed
			? policy.modelRestrictionMode === "allowlist" ? "Outside the workspace model allowlist" : "Blocked by the workspace model rule"
			: !hasPermittedRoute ? "No permitted provider routes remain" : null;
		return { ...model, available, reason };
	}).sort(compareModelsByOrganisationAndName), [models, policy, providerAvailability]);
	const availabilityItems = availabilityKind === "providers" ? effectiveProviders : effectiveModels;
	const availabilityCounts = { available: availabilityItems.filter((item) => item.available).length, unavailable: availabilityItems.filter((item) => !item.available).length };
	const visibleAvailabilityItems = availabilityItems.filter((item) => availabilityState === "all" || (availabilityState === "available") === item.available);
	const visibleProviderCoverageGroups = providerCoverageGroups.filter((group) => availabilityState === "all" || group.variants.some((variant) => (availabilityState === "available") === variant.available));
	return <div className="space-y-8">
		<section>
			<h2 className="text-base font-semibold">Data Handling</h2>
			<p className="mt-1 text-sm text-muted-foreground">Set the minimum privacy standard for every request in this workspace.</p>
			<div className="mt-3 rounded-lg border px-4">
				<SettingRow title="Allow paid routes that may train" description="Permit paid routes whose provider may use prompts or completions for training." checked={policy.privacyEnablePaidMayTrain} onCheckedChange={(value) => set("privacyEnablePaidMayTrain", value)} />
				<SettingRow title="Allow free routes that may train" description="Permit free routes whose provider may use prompts or completions for training." checked={policy.privacyEnableFreeMayTrain} onCheckedChange={(value) => set("privacyEnableFreeMayTrain", value)} />
				<SettingRow title="Allow prompt logging" description="Permit providers that may retain prompts but do not use them for training." checked={policy.privacyEnableInputOutputLogging} onCheckedChange={(value) => set("privacyEnableInputOutputLogging", value)} />
				<SettingRow title="Require zero data retention" description="Only route requests where the selected capability is eligible for ZDR." checked={policy.privacyZdrOnly} onCheckedChange={(value) => set("privacyZdrOnly", value)} />
			</div>
		</section>
		{logStorage ? <section className="border-t pt-8">
			<div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
				<div>
					<h2 className="text-base font-semibold">Gateway Log Storage</h2>
					<p className="mt-1.5 text-sm leading-6 text-muted-foreground">Control private request and response payload storage for this workspace.</p>
				</div>
				<div className="min-w-0 rounded-lg border px-4">
					<SettingRow title="Store request and response payloads" description="Keep private payload copies for request details and replay." checked={logStorage.enabled} onCheckedChange={(enabled) => setLogStorage((current) => current ? { ...current, enabled } : current)} />
					{logStorage.enabled ? <>
						<div className="flex flex-col gap-3 border-b border-border/60 py-4 sm:flex-row sm:items-center sm:justify-between">
							<div><div className="text-sm font-medium">Retention</div><p className="mt-0.5 text-sm text-muted-foreground">Choose how long private payload copies remain available.</p></div>
							<Select value={String(logStorage.retentionDays)} onValueChange={(value) => setLogStorage((current) => current ? { ...current, retentionDays: Number(value) } : current)}>
								<SelectTrigger className="w-full rounded-md sm:w-40"><SelectValue /></SelectTrigger>
								<SelectContent><SelectItem value="90">90 days</SelectItem><SelectItem value="180">180 days</SelectItem><SelectItem value="365">365 days</SelectItem></SelectContent>
							</Select>
						</div>
						<SettingRow title="Include provider payloads" description="Also retain the transformed upstream request and provider response." checked={logStorage.includeProviderPayloads} onCheckedChange={(includeProviderPayloads) => setLogStorage((current) => current ? { ...current, includeProviderPayloads } : current)} />
					</> : null}
				</div>
			</div>
		</section> : null}
		<section className="border-t pt-8">
			<div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
				<div>
					<h2 className="text-base font-semibold">Route Access</h2>
					<p className="mt-1.5 text-sm leading-6 text-muted-foreground">Control which providers and models this workspace may use. Scoped guardrails can restrict individual members and API keys further.</p>
				</div>
				<div className="min-w-0">
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2"><label className="text-sm font-medium">Provider mode</label><Select value={policy.providerRestrictionMode} onValueChange={(value) => set("providerRestrictionMode", value as AccountPrivacyPolicy["providerRestrictionMode"])}><SelectTrigger className="w-full"><SelectValue>{modeLabel(policy.providerRestrictionMode, "providers")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Allow all providers</SelectItem><SelectItem value="allowlist">Only allow selected providers</SelectItem><SelectItem value="blocklist">Allow all except selected providers</SelectItem></SelectContent></Select></div>
				<div className="space-y-2"><label className="text-sm font-medium">Model mode</label><Select value={policy.modelRestrictionMode} onValueChange={(value) => set("modelRestrictionMode", value as AccountPrivacyPolicy["modelRestrictionMode"])}><SelectTrigger className="w-full"><SelectValue>{modeLabel(policy.modelRestrictionMode, "models")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="none">Allow all models</SelectItem><SelectItem value="allowlist">Only allow selected models</SelectItem><SelectItem value="blocklist">Allow all except selected models</SelectItem></SelectContent></Select></div>
			</div>
			<div className="mt-5">
				<div role="tablist" aria-label="Route access type" className="grid grid-cols-2 border-b">
					<button type="button" role="tab" aria-selected={routeKind === "providers"} onClick={() => setRouteKind("providers")} className={`relative flex min-h-12 flex-col items-center justify-center gap-0 px-3 text-sm transition-colors sm:flex-row sm:gap-2 ${routeKind === "providers" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}><span className="font-medium">Providers</span><span className="text-xs opacity-70">{selectionLabel(policy.providerRestrictionMode, policy.providerRestrictionProviderIds.length)}</span>{routeKind === "providers" ? <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-sm bg-primary" /> : null}</button>
					<button type="button" role="tab" aria-selected={routeKind === "models"} onClick={() => setRouteKind("models")} className={`relative flex min-h-12 flex-col items-center justify-center gap-0 px-3 text-sm transition-colors sm:flex-row sm:gap-2 ${routeKind === "models" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}><span className="font-medium">Models</span><span className="text-xs opacity-70">{selectionLabel(policy.modelRestrictionMode, policy.modelRestrictionModelIds.length)}</span>{routeKind === "models" ? <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-sm bg-primary" /> : null}</button>
				</div>
				<div className="mt-3"><DebouncedSearchInput value={query} onChange={setQuery} placeholder={`Search ${routeKind}`} disabled={routeKind === "providers" ? !providerSelectionEnabled : !modelSelectionEnabled} /></div>
				<ScrollArea className="mt-2 h-80 rounded-lg border bg-background"><div className="p-2">
					{routeKind === "providers" ? providerSelectionEnabled ? <>{visibleProviders.map((provider) => { const familyId = provider.provider_family_id || provider.id; const displayName = formatProviderOfferDisplayName({ providerId: provider.id, providerName: provider.name, offerLabel: provider.offer_label, offerScope: provider.offer_scope as "global" | "regional" | "specialized" | null }); return <label key={provider.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50"><Checkbox checked={policy.providerRestrictionProviderIds.includes(provider.id)} onCheckedChange={(value) => toggleList("providerRestrictionProviderIds", provider.id, value === true)} /><Logo id={resolveProviderLogoId({ providerId: familyId, providerFamilyId: familyId })} alt="" className="size-4 object-contain" width={16} height={16} /><Link href={`/api-providers/${encodeURIComponent(provider.id)}`} onClick={(event) => event.stopPropagation()} className="min-w-0 flex-1 truncate text-sm underline-offset-4 hover:underline">{displayName}</Link></label>; })}</> : <p className="px-2 py-8 text-center text-sm text-muted-foreground">All providers are currently allowed. Change Provider mode to select routes.</p> : modelSelectionEnabled ? <>{groupedModels.map(([organisation, items]) => { const orgIds = (items ?? []).map((model) => model.id); const allSelected = orgIds.every((id) => policy.modelRestrictionModelIds.includes(id)); return <div key={organisation} className="mb-4"><div className="mb-1 flex items-center justify-between gap-3 px-2"><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Logo id={items?.[0]?.organisationId ?? ""} alt="" className="size-4 object-contain" width={16} height={16} />{organisation}</div><Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setOrganisation(orgIds, !allSelected)}>{allSelected ? "Clear all" : "Select all"}</Button></div>{(items ?? []).map((model) => <label key={model.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/50"><Checkbox checked={policy.modelRestrictionModelIds.includes(model.id)} onCheckedChange={(value) => toggleList("modelRestrictionModelIds", model.id, value === true)} /><Link href={`/models/${model.id}`} onClick={(event) => event.stopPropagation()} className="text-sm underline-offset-4 hover:underline">{model.name}</Link></label>)}</div>; })}</> : <p className="px-2 py-8 text-center text-sm text-muted-foreground">All models are currently allowed. Change Model mode to select routes.</p>}
				</div></ScrollArea>
			</div>
				</div>
			</div>
		</section>
		<section className="border-t pt-8">
			<div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
				<div>
					<h2 className="text-base font-semibold">Eligibility Preview</h2>
					<p className="mt-1.5 text-sm leading-6 text-muted-foreground">See the providers and models available after applying the current workspace settings.</p>
				</div>
				<div className="min-w-0 space-y-4">
				<div className="border-b pb-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
						<div><div className="text-sm font-medium text-muted-foreground">Effective availability</div><div className="mt-1 text-2xl font-semibold tracking-tight">{availabilityCounts.available} of {availabilityItems.length} {availabilityKind} routable</div></div>
						<div className="text-xs text-muted-foreground sm:text-right"><div>{availabilityCounts.available} passed workspace access rules</div><div>{availabilityCounts.unavailable} excluded after all checks</div></div>
					</div>
				</div>
				<div className="space-y-2">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-3"><div className="text-sm font-medium">{availabilityKind === "models" ? "Model coverage" : "Provider coverage"}</div><div className="inline-flex items-center rounded-lg border bg-background p-1"><Button type="button" variant="ghost" size="sm" className={`h-8 rounded-md px-3 ${availabilityKind === "providers" ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => setAvailabilityKind("providers")}>Providers</Button><Button type="button" variant="ghost" size="sm" className={`h-8 rounded-md px-3 ${availabilityKind === "models" ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => setAvailabilityKind("models")}>Models</Button></div></div>
						<div className="inline-flex items-center rounded-lg border bg-background p-1"><Button type="button" variant="ghost" size="sm" className={`h-8 rounded-md px-3 ${availabilityState === "all" ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => setAvailabilityState("all")}>All ({availabilityItems.length})</Button><Button type="button" variant="ghost" size="sm" className={`h-8 rounded-md px-3 ${availabilityState === "available" ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => setAvailabilityState("available")}>Available ({availabilityCounts.available})</Button><Button type="button" variant="ghost" size="sm" className={`h-8 rounded-md px-3 ${availabilityState === "unavailable" ? "bg-muted text-foreground" : "text-muted-foreground"}`} onClick={() => setAvailabilityState("unavailable")}>Unavailable ({availabilityCounts.unavailable})</Button></div>
					</div>
					{availabilityKind === "providers" && visibleProviderCoverageGroups.length ? <ScrollArea className="h-[36rem] rounded-lg border bg-background"><ul className="divide-y">{visibleProviderCoverageGroups.map((group) => <li key={group.familyId} className="flex min-h-10 items-center justify-between gap-2 px-3 py-1.5"><div className="flex min-w-0 items-center gap-2"><Logo id={resolveProviderLogoId({ providerId: group.familyId, providerFamilyId: group.familyId })} alt="" width={16} height={16} className="size-4 shrink-0 rounded-sm object-contain" /><Link href={`/api-providers/${encodeURIComponent(group.familyId)}`} className="truncate text-sm font-medium underline-offset-4 hover:underline">{group.name}</Link></div><div className="flex min-w-0 flex-wrap justify-end gap-1">{group.variants.map((variant) => <Tooltip key={variant.id}><TooltipTrigger asChild><span className={`inline-flex h-6 items-center rounded-md border px-2 text-xs ${variant.available ? "border-border bg-muted/40 text-foreground" : "border-border text-muted-foreground opacity-60"}`}>{formatProviderOfferVariantLabel({ offerLabel: variant.offer_label, offerScope: variant.offer_scope as "global" | "regional" | "specialized" | null, providerId: variant.id })}</span></TooltipTrigger><TooltipContent side="top"><div className="font-medium">{variant.name}</div><div>{variant.available ? "Available" : variant.reason}</div></TooltipContent></Tooltip>)}</div></li>)}</ul></ScrollArea> : availabilityKind === "models" && visibleAvailabilityItems.length ? <ScrollArea className="h-[36rem] rounded-lg border bg-background"><ul className="divide-y">{visibleAvailabilityItems.map((item) => {
						const isModel = availabilityKind === "models" && "providerIds" in item;
						const providerIds = isModel ? item.providerIds ?? [] : [];
						const accessibleCount = providerIds.filter((id) => providerAvailability.get(id)?.available !== false).length;
						return <li key={item.id} className="flex min-h-10 items-center justify-between gap-2 px-3 py-1.5"><div className="flex min-w-0 items-center gap-2"><Logo id={isModel ? item.organisationId ?? "" : item.id} alt="" width={16} height={16} className="size-4 shrink-0 rounded-sm object-contain" /><div className="min-w-0"><Link href={`/models/${item.id}`} className="block truncate text-sm font-medium underline-offset-4 hover:underline">{item.name}</Link>{item.reason ? <div className="truncate text-xs text-muted-foreground">{item.reason}</div> : null}</div></div><div className="flex shrink-0 items-center gap-2">{isModel ? <div className="flex items-center gap-1">{providerIds.map((providerId) => { const provider = providerAvailability.get(providerId); return <Tooltip key={`${item.id}-${providerId}`}><TooltipTrigger asChild><button type="button" aria-label={`${provider?.name ?? providerId}: ${provider?.available === false ? provider.reason : "Available"}`} className="inline-flex items-center justify-center rounded-md p-0.5 hover:bg-muted/60"><Logo id={resolveProviderLogoId({ providerId: provider?.provider_family_id || providerId, providerFamilyId: provider?.provider_family_id })} alt="" width={16} height={16} className={`size-4 rounded-sm ${provider?.available === false ? "grayscale opacity-40" : ""}`} /></button></TooltipTrigger><TooltipContent side="top" sideOffset={6}><div className="space-y-1"><div className="font-medium">{provider?.name ?? providerId}</div><div>{provider?.available === false ? provider.reason : "Available"}</div></div></TooltipContent></Tooltip>; })}</div> : null}<Badge className="h-6 rounded-md px-2" variant={isModel ? accessibleCount > 0 ? "secondary" : "outline" : item.available ? "secondary" : "outline"}>{isModel ? `${accessibleCount}/${providerIds.length}` : item.available ? "Available" : "Unavailable"}</Badge></div></li>;
					})}</ul></ScrollArea> : <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">{availabilityState === "available" ? `No ${availabilityKind} are currently available.` : availabilityState === "unavailable" ? `No ${availabilityKind} are currently unavailable.` : `No active ${availabilityKind} are available.`}</div>}
				</div>
				</div>
			</div>
		</section>
		<div className="flex min-h-8 justify-end text-sm text-muted-foreground" role="status" aria-live="polite">
			{autosaveStatus === "saving" ? <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Saving changes</span> : autosaveStatus === "saved" ? <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4" />Changes saved</span> : autosaveStatus === "pending" ? <span className="inline-flex items-center gap-2 text-amber-500"><AlertCircle className="size-4" />Saved; routing cache update pending</span> : autosaveStatus === "error" ? <span className="inline-flex items-center gap-2 text-destructive"><AlertCircle className="size-4" />Changes could not be saved</span> : <span>Changes save automatically</span>}
		</div>
	</div>;
}
