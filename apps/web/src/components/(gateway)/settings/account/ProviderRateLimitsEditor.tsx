"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
	updateProviderRateLimitsAction,
	type ProviderManagedCatalogModel,
	type ProviderRateLimit,
	type ProviderRateLimits,
} from "@/app/(dashboard)/settings/account/providers/actions";

const FIELDS = [
	["requests_per_minute", "requestsPerMinute"],
	["requests_per_day", "requestsPerDay"],
	["tokens_per_minute", "tokensPerMinute"],
	["tokens_per_day", "tokensPerDay"],
] as const;
type Field = typeof FIELDS[number][0];
export type Draft = { model: string | null; values: Record<Field, string> };

export function toDrafts(limits: ProviderRateLimit[]): Draft[] {
	const drafts = limits.map((limit) => ({
		model: limit.model,
		values: Object.fromEntries(FIELDS.map(([field]) => [field, limit[field] == null ? "" : String(limit[field])])) as Record<Field, string>,
	}));
	// The provider-wide row is always shown, so a provider can add a default without extra steps.
	return drafts.some((draft) => draft.model === null) ? drafts : [{ model: null, values: { requests_per_minute: "", requests_per_day: "", tokens_per_minute: "", tokens_per_day: "" } }, ...drafts];
}

/** A whole number above zero, null for an empty field, or undefined when invalid. */
export function parseLimit(value: string): number | null | undefined {
	const text = value.trim().replace(/[,_\s]/g, "");
	if (!text) return null;
	if (!/^\d+$/.test(text)) return undefined;
	const number = Number(text);
	return number > 0 && Number.isSafeInteger(number) ? number : undefined;
}

/** The limits to save, or why the drafts cannot be saved. An empty provider-wide row is omitted. */
export function draftsToLimits(drafts: Draft[]): { limits: ProviderRateLimit[] } | { error: "invalidNumber" } | { error: "emptyModel"; model: string } {
	const limits: ProviderRateLimit[] = [];
	for (const draft of drafts) {
		const values = FIELDS.map(([field]) => parseLimit(draft.values[field]));
		if (values.some((value) => value === undefined)) return { error: "invalidNumber" };
		if (values.every((value) => value === null)) {
			if (draft.model === null) continue;
			return { error: "emptyModel", model: draft.model };
		}
		limits.push({ model: draft.model, ...Object.fromEntries(FIELDS.map(([field], index) => [field, values[index]])) } as ProviderRateLimit);
	}
	return { limits };
}

/** Upstream model ids a limit can name: every tier of every catalog model. */
function upstreamModels(models: ProviderManagedCatalogModel[]): Array<{ slug: string; label: string }> {
	const options = new Map<string, string>();
	for (const model of models) {
		const tiers = model.service_tiers?.length ? model.service_tiers : [{ service_tier: "standard", provider_model_slug: model.provider_model_slug }];
		for (const tier of tiers) {
			if (tier.provider_model_slug && !options.has(tier.provider_model_slug)) options.set(tier.provider_model_slug, tier.service_tier === "standard" ? model.name || model.id : `${model.name || model.id} · ${tier.service_tier}`);
		}
	}
	return [...options].map(([slug, label]) => ({ slug, label })).sort((left, right) => left.slug.localeCompare(right.slug));
}

export default function ProviderRateLimitsEditor({ providerSlug, rateLimits, models, managementMode, disabled = false, onSaved, onDirtyChange }: {
	providerSlug: string;
	rateLimits: ProviderRateLimits;
	models: ProviderManagedCatalogModel[];
	managementMode: "remote" | "managed";
	disabled?: boolean;
	onSaved: (rateLimits: ProviderRateLimits) => void;
	onDirtyChange?: (dirty: boolean) => void;
}) {
	const t = useTranslations("SettingsUI.providerRateLimits");
	const [drafts, setDrafts] = React.useState(() => toDrafts(rateLimits.limits));
	const [newModel, setNewModel] = React.useState("");
	const [dirty, setDirty] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [stale, setStale] = React.useState(false);
	const [issues, setIssues] = React.useState<ReadonlyArray<{ path: string; message: string }>>([]);
	React.useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
	const options = upstreamModels(models);
	const known = new Set(options.map((option) => option.slug));
	const available = options.filter((option) => !drafts.some((draft) => draft.model === option.slug));
	const locked = disabled || saving;

	function edit(index: number, field: Field, value: string) {
		setDrafts((current) => current.map((draft, position) => position === index ? { ...draft, values: { ...draft.values, [field]: value } } : draft));
		setDirty(true);
	}

	function addModel() {
		if (!newModel) return;
		setDrafts((current) => [...current, { model: newModel, values: { requests_per_minute: "", requests_per_day: "", tokens_per_minute: "", tokens_per_day: "" } }]);
		setNewModel("");
		setDirty(true);
	}

	function removeModel(index: number) {
		setDrafts((current) => current.filter((_, position) => position !== index));
		setDirty(true);
	}

	async function save() {
		const prepared = draftsToLimits(drafts);
		if ("error" in prepared) return void toast.error(prepared.error === "emptyModel" ? t("emptyModel", { model: prepared.model }) : t("invalidNumber"));
		setSaving(true);
		try {
			const result = await updateProviderRateLimitsAction(providerSlug, prepared.limits, rateLimits.version);
			if (!result.ok) {
				setIssues(result.issues);
				if (result.conflict) { setStale(true); toast.error(t("stale")); }
				return;
			}
			setIssues([]);
			setDirty(false);
			toast.success(t("saved"));
			onSaved(result.rateLimits);
		} catch {
			toast.error(t("saveFailed"));
		} finally {
			setSaving(false);
		}
	}

	function limitInputs(draft: Draft, index: number) {
		const id = `rate-limit-${draft.model ?? "all"}`;
		return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{FIELDS.map(([field, label]) => <div key={field} className="space-y-2">
			<Label htmlFor={`${id}-${field}`}>{t(label)}</Label>
			<Input id={`${id}-${field}`} inputMode="numeric" className="tabular-nums" placeholder={t("noLimit")} disabled={locked} aria-invalid={parseLimit(draft.values[field]) === undefined} value={draft.values[field]} onChange={(event) => edit(index, field, event.target.value)} />
		</div>)}</div>;
	}

	return <section aria-labelledby="provider-rate-limits-title" className="space-y-6 border-t border-border/70 pt-6">
		<div className="max-w-3xl space-y-1.5">
			<h2 id="provider-rate-limits-title" className="text-base font-semibold">{t("title")}</h2>
			<p className="text-sm text-muted-foreground">{t("description")}</p>
			<p className="text-xs text-muted-foreground">{t("applyNote")}{managementMode === "remote" ? ` ${t("feedNote")}` : ""}</p>
		</div>
		{drafts.map((draft, index) => draft.model === null ? <div key="all" className="grid gap-5 lg:grid-cols-[170px_minmax(0,1fr)]">
			<div><h3 className="text-sm font-medium">{t("allModels")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("allModelsDescription")}</p></div>
			{limitInputs(draft, index)}
		</div> : null)}
		<div className="grid gap-5 border-t border-border/70 pt-6 lg:grid-cols-[170px_minmax(0,1fr)]">
			<div><h3 className="text-sm font-medium">{t("modelLimits")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("modelLimitsDescription")}</p></div>
			<div className="min-w-0 space-y-6">
				{drafts.map((draft, index) => draft.model === null ? null : <div key={draft.model} className="space-y-3 border-b border-border/70 pb-5 last:border-0">
					<div className="flex items-center justify-between gap-3">
						<p className="min-w-0 truncate text-sm"><span className="font-mono">{draft.model}</span>{known.has(draft.model) ? null : <span className="ml-2 text-xs text-amber-600">{t("notInCatalog")}</span>}</p>
						<Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => removeModel(index)} aria-label={t("removeModel", { model: draft.model })}><Trash2 className="size-3.5" /></Button>
					</div>
					{limitInputs(draft, index)}
				</div>)}
				{available.length ? <div className="flex flex-wrap items-center gap-2">
					<Select value={newModel} onValueChange={(value) => setNewModel(typeof value === "string" ? value : "")} disabled={locked}>
						<SelectTrigger aria-label={t("chooseModel")} className="w-full sm:w-80"><SelectValue placeholder={t("chooseModel")} /></SelectTrigger>
						<SelectContent>{available.map((option) => <SelectItem key={option.slug} value={option.slug}><span className="font-mono">{option.slug}</span> <span className="text-muted-foreground">{option.label}</span></SelectItem>)}</SelectContent>
					</Select>
					<Button type="button" variant="outline" size="sm" disabled={locked || !newModel} onClick={addModel}><Plus className="mr-1.5 size-3.5" />{t("addModel")}</Button>
				</div> : null}
			</div>
		</div>
		{issues.length ? <ul role="alert" className="space-y-1 text-sm text-destructive">{issues.map((issue, index) => <li key={index}><code>{issue.path}</code>: {issue.message}</li>)}</ul> : null}
		<div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
			<span className="text-xs text-muted-foreground">{stale ? t("stale") : dirty ? t("unsaved") : null}</span>
			<Button type="button" disabled={locked || !dirty || stale} onClick={() => void save()}><Save className="mr-1.5 size-3.5" />{saving ? t("saving") : t("save")}</Button>
		</div>
	</section>;
}
