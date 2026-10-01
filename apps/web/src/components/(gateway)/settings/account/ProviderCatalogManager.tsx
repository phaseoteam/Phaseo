"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAccountQueries } from "@/lib/query/invalidation";
import { AlertCircle, ChevronDown, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { providerReleaseInstant } from "@/lib/providerReleaseTime";
import { nanosToUsd, usdToNanos } from "@/lib/providerPricing";
import {
	fetchProviderCatalogAction,
	fetchProviderCatalogVersionAction,
	updateProviderCatalogAction,
	type ProviderManagedCatalog,
	type ProviderManagedCatalogModel,
} from "@/app/(dashboard)/settings/account/providers/actions";

type ProviderLink = { provider_slug: string; role: string; status: "pending" | "active"; canManageCatalog?: boolean };
type Price = ProviderManagedCatalogModel["pricing"][number] & { amountDraft?: string; quantityDraft?: string };
type EditableModel = Omit<ProviderManagedCatalogModel, "pricing"> & {
	pricing: Price[];
	capabilitiesDraft?: string;
	inputDraft?: string;
	outputDraft?: string;
};

const TIME_ZONES = ["UTC", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"];
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function browserTimeZone(): string {
	try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
	catch { return "UTC"; }
}

function validTimeZone(value: string): boolean {
	try { new Intl.DateTimeFormat("en", { timeZone: value.trim() }).format(); return Boolean(value.trim()); }
	catch { return false; }
}

function localDateTime(value: string | null, timeZone: string): string {
	if (!value || !validTimeZone(timeZone)) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
	return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function releaseInstant(value: string, timeZone: string, previous: string | null): string | null {
	if (!value) return null;
	const instant = providerReleaseInstant(value, timeZone);
	if (!instant) toast.error("That local time is invalid or repeats during a clock change. Choose another time, or select UTC.");
	return instant ?? previous;
}

function capabilitiesText(value: ProviderManagedCatalogModel["capabilities"]): string {
	return value.map((item) => item.parameters.length ? `${item.id} | ${item.parameters.join(", ")}` : item.id).join("\n");
}

function parseCapabilities(value: string): ProviderManagedCatalogModel["capabilities"] {
	return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
		const [id, parameters = ""] = line.split("|").map((part) => part.trim());
		return { id, parameters: parameters.split(",").map((part) => part.trim()).filter(Boolean) };
	});
}

function newModel(index: number): EditableModel {
	return {
		id: `provider/model-${index}`, name: "New model", description: null,
		provider_model_slug: `model-${index}`, input_modalities: ["text"], output_modalities: ["text"],
		context_length: null, max_output_tokens: null, availability: "not_ready", available_from: null,
		deprecated_at: null, shutdown_at: null, capabilities: [{ id: "chat.completions", parameters: [] }], pricing: [],
	};
}

function newPrice(direction: "input" | "output" | null): Price {
	return {
		meter_key: direction ? `${direction}_text_tokens` : "",
		modality: "text", direction, unit: "token", unit_quantity: 1_000_000,
		price_nanos: 0, display_label: direction ? `${direction[0].toUpperCase()}${direction.slice(1)}` : "Custom",
		display_unit: "1M tokens", amountDraft: "",
	};
}

function moneyLabel(price: Price): string {
	const label = price.direction === "input" ? "Input" : price.direction === "output" ? "Output" : price.display_label || "Custom meter";
	return price.conditions?.length ? `${label} (${conditionLabel(price)})` : label;
}

function conditionLabel(price: Price): string {
	return (price.conditions ?? []).map((condition) => `${condition.path} ${condition.op} ${Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value)}`).join("; ");
}

function Field({ label, htmlFor, children, className = "" }: { label: string; htmlFor: string; children: React.ReactNode; className?: string }) {
	return <div className={`space-y-2 ${className}`}><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
	return <section className="grid gap-5 border-t border-border/70 py-6 lg:grid-cols-[170px_minmax(0,1fr)]"><div><h3 className="text-sm font-medium">{title}</h3>{description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}</div><div className="min-w-0">{children}</div></section>;
}

export default function ProviderCatalogManager({ providers, onDirtyChange }: { providers: ProviderLink[]; onDirtyChange?: (dirty: boolean) => void }) {
	const queryClient = useQueryClient();
	const availableProviders = providers.filter((provider) => provider.status === "active" || provider.status === "pending");
	const manageableProviders = availableProviders.filter((provider) => provider.canManageCatalog !== false);
	const [providerSlug, setProviderSlug] = React.useState(manageableProviders[0]?.provider_slug ?? "");
	const [models, setModels] = React.useState<EditableModel[]>([]);
	const [selectedIndex, setSelectedIndex] = React.useState(0);
	const [activePanel, setActivePanel] = React.useState<"details" | "pricing" | "release">("details");
	const [showModelList, setShowModelList] = React.useState(false);
	const [source, setSource] = React.useState<ProviderManagedCatalog["source"] | null>(null);
	const [latestRun, setLatestRun] = React.useState<ProviderManagedCatalog["latest_run"]>(null);
	const browserZone = React.useSyncExternalStore(() => () => {}, browserTimeZone, () => "UTC");
	const [timeZone, setTimeZone] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(false);
	const [loadError, setLoadError] = React.useState<string | null>(null);
	const [saving, setSaving] = React.useState(false);
	const [dirty, setDirty] = React.useState(false);
	const [stale, setStale] = React.useState(false);
	React.useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
	const requestVersion = React.useRef(0);
	const chosenZone = timeZone ?? browserZone;
	const zoneValid = validTimeZone(chosenZone);
	const zone = zoneValid ? chosenZone.trim() : "UTC";
	const catalogVersion = source?.catalog_version;
	const selected = models[selectedIndex];

	async function loadCatalog(slug: string) {
		if (!slug) return;
		const request = ++requestVersion.current;
		setLoading(true);
		setLoadError(null);
		try {
			const result = await fetchProviderCatalogAction(slug);
			if (request !== requestVersion.current) return;
			setModels(result.models ?? []);
			setSelectedIndex((current) => Math.min(current, Math.max((result.models?.length ?? 1) - 1, 0)));
			setSource(result.source);
			setLatestRun(result.latest_run);
			setDirty(false);
			setStale(false);
		} catch (error) {
			if (request !== requestVersion.current) return;
			setLoadError("Could not load the catalog.");
			toast.error(error instanceof Error ? error.message : "Could not load provider catalog");
		} finally {
			if (request === requestVersion.current) setLoading(false);
		}
	}

	React.useEffect(() => {
		let active = true;
		queueMicrotask(() => { if (active) void loadCatalog(providerSlug); });
		return () => { active = false; requestVersion.current++; };
		// Provider changes are the only automatic full catalog load.
	}, [providerSlug]);

	React.useEffect(() => {
		if (!catalogVersion || !providerSlug) return;
		let cancelled = false;
		const checkVersion = async () => {
			if (document.visibilityState !== "visible") return;
			try {
				const remote = await fetchProviderCatalogVersionAction(providerSlug);
				if (!cancelled && remote.catalog_version !== catalogVersion) setStale(true);
			} catch { /* A failed check leaves the local draft untouched; saving still uses the server-side version guard. */ }
		};
		const timer = window.setInterval(() => void checkVersion(), 60_000);
		const onFocus = () => void checkVersion();
		window.addEventListener("focus", onFocus);
		return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
	}, [providerSlug, catalogVersion]);

	function editModel(patch: Partial<EditableModel>) {
		setModels((current) => current.map((model, index) => index === selectedIndex ? { ...model, ...patch } : model));
		setDirty(true);
	}

	function editPrice(priceIndex: number, patch: Partial<Price>) {
		setModels((current) => current.map((model, index) => index === selectedIndex ? {
			...model, pricing: model.pricing.map((price, pricePosition) => pricePosition === priceIndex ? { ...price, ...patch } : price),
		} : model));
		setDirty(true);
	}

	function addPrice(direction: "input" | "output" | null) {
		if (!selected) return;
		editModel({ pricing: [...selected.pricing, newPrice(direction)] });
	}

	function removePrice(priceIndex: number) {
		if (!selected) return;
		editModel({ pricing: selected.pricing.filter((_, index) => index !== priceIndex) });
	}

	function addModel() {
		setModels((current) => {
			const used = new Set(current.map((model) => model.provider_model_slug));
			let next = 1;
			while (used.has(`model-${next}`)) next += 1;
			return [...current, newModel(next)];
		});
		setSelectedIndex(models.length);
		setDirty(true);
	}

	function removeModel() {
		if (!selected || !window.confirm(`Remove ${selected.name || selected.id} from this catalog? Save to apply the change.`)) return;
		setModels((current) => current.filter((_, index) => index !== selectedIndex));
		setSelectedIndex((current) => Math.max(0, current - 1));
		setDirty(true);
	}

	async function saveCatalog() {
		if (!source || loading || saving || loadError || stale) return;
		if (!models.length) return toast.error("Add at least one model before saving.");
		if (!zoneValid) return toast.error("Enter a valid timezone before saving.");
		setSaving(true);
		try {
			const documentModels: ProviderManagedCatalogModel[] = models.map(({ pricing, capabilitiesDraft, inputDraft, outputDraft, ...model }) => ({
				...model,
				pricing: pricing.map(({ amountDraft, quantityDraft, ...price }) => {
					const amount = usdToNanos(amountDraft ?? nanosToUsd(price.price_nanos));
					const quantity = Number(quantityDraft ?? price.unit_quantity);
					if (amount === null || !Number.isFinite(quantity) || quantity <= 0) throw new Error("Enter a valid USD amount and quantity for every price.");
					return { ...price, unit_quantity: quantity, price_nanos: amount };
				}),
				capabilities: capabilitiesDraft === undefined ? model.capabilities : parseCapabilities(capabilitiesDraft),
				input_modalities: inputDraft === undefined ? model.input_modalities : inputDraft.split(",").map((value) => value.trim()).filter(Boolean),
				output_modalities: outputDraft === undefined ? model.output_modalities : outputDraft.split(",").map((value) => value.trim()).filter(Boolean),
			}));
			const result = await updateProviderCatalogAction(providerSlug, { data: documentModels }, source.catalog_version);
			await invalidateAccountQueries(queryClient);
			setModels(result.models ?? []);
			setSource(result.source);
			setLatestRun(result.latest_run);
			setDirty(false);
			setStale(false);
			toast.success("Catalog saved");
		} catch (error) {
			if (error instanceof Error && /Catalog changed|409/.test(error.message)) setStale(true);
			toast.error(error instanceof Error ? error.message : "Could not save the catalog");
		} finally { setSaving(false); }
	}

	async function switchToRemote() {
		if (!source?.catalog_url || !window.confirm("Use the remote catalog again? Unsaved edits will be discarded.")) return;
		setSaving(true);
		try {
			const result = await updateProviderCatalogAction(providerSlug, { mode: "remote" }, source.catalog_version);
			await invalidateAccountQueries(queryClient);
			setModels(result.models ?? []);
			setSource(result.source);
			setLatestRun(result.latest_run);
			setDirty(false);
			setStale(false);
			toast.success("Remote catalog restored");
		} catch (error) { toast.error(error instanceof Error ? error.message : "Could not restore the remote catalog"); }
		finally { setSaving(false); }
	}

	if (!availableProviders.length) return null;
	if (!manageableProviders.length) return <section className="rounded-xl border border-dashed border-border/80 px-5 py-6"><p className="text-sm font-medium">Catalog editing opens after provider approval</p><p className="mt-1 text-sm text-muted-foreground">Your application and catalog are in review. You’ll be able to manage models here once Phaseo approves the provider.</p></section>;
	return <section className="space-y-5">
		<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
			<div className="min-w-0"><h2 className="text-base font-semibold">Catalog</h2><p className="mt-0.5 truncate text-xs text-muted-foreground">{providerSlug}</p></div>
			<div className="flex items-center gap-2">
				{manageableProviders.length > 1 ? <select aria-label="Provider" className={selectClass} value={providerSlug} disabled={loading || saving} onChange={(event) => { if (dirty && !window.confirm("Discard unsaved changes?")) return; setSelectedIndex(0); setProviderSlug(event.target.value); }}>{manageableProviders.map((provider) => <option key={provider.provider_slug} value={provider.provider_slug}>{provider.provider_slug}</option>)}</select> : null}
				<Button type="button" variant="outline" size="sm" disabled={loading || saving} onClick={() => { if (!dirty || window.confirm("Discard unsaved changes and reload?")) void loadCatalog(providerSlug); }}><RefreshCw className="mr-1.5 size-3.5" />Reload</Button>
			</div>
		</div>
		{stale ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-amber-500 bg-amber-500/5 px-4 py-3 text-sm"><span className="flex items-center gap-2"><AlertCircle className="size-4 text-amber-600" />This catalog changed elsewhere. Your edits are still here; reload to see the latest version.</span><Button type="button" size="sm" variant="outline" onClick={() => { if (!dirty || window.confirm("Discard unsaved edits and load the latest catalog?")) void loadCatalog(providerSlug); }}>Reload latest</Button></div> : null}
		{loadError ? <p role="alert" className="py-10 text-sm text-destructive">{loadError}</p> : null}
		{!source && !loadError ? <p className="py-10 text-sm text-muted-foreground">Loading catalog…</p> : null}
		{source ? <>
			<div className="flex flex-wrap items-end justify-between gap-4 text-xs text-muted-foreground"><div>{source.management_mode === "managed" ? "Managed in Phaseo" : "Imported from a remote URL"}{latestRun ? ` · ${latestRun.review_status.replaceAll("_", " ")}` : ""}{source.last_error ? <span className="ml-2 text-amber-600">Last sync: {source.last_error}</span> : null}</div>{source.management_mode === "managed" && source.catalog_url ? <Button size="sm" variant="ghost" onClick={() => void switchToRemote()} disabled={saving}>Use remote URL</Button> : null}</div>
			<div className="flex items-center justify-between gap-3 border-y border-border/70 py-2"><button type="button" aria-expanded={showModelList} onClick={() => setShowModelList((current) => !current)} className="flex items-center gap-2 text-sm font-medium hover:text-primary">Models <span className="text-muted-foreground">{models.length}</span><ChevronDown className={`size-4 text-muted-foreground transition-transform ${showModelList ? "rotate-180" : ""}`} /></button><Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => { addModel(); setShowModelList(false); }}><Plus className="mr-1.5 size-3.5" />Add model</Button></div>
			{showModelList ? models.length ? <div className="max-h-52 divide-y divide-border/70 overflow-y-auto border-b border-border/70">{models.map((model, index) => <button key={`${index}:${model.id}`} type="button" aria-pressed={selectedIndex === index} onClick={() => { setSelectedIndex(index); setShowModelList(false); }} className={`flex w-full items-center justify-between gap-4 px-3 py-3 text-left transition-colors hover:bg-muted/30 ${selectedIndex === index ? "bg-muted/50" : ""}`}><span className="min-w-0"><span className="block truncate text-sm font-medium">{model.name || "Untitled model"}</span><span className="block truncate font-mono text-xs text-muted-foreground">{model.id}</span></span><span className="shrink-0 text-xs text-muted-foreground">{model.availability === "not_ready" ? "Not ready" : model.availability === "ready" && model.available_from ? "Scheduled" : model.availability.replaceAll("_", " ")}</span></button>)}</div> : <p className="border-b py-10 text-center text-sm text-muted-foreground">No models yet. Add one to start your catalog.</p> : null}
			{selected ? <div className="pt-2"><div className="flex items-center justify-between gap-3 pb-4"><div className="min-w-0"><h3 className="truncate text-lg font-semibold">{selected.name || "Untitled model"}</h3><p className="truncate font-mono text-xs text-muted-foreground">{selected.id}</p></div><Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={removeModel}><Trash2 className="mr-1.5 size-3.5" />Remove</Button></div>
				<div role="tablist" aria-label="Model editor" className="flex gap-6 border-b border-border/70">{(["details", "pricing", "release"] as const).map((panel) => <button key={panel} type="button" role="tab" aria-selected={activePanel === panel} onClick={() => setActivePanel(panel)} className={`-mb-px border-b-2 py-3 text-sm capitalize transition-colors ${activePanel === panel ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{panel}</button>)}</div>
				{activePanel === "details" ? <><Section title="Identity"><div className="grid gap-4 sm:grid-cols-2"><Field label="Model name" htmlFor="catalog-model-name"><Input id="catalog-model-name" value={selected.name} onChange={(event) => editModel({ name: event.target.value })} /></Field><Field label="Availability" htmlFor="catalog-model-availability"><select id="catalog-model-availability" className={selectClass} value={selected.availability} onChange={(event) => editModel({ availability: event.target.value as EditableModel["availability"] })}><option value="ready">Ready</option><option value="not_ready">Not ready</option><option value="degraded">Degraded</option><option value="deprecated">Deprecated</option><option value="retired">Retired</option></select></Field><Field label="Canonical model ID" htmlFor="catalog-model-id"><Input id="catalog-model-id" className="font-mono" value={selected.id} onChange={(event) => editModel({ id: event.target.value })} placeholder="publisher/model" /></Field><Field label="Provider model ID" htmlFor="catalog-provider-model-id"><Input id="catalog-provider-model-id" className="font-mono" value={selected.provider_model_slug} onChange={(event) => editModel({ provider_model_slug: event.target.value })} /></Field><Field label="Description" htmlFor="catalog-model-description" className="sm:col-span-2"><Textarea id="catalog-model-description" value={selected.description ?? ""} onChange={(event) => editModel({ description: event.target.value || null })} /></Field></div></Section>
				<Section title="Limits and capabilities"><div className="grid gap-4 sm:grid-cols-2"><Field label="Input modalities" htmlFor="catalog-model-input"><Input id="catalog-model-input" value={selected.inputDraft ?? selected.input_modalities.join(", ")} onChange={(event) => editModel({ inputDraft: event.target.value })} /></Field><Field label="Output modalities" htmlFor="catalog-model-output"><Input id="catalog-model-output" value={selected.outputDraft ?? selected.output_modalities.join(", ")} onChange={(event) => editModel({ outputDraft: event.target.value })} /></Field><Field label="Context length" htmlFor="catalog-model-context"><Input id="catalog-model-context" type="number" min="1" value={selected.context_length ?? ""} onChange={(event) => editModel({ context_length: event.target.value ? Number(event.target.value) : null })} /></Field><Field label="Max output tokens" htmlFor="catalog-model-output-limit"><Input id="catalog-model-output-limit" type="number" min="1" value={selected.max_output_tokens ?? ""} onChange={(event) => editModel({ max_output_tokens: event.target.value ? Number(event.target.value) : null })} /></Field><Field label="Capabilities and parameters" htmlFor="catalog-model-capabilities" className="sm:col-span-2"><Textarea id="catalog-model-capabilities" className="font-mono text-xs" value={selected.capabilitiesDraft ?? capabilitiesText(selected.capabilities)} onChange={(event) => editModel({ capabilitiesDraft: event.target.value })} placeholder="chat.completions | temperature, max_tokens" /></Field></div></Section>
				</> : null}
				{activePanel === "release" ? <Section title="Release" description="Times shown in your chosen timezone; saved in UTC."><div className="grid gap-4 sm:grid-cols-2"><Field label="Timezone" htmlFor="catalog-timezone"><Input id="catalog-timezone" list="catalog-timezones" value={chosenZone} onChange={(event) => setTimeZone(event.target.value)} aria-invalid={!zoneValid} /><datalist id="catalog-timezones">{Array.from(new Set([browserZone, ...TIME_ZONES])).map((value) => <option key={value} value={value} />)}</datalist>{!zoneValid ? <p className="text-xs text-destructive">Enter a valid timezone, such as Europe/London.</p> : null}</Field><Field label="Available from" htmlFor="catalog-model-release"><Input id="catalog-model-release" type="datetime-local" value={localDateTime(selected.available_from, zone)} onChange={(event) => editModel({ available_from: releaseInstant(event.target.value, zone, selected.available_from) })} />{selected.available_from ? <p className="text-xs text-muted-foreground">{new Date(selected.available_from).toLocaleString("en-GB", { timeZone: zone })} · {selected.available_from} UTC</p> : null}</Field><Field label="Deprecated at" htmlFor="catalog-model-deprecated"><Input id="catalog-model-deprecated" type="datetime-local" value={localDateTime(selected.deprecated_at, zone)} onChange={(event) => editModel({ deprecated_at: releaseInstant(event.target.value, zone, selected.deprecated_at) })} /></Field><Field label="Shutdown at" htmlFor="catalog-model-shutdown"><Input id="catalog-model-shutdown" type="datetime-local" value={localDateTime(selected.shutdown_at, zone)} onChange={(event) => editModel({ shutdown_at: releaseInstant(event.target.value, zone, selected.shutdown_at) })} /></Field></div></Section> : null}
				{activePanel === "pricing" ? <Section title="Pricing" description="Enter prices in USD. Meter details are available for custom billing units."><div className="space-y-6">{selected.pricing.map((price, priceIndex) => <div key={priceIndex} className="border-b border-border/70 pb-5 last:border-0 last:pb-0"><div className="mb-3 flex items-center justify-between gap-3"><h4 className="text-sm font-medium">{moneyLabel(price)} <span className="font-normal text-muted-foreground">· per {price.display_unit || `${price.unit_quantity} ${price.unit}s`}</span></h4><Button type="button" variant="ghost" size="sm" onClick={() => removePrice(priceIndex)} aria-label={`Remove ${moneyLabel(price)} price`}><Trash2 className="size-3.5" /></Button></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Price in USD" htmlFor={`price-amount-${priceIndex}`}><div className="relative"><span className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">$</span><Input id={`price-amount-${priceIndex}`} className="pl-7 tabular-nums" inputMode="decimal" value={price.amountDraft ?? nanosToUsd(price.price_nanos)} onChange={(event) => editPrice(priceIndex, { amountDraft: event.target.value })} placeholder="0.10" /></div></Field><Field label="Meter" htmlFor={`price-meter-${priceIndex}`}><Input id={`price-meter-${priceIndex}`} className="font-mono" value={price.meter_key} onChange={(event) => editPrice(priceIndex, { meter_key: event.target.value })} placeholder="input_text_tokens" /></Field></div><details className="group mt-3"><summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Meter details</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Direction" htmlFor={`price-direction-${priceIndex}`}><select id={`price-direction-${priceIndex}`} className={selectClass} value={price.direction ?? ""} onChange={(event) => editPrice(priceIndex, { direction: event.target.value || null })}><option value="">Other</option><option value="input">Input</option><option value="output">Output</option></select></Field><Field label="Modality" htmlFor={`price-modality-${priceIndex}`}><Input id={`price-modality-${priceIndex}`} value={price.modality} onChange={(event) => editPrice(priceIndex, { modality: event.target.value })} /></Field><Field label="Unit" htmlFor={`price-unit-${priceIndex}`}><Input id={`price-unit-${priceIndex}`} value={price.unit} onChange={(event) => editPrice(priceIndex, { unit: event.target.value })} /></Field><Field label="Quantity per price" htmlFor={`price-quantity-${priceIndex}`}><Input id={`price-quantity-${priceIndex}`} type="number" min="0.000001" value={price.quantityDraft ?? String(price.unit_quantity)} onChange={(event) => editPrice(priceIndex, { quantityDraft: event.target.value })} /></Field><Field label="Display name" htmlFor={`price-label-${priceIndex}`}><Input id={`price-label-${priceIndex}`} value={price.display_label} onChange={(event) => editPrice(priceIndex, { display_label: event.target.value })} /></Field><Field label="Display unit" htmlFor={`price-display-unit-${priceIndex}`}><Input id={`price-display-unit-${priceIndex}`} value={price.display_unit} onChange={(event) => editPrice(priceIndex, { display_unit: event.target.value })} /></Field></div></details></div>)}<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={() => addPrice("input")}><Plus className="mr-1 size-3.5" />Input price</Button><Button type="button" variant="outline" size="sm" onClick={() => addPrice("output")}><Plus className="mr-1 size-3.5" />Output price</Button><Button type="button" variant="ghost" size="sm" onClick={() => addPrice(null)}>Custom meter</Button></div></div></Section> : null}
			</div> : null}
			<div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur-sm"><span className="text-xs text-muted-foreground">{stale ? "Reload before saving" : dirty ? "Unsaved changes" : "Saved"}</span><Button type="button" disabled={loading || saving || !dirty || stale} onClick={() => void saveCatalog()}><Save className="mr-1.5 size-3.5" />{saving ? "Saving…" : "Save catalog"}</Button></div>
		</> : null}
	</section>;
}
