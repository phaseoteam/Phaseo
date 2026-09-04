"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { fetchAdminModelEditorSource, fetchAdminModelFormOptions, saveAdminModelAliases, saveAdminModelNotice } from "@/lib/fetchers/internal/adminModelEditorClient";
import BasicTab from "@/components/(data)/model/edit/tabs/BasicTab";
import DetailsTab from "@/components/(data)/model/edit/tabs/DetailsTab";
import BenchmarksTab from "@/components/(data)/model/edit/tabs/BenchmarksTab";
import SubscriptionPlansTab, {
	type SubscriptionPlanModelPayload,
} from "@/components/(data)/model/edit/tabs/SubscriptionPlansTab";
import ProvidersTab, {
	type ProviderCapabilityRow,
	type ProviderModelRow,
} from "@/components/(data)/model/edit/tabs/ProvidersTab";
import { updateModel } from "@/app/(dashboard)/models/actions";
import { revalidateSingleModelDataAction } from "@/app/(dashboard)/internal/data/actions";
import V2PricingEditor from "./V2PricingEditor";

type ModelData = {
	model_id: string;
	name: string | null;
	organisation_id: string | null;
	hidden: boolean;
	license: string | null;
	status: string | null;
	announcement_date: string | null;
	release_date: string | null;
	deprecation_date: string | null;
	retirement_date: string | null;
	input_types: string | null;
	output_types: string | null;
	previous_model_id: string | null;
	family_id: string | null;
};

const SECTION_ORDER = [
	"basic",
	"identity",
	"details",
	"notice",
	"benchmarks",
	"plans",
	"providers",
	"pricing",
] as const;

type EditorSection = (typeof SECTION_ORDER)[number];

const SECTION_META: Record<
	EditorSection,
	{ label: string; description: string; saveLabel: string }
> = {
	basic: {
		label: "Basic",
		description: "Edit core model fields and lifecycle metadata.",
		saveLabel: "Save Basic",
	},
	identity: {
		label: "Identity",
		description: "Manage stable aliases and inspect model lineage.",
		saveLabel: "Save Identity",
	},
	details: {
		label: "Details",
		description: "Edit detail rows and model links.",
		saveLabel: "Save Details",
	},
	notice: {
		label: "Notice",
		description: "Publish an informational, warning, or critical notice on the model page.",
		saveLabel: "Save Notice",
	},
	benchmarks: {
		label: "Benchmarks",
		description: "Edit benchmark scores and source data.",
		saveLabel: "Save Benchmarks",
	},
	plans: {
		label: "Plans",
		description: "Attach or detach subscription plans for this model.",
		saveLabel: "Save Plans",
	},
	providers: {
		label: "Providers",
		description: "Edit provider mappings, capability status, and params.",
		saveLabel: "Save Providers",
	},
	pricing: {
		label: "Pricing",
		description: "Edit pricing rules for provider-model capabilities.",
		saveLabel: "Save Pricing",
	},
};

function normalizeSection(value: string | undefined): EditorSection {
	if (!value) return "basic";
	const normalized = value.trim().toLowerCase();

	const map: Record<string, EditorSection> = {
		overview: "basic",
		identity: "identity",
		aliases: "identity",
		lineage: "identity",
		family: "basic",
		timeline: "basic",
		quickstart: "providers",
		performance: "providers",
		basic: "basic",
		details: "details",
		notice: "notice",
		notices: "notice",
		benchmarks: "benchmarks",
		plans: "plans",
		providers: "providers",
		pricing: "pricing",
	};

	return map[normalized] ?? "basic";
}

type DetailsRow = {
	id?: string;
	detail_name: string;
	detail_value: string;
};

type LinkRow = {
	id?: string;
	platform: string;
	kind?: string;
	title?: string;
	url: string;
};

type BenchmarkRow = {
	id: string;
	benchmark_id: string;
	score: string;
	is_self_reported: boolean;
	other_info: string | null;
	source_link: string | null;
	variant: string | null;
};

type ModelNotice = { tone: "info" | "warning" | "critical"; markdown: string };
type ModelAlias = { alias_slug: string; alias_type: string; enabled: boolean; effective_from: string | null; effective_to: string | null; metadata: Record<string, unknown> };
type ModelSuccessor = { model_slug: string; name: string | null; status: string };
type ModelHistoryEntry = { change_id: string; resource_type: string; action: string; created_at: string; before_state: unknown; after_state: unknown };

export default function ModelLegacyEditor({
	modelId,
	initialTab,
	focusProviderId,
}: {
	modelId: string;
	initialTab?: string;
	focusProviderId?: string;
}) {
	const activeSection = useMemo(
		() => normalizeSection(initialTab),
		[initialTab]
	);
	const [model, setModel] = useState<ModelData | null>(null);
	const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([]);
	const [detailRows, setDetailRows] = useState<DetailsRow[] | null>(null);
	const [linkRows, setLinkRows] = useState<LinkRow[] | null>(null);
	const [notice, setNotice] = useState<ModelNotice>({ tone: "info", markdown: "" });
	const [aliases, setAliases] = useState<ModelAlias[]>([]);
	const [successors, setSuccessors] = useState<ModelSuccessor[]>([]);
	const [history, setHistory] = useState<ModelHistoryEntry[]>([]);
	const [benchmarkRows, setBenchmarkRows] = useState<BenchmarkRow[] | null>(null);
	const [subscriptionPlanRows, setSubscriptionPlanRows] = useState<
		SubscriptionPlanModelPayload[] | null
	>(null);
	const [providerRows, setProviderRows] = useState<ProviderModelRow[] | null>(null);
	const [providerCapabilityRows, setProviderCapabilityRows] = useState<
		ProviderCapabilityRow[] | null
	>(null);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [savedMessage, setSavedMessage] = useState<string | null>(null);

	const fetchBasicData = useCallback(async () => {
		const [source, options] = await Promise.all([fetchAdminModelEditorSource(modelId), fetchAdminModelFormOptions()]);
		setModel(source.model as ModelData);
		setNotice((source.notice as ModelNotice | null) ?? { tone: "info", markdown: "" });
		setAliases((source.aliases as ModelAlias[] | null) ?? []);
		setSuccessors((source.successors as ModelSuccessor[] | null) ?? []);
		setHistory((source.history as ModelHistoryEntry[] | null) ?? []);
		if (options.providers) {
			setProviders(
				options.providers.map((provider: any) => ({
					id: provider.api_provider_id,
					name: provider.api_provider_name ?? provider.api_provider_id,
				}))
			);
		}
	}, [modelId]);

	useEffect(() => {
		setLoading(true);
		void fetchBasicData().finally(() => setLoading(false));
	}, [fetchBasicData]);

	const handleSaveCurrentSection = async () => {
		if (!model) return;
		setSaving(true);
		setError(null);
		setSavedMessage(null);

		const savePromise = (async () => {
			if (activeSection === "basic") {
				await updateModel({
					modelId,
					name: model.name ?? undefined,
					organisation_id: model.organisation_id,
					hidden: model.hidden,
					license: model.license,
					status: model.status,
					announcement_date: model.announcement_date,
					release_date: model.release_date,
					deprecation_date: model.deprecation_date,
					retirement_date: model.retirement_date,
					input_types: model.input_types,
					output_types: model.output_types,
					previous_model_id: model.previous_model_id,
					family_id: model.family_id,
					subscription_plan_models: subscriptionPlanRows ?? undefined,
				});
			} else if (activeSection === "identity") {
				await saveAdminModelAliases(modelId, aliases.map((alias) => ({ ...alias, alias_slug: alias.alias_slug.trim().toLowerCase() })).filter((alias) => alias.alias_slug));
				await revalidateSingleModelDataAction(modelId);
			} else if (activeSection === "details") {
				if (detailRows === null || linkRows === null) {
					throw new Error("Details are still loading. Please wait a moment and retry.");
				}

				await updateModel({
					modelId,
					model_details: detailRows
						.filter(
							(row) =>
								row.detail_name &&
								row.detail_value !== undefined &&
								row.detail_value !== null
						)
						.map((row) => ({
							id:
								typeof row.id === "string" && row.id.startsWith("new-")
									? undefined
									: row.id,
							detail_name: row.detail_name,
							detail_value: row.detail_value,
						})),
					links: linkRows
						.filter((row) => row.platform && row.url)
						.map((row) => ({
							id:
								typeof row.id === "string" && row.id.startsWith("new-")
									? undefined
									: row.id,
							platform: row.platform,
							kind: row.kind ?? row.platform,
							title: row.title,
							url: row.url,
						})),
				});
			} else if (activeSection === "notice") {
				await saveAdminModelNotice(modelId, notice.markdown.trim() ? { ...notice, markdown: notice.markdown.trim() } : null);
				await revalidateSingleModelDataAction(modelId);
			} else if (activeSection === "benchmarks") {
				if (benchmarkRows === null) {
					throw new Error("Benchmarks are still loading. Please wait a moment and retry.");
				}

				await updateModel({
					modelId,
					benchmark_results: benchmarkRows
						.filter((row) => row.benchmark_id)
						.map((row) => ({
							id:
								typeof row.id === "string" && row.id.startsWith("new-")
									? undefined
									: row.id,
							benchmark_id: row.benchmark_id,
							score: row.score,
							is_self_reported: Boolean(row.is_self_reported),
							other_info: row.other_info ?? null,
							source_link: row.source_link ?? null,
							variant: row.variant ?? null,
						})),
				});
			} else if (activeSection === "providers") {
				if (providerRows === null || providerCapabilityRows === null) {
					throw new Error("Providers are still loading. Please wait a moment and retry.");
				}

				await updateModel({
					modelId,
					provider_models: providerRows
						.filter((row) => row.provider_id)
						.map((row) => ({
							id:
								typeof row.id === "string" && row.id.startsWith("new-")
									? undefined
									: row.id,
							provider_id: row.provider_id,
							api_model_id: row.api_model_id || modelId,
							provider_model_slug: row.provider_model_slug ?? null,
							prompt_training_policy_override:
								row.prompt_training_policy_override ?? null,
							prompt_training_override_notes:
								row.prompt_training_override_notes ?? null,
							prompt_training_override_source_url:
								row.prompt_training_override_source_url ?? null,
							is_active_gateway: Boolean(row.is_active_gateway),
							input_modalities: row.input_modalities ?? null,
							output_modalities: row.output_modalities ?? null,
							quantization_scheme: row.quantization_scheme ?? null,
							context_length: row.context_length ?? null,
							max_output_tokens: row.max_output_tokens ?? null,
							effective_from: row.effective_from ?? null,
							effective_to: row.effective_to ?? null,
						})),
					provider_capabilities: providerCapabilityRows
						.filter((row) => row.provider_id && row.capability_id)
						.map((row) => ({
							provider_id: row.provider_id,
							api_model_id: row.api_model_id || modelId,
							capability_id: row.capability_id,
							status: row.status,
							effective_from: row.effective_from ?? null,
							effective_to: row.effective_to ?? null,
							params: row.params ?? {},
						})),
				});
			} else if (activeSection === "plans") {
				if (subscriptionPlanRows === null) {
					throw new Error("Subscription plans are still loading. Please wait a moment and retry.");
				}

				await updateModel({
					modelId,
					subscription_plan_models: subscriptionPlanRows,
				});
			}
		})();

		toast.promise(savePromise, {
			loading: `Saving ${SECTION_META[activeSection].label.toLowerCase()}...`,
			success: `Saved ${SECTION_META[activeSection].label.toLowerCase()}.`,
			error: (saveError) =>
				saveError instanceof Error ? saveError.message : "Failed to save.",
		});

		try {
			await savePromise;
			setSavedMessage(`Saved ${SECTION_META[activeSection].label.toLowerCase()}.`);
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : "Failed to save.");
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		);
	}

	if (!model) {
		return (
			<p className="py-8 text-center text-sm text-muted-foreground">
				Failed to load model data.
			</p>
		);
	}

	const currentSectionMeta = SECTION_META[activeSection];

	return (
		<div className="min-w-0 space-y-3 sm:space-y-4">
			<div className="rounded-lg border p-3 sm:p-4">
				<div className="text-sm font-medium">
					Editing: {currentSectionMeta.label}
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					{currentSectionMeta.description}
				</p>
				<div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap">
					{SECTION_ORDER.map((section) => (
						<Link
							key={section}
							href={{
								pathname: `/internal/data/models/edit/${modelId}`,
								query: {
									tab: section,
									...(focusProviderId ? { provider: focusProviderId } : {}),
								},
							}}
							className={`shrink-0 rounded-md border px-3 py-1.5 text-xs ${
								section === activeSection
									? "border-primary bg-primary/10 text-primary"
									: "hover:bg-muted/40"
							}`}
						>
							{SECTION_META[section].label}
						</Link>
					))}
				</div>
			</div>

			<section className="min-w-0 space-y-3 rounded-lg border p-2 sm:p-4">
				{activeSection === "basic" ? (
					<BasicTab
						model={model as any}
						onModelChange={(next) => setModel(next as ModelData)}
					/>
				) : null}
				{activeSection === "identity" ? (
					<div className="space-y-5">
						<section className="rounded-lg border p-4"><div className="text-sm font-semibold">Canonical identity</div><div className="mt-3 font-mono text-sm">{modelId}</div><p className="mt-1 text-xs text-muted-foreground">The canonical ID is immutable in-place. Add an alias for a new public ID; destructive renames require a migration.</p></section>
						<section className="rounded-lg border p-4"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">Aliases</div><p className="text-xs text-muted-foreground">Alternative IDs resolve to this canonical model.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setAliases((rows) => [...rows, { alias_slug: "", alias_type: "public", enabled: true, effective_from: null, effective_to: null, metadata: {} }])}><Plus className="mr-1 h-4 w-4" />Add alias</Button></div><div className="mt-3 space-y-2">{aliases.map((alias, index) => <div key={`${alias.alias_slug}-${index}`} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_160px_auto_auto]"><Input aria-label="Alias ID" className="font-mono" value={alias.alias_slug} placeholder="openai/model-latest" onChange={(event) => setAliases((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, alias_slug: event.target.value } : row))} /><Input aria-label="Alias type" value={alias.alias_type} placeholder="public" onChange={(event) => setAliases((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, alias_type: event.target.value } : row))} /><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={alias.enabled} onChange={(event) => setAliases((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, enabled: event.target.checked } : row))} />Enabled</label><Button aria-label="Remove alias" type="button" variant="ghost" size="icon" onClick={() => setAliases((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}{!aliases.length ? <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No aliases</div> : null}</div></section>
						<section className="rounded-lg border p-4"><div className="text-sm font-semibold">Lineage</div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><div className="text-xs text-muted-foreground">Previous model</div><div className="mt-1 font-mono text-sm">{model.previous_model_id || "None"}</div></div><div><div className="text-xs text-muted-foreground">Successors</div><div className="mt-1 space-y-1">{successors.map((successor) => <Link className="block font-mono text-sm text-primary hover:underline" key={successor.model_slug} href={`/internal/data/models/edit/${successor.model_slug}?tab=identity`}>{successor.model_slug}</Link>)}{!successors.length ? <span className="text-sm text-muted-foreground">None</span> : null}</div></div></div></section>
						<section className="rounded-lg border p-4"><div className="text-sm font-semibold">Recent changes</div><div className="mt-3 divide-y rounded-md border">{history.map((entry) => <details key={entry.change_id} className="p-3"><summary className="cursor-pointer text-sm"><span className="font-medium">{entry.action}</span> · {entry.resource_type} <span className="text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</span></summary><pre className="mt-3 max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify({ before: entry.before_state, after: entry.after_state }, null, 2)}</pre></details>)}{!history.length ? <div className="p-4 text-center text-xs text-muted-foreground">No recorded changes</div> : null}</div></section>
					</div>
				) : null}
				{activeSection === "details" ? (
					<DetailsTab
						modelId={modelId}
						model={model as any}
						onModelChange={(next) => setModel(next as ModelData)}
						onDetailsChange={(rows) => setDetailRows(rows)}
						onLinksChange={(rows) => setLinkRows(rows)}
					/>
				) : null}
				{activeSection === "notice" ? (
					<div className="space-y-4">
						<label className="block text-sm font-medium">Tone
							<select className="mt-1 block h-10 w-full rounded-md border bg-background px-3 text-sm sm:max-w-xs" value={notice.tone} onChange={(event) => setNotice((current) => ({ ...current, tone: event.target.value as ModelNotice["tone"] }))}>
								<option value="info">Information</option>
								<option value="warning">Warning</option>
								<option value="critical">Critical</option>
							</select>
						</label>
						<label className="block text-sm font-medium">Notice markdown
							<Textarea className="mt-1 min-h-48 font-mono text-sm" value={notice.markdown} onChange={(event) => setNotice((current) => ({ ...current, markdown: event.target.value }))} placeholder="Leave empty to remove the model-page notice." />
						</label>
						<div className="rounded-md border bg-muted/20 p-3 text-sm"><div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</div><div className="whitespace-pre-wrap">{notice.markdown || "No notice will be shown."}</div></div>
					</div>
				) : null}
				{activeSection === "benchmarks" ? (
					<BenchmarksTab
						modelId={modelId}
						onBenchmarksChange={(rows) => setBenchmarkRows(rows)}
					/>
				) : null}
				{activeSection === "plans" ? (
					<SubscriptionPlansTab
						modelId={modelId}
						onSubscriptionPlanModelsChange={(rows) =>
							setSubscriptionPlanRows(rows)
						}
					/>
				) : null}
				{activeSection === "providers" ? (
					<ProvidersTab
						modelId={modelId}
						providers={providers}
						focusProviderId={focusProviderId}
						onProviderModelsChange={(rows) => setProviderRows(rows)}
						onProviderCapabilitiesChange={(rows) =>
							setProviderCapabilityRows(rows)
						}
					/>
				) : null}
				{activeSection === "pricing" ? (
					<V2PricingEditor modelId={modelId} focusProviderId={focusProviderId} />
				) : null}
			</section>

			{error ? (
				<div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
					{error}
				</div>
			) : null}
			{savedMessage ? (
				<div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-700">
					{savedMessage}
				</div>
			) : null}

			{activeSection !== "pricing" ? <div className="flex justify-end pt-2">
				<Button onClick={handleSaveCurrentSection} disabled={saving}>
					{saving ? "Saving..." : currentSectionMeta.saveLabel}
				</Button>
			</div> : null}
		</div>
	);
}
