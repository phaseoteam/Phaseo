"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import BasicTab from "@/components/(data)/model/edit/tabs/BasicTab";
import DetailsTab from "@/components/(data)/model/edit/tabs/DetailsTab";
import BenchmarksTab from "@/components/(data)/model/edit/tabs/BenchmarksTab";
import PricingTab from "@/components/(data)/model/edit/tabs/PricingTab";
import ProvidersTab, {
	type ProviderCapabilityRow,
	type ProviderModelRow,
} from "@/components/(data)/model/edit/tabs/ProvidersTab";
import { updateModel } from "@/app/(dashboard)/models/actions";

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
	"details",
	"benchmarks",
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
	details: {
		label: "Details",
		description: "Edit detail rows and model links.",
		saveLabel: "Save Details",
	},
	benchmarks: {
		label: "Benchmarks",
		description: "Edit benchmark scores and source data.",
		saveLabel: "Save Benchmarks",
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
		family: "basic",
		timeline: "basic",
		quickstart: "providers",
		performance: "providers",
		basic: "basic",
		details: "details",
		benchmarks: "benchmarks",
		providers: "providers",
		pricing: "pricing",
	};

	return map[normalized] ?? "basic";
}

function parseModelKey(modelKey: string): {
	provider_id: string;
	api_model_id: string;
	capability_id: string;
} {
	const [provider_id = "", api_model_id = "", ...rest] = modelKey.split(":");
	return {
		provider_id,
		api_model_id,
		capability_id: rest.join(":") || "text.generate",
	};
}

type DetailsRow = {
	id?: string;
	detail_name: string;
	detail_value: string;
};

type LinkRow = {
	id?: string;
	platform: string;
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

type PricingRow = {
	id: string;
	model_key: string;
	provider_id: string;
	api_model_id: string;
	capability_id: string;
	pricing_plan: string;
	meter: string;
	unit: string;
	unit_size: number;
	price_per_unit: number;
	currency: string;
	note: string | null;
	priority: number;
	effective_from: string | null;
	effective_to: string | null;
	match: Array<{
		path: string;
		op: string;
		value?: unknown;
		and_index?: number;
		or_group?: number;
		note?: string;
	}>;
};

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
	const [benchmarkRows, setBenchmarkRows] = useState<BenchmarkRow[] | null>(null);
	const [pricingRows, setPricingRows] = useState<PricingRow[] | null>(null);
	const [providerRows, setProviderRows] = useState<ProviderModelRow[] | null>(null);
	const [providerCapabilityRows, setProviderCapabilityRows] = useState<
		ProviderCapabilityRow[] | null
	>(null);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [savedMessage, setSavedMessage] = useState<string | null>(null);

	const fetchBasicData = useCallback(async () => {
		const supabase = createClient();
		const { data: modelData } = await supabase
			.from("data_models")
			.select(
				"model_id, name, organisation_id, hidden, license, status, announcement_date, release_date, deprecation_date, retirement_date, input_types, output_types, previous_model_id, family_id"
			)
			.eq("model_id", modelId)
			.single();

		const { data: providerData } = await supabase
			.from("data_api_providers")
			.select("api_provider_id, api_provider_name");

		setModel(modelData as ModelData);
		if (providerData) {
			setProviders(
				providerData.map((provider: any) => ({
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

		try {
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
				});
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
							url: row.url,
						})),
				});
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
						.filter((row) => row.provider_id && row.api_model_id)
						.map((row) => ({
							id:
								typeof row.id === "string" && row.id.startsWith("new-")
									? undefined
									: row.id,
							provider_id: row.provider_id,
							api_model_id: row.api_model_id,
							provider_model_slug: row.provider_model_slug ?? null,
							is_active_gateway: Boolean(row.is_active_gateway),
							input_modalities: row.input_modalities ?? null,
							output_modalities: row.output_modalities ?? null,
							quantization_scheme: row.quantization_scheme ?? null,
							effective_from: row.effective_from ?? null,
							effective_to: row.effective_to ?? null,
						})),
					provider_capabilities: providerCapabilityRows
						.filter(
							(row) => row.provider_id && row.api_model_id && row.capability_id
						)
						.map((row) => ({
							provider_id: row.provider_id,
							api_model_id: row.api_model_id,
							capability_id: row.capability_id,
							status: row.status,
							max_input_tokens: row.max_input_tokens ?? null,
							max_output_tokens: row.max_output_tokens ?? null,
							effective_from: row.effective_from ?? null,
							effective_to: row.effective_to ?? null,
							notes: row.notes ?? null,
							params: row.params ?? {},
						})),
				});
			} else if (activeSection === "pricing") {
				if (pricingRows === null) {
					throw new Error("Pricing rules are still loading. Please wait a moment and retry.");
				}

				await updateModel({
					modelId,
					pricing_rules: pricingRows
						.map((row) => {
							const parsed = parseModelKey(row.model_key ?? "");
							return {
								id:
									typeof row.id === "string" && row.id.startsWith("new-")
										? undefined
										: row.id,
								provider_id: row.provider_id ?? parsed.provider_id,
								api_model_id: row.api_model_id ?? parsed.api_model_id,
								capability_id: row.capability_id ?? parsed.capability_id,
								pricing_plan: row.pricing_plan ?? "standard",
								meter: row.meter,
								unit: row.unit ?? "token",
								unit_size: Number(row.unit_size ?? 1),
								price_per_unit: Number(row.price_per_unit ?? 0),
								currency: row.currency ?? "USD",
								note: row.note ?? null,
								match: Array.isArray(row.match) ? row.match : [],
								priority: Number(row.priority ?? 100),
								effective_from: row.effective_from ?? null,
								effective_to: row.effective_to ?? null,
							};
						})
						.filter((row) => row.provider_id && row.api_model_id && row.meter),
				});
			}

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
		<div className="space-y-4">
			<div className="rounded-lg border p-4">
				<div className="text-sm font-medium">
					Editing: {currentSectionMeta.label}
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					{currentSectionMeta.description}
				</p>
				<div className="mt-3 flex flex-wrap gap-2">
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
							className={`rounded-md border px-2 py-1 text-xs ${
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

			<section className="space-y-3 rounded-lg border p-4">
				{activeSection === "basic" ? (
					<BasicTab
						model={model as any}
						onModelChange={(next) => setModel(next as ModelData)}
					/>
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
				{activeSection === "benchmarks" ? (
					<BenchmarksTab
						modelId={modelId}
						onBenchmarksChange={(rows) => setBenchmarkRows(rows)}
					/>
				) : null}
				{activeSection === "providers" ? (
					<ProvidersTab
						modelId={modelId}
						model={model as any}
						providers={providers}
						focusProviderId={focusProviderId}
						onProviderModelsChange={(rows) => setProviderRows(rows)}
						onProviderCapabilitiesChange={(rows) =>
							setProviderCapabilityRows(rows)
						}
					/>
				) : null}
				{activeSection === "pricing" ? (
					<PricingTab
						modelId={modelId}
						onPricingRulesChange={(rows) => setPricingRows(rows)}
					/>
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

			<div className="flex justify-end pt-2">
				<Button onClick={handleSaveCurrentSection} disabled={saving}>
					{saving ? "Saving..." : currentSectionMeta.saveLabel}
				</Button>
			</div>
		</div>
	);
}
