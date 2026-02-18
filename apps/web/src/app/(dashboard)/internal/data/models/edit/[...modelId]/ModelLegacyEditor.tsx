"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import BasicTab from "@/components/(data)/model/edit/tabs/BasicTab";
import DetailsTab from "@/components/(data)/model/edit/tabs/DetailsTab";
import BenchmarksTab from "@/components/(data)/model/edit/tabs/BenchmarksTab";
import PricingTab from "@/components/(data)/model/edit/tabs/PricingTab";
import ProvidersTab from "@/components/(data)/model/edit/tabs/ProvidersTab";
import { updateModel } from "@/app/(dashboard)/models/actions";

type ModelData = {
	model_id: string;
	name: string | null;
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

function parseModelKey(modelKey: string): {
	provider_id: string;
	api_model_id: string;
	capability_id: string;
} {
	const [provider_id = "", api_model_id = "", ...rest] = modelKey.split(":");
	return {
		provider_id,
		api_model_id,
		capability_id: rest.join(":") || "chat/completions",
	};
}

export default function ModelLegacyEditor({
	modelId,
}: {
	modelId: string;
}) {
	const [model, setModel] = useState<ModelData | null>(null);
	const [providers, setProviders] = useState<Array<{ id: string; name: string }>>([]);
	const [detailRows, setDetailRows] = useState<any[]>([]);
	const [linkRows, setLinkRows] = useState<any[]>([]);
	const [benchmarkRows, setBenchmarkRows] = useState<any[]>([]);
	const [pricingRows, setPricingRows] = useState<any[]>([]);
	const [providerRows, setProviderRows] = useState<any[]>([]);
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [savedMessage, setSavedMessage] = useState<string | null>(null);

	const fetchBasicData = useCallback(async () => {
		const supabase = createClient();
		const { data: modelData } = await supabase
			.from("data_models")
			.select(
				"model_id, name, status, announcement_date, release_date, deprecation_date, retirement_date, input_types, output_types, previous_model_id, family_id",
			)
			.eq("model_id", modelId)
			.single();

		const { data: providerData } = await supabase
			.from("data_api_providers")
			.select("api_provider_id, api_provider_name");

		setModel(modelData as ModelData);
		if (providerData) {
			setProviders(
				providerData.map((p: any) => ({
					id: p.api_provider_id,
					name: p.api_provider_name ?? p.api_provider_id,
				})),
			);
		}
	}, [modelId]);

	useEffect(() => {
		setLoading(true);
		void fetchBasicData().finally(() => setLoading(false));
	}, [fetchBasicData]);

	const handleSaveAll = async () => {
		if (!model) return;
		setSaving(true);
		setError(null);
		setSavedMessage(null);
		try {
			await updateModel({
				modelId,
				name: model.name ?? undefined,
				status: model.status,
				announcement_date: model.announcement_date,
				release_date: model.release_date,
				deprecation_date: model.deprecation_date,
				retirement_date: model.retirement_date,
				input_types: model.input_types,
				output_types: model.output_types,
				previous_model_id: model.previous_model_id,
				family_id: model.family_id,
				model_details: detailRows
					.filter((row) => row.detail_name && row.detail_value !== undefined && row.detail_value !== null)
					.map((row) => ({
						id: typeof row.id === "string" && row.id.startsWith("new-") ? undefined : row.id,
						detail_name: row.detail_name,
						detail_value: row.detail_value,
					})),
				links: linkRows
					.filter((row) => row.platform && row.url)
					.map((row) => ({
						id: typeof row.id === "string" && row.id.startsWith("new-") ? undefined : row.id,
						platform: row.platform,
						url: row.url,
					})),
				benchmark_results: benchmarkRows
					.filter((row) => row.benchmark_id)
					.map((row) => ({
						id: typeof row.id === "string" && row.id.startsWith("new-") ? undefined : row.id,
						benchmark_id: row.benchmark_id,
						score: row.score,
						is_self_reported: Boolean(row.is_self_reported),
						other_info: row.other_info ?? null,
						source_link: row.source_link ?? null,
						rank: row.rank ?? null,
					})),
				provider_models: providerRows
					.filter((row) => row.provider_id && row.api_model_id)
					.map((row) => ({
						id: typeof row.id === "string" && row.id.startsWith("new-") ? undefined : row.id,
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
				pricing_rules: pricingRows
					.map((row) => {
						const parsed = parseModelKey(row.model_key ?? "");
						return {
							id: typeof row.id === "string" && row.id.startsWith("new-") ? undefined : row.id,
							provider_id: row.provider_id ?? parsed.provider_id,
							api_model_id: row.api_model_id ?? parsed.api_model_id,
							capability_id: row.capability_id ?? parsed.capability_id,
							pricing_plan: row.pricing_plan ?? "standard",
							meter: row.meter,
							unit: row.unit ?? "token",
							unit_size: Number(row.unit_size ?? 1),
							price_per_unit: Number(row.price_per_unit ?? 0),
							currency: row.currency ?? "USD",
							tiering_mode: row.tiering_mode ?? null,
							note: row.note ?? null,
							match: Array.isArray(row.match) ? row.match : [],
							priority: Number(row.priority ?? 100),
							effective_from: row.effective_from ?? null,
							effective_to: row.effective_to ?? null,
						};
					})
					.filter((row) => row.provider_id && row.api_model_id && row.meter),
			});
			setSavedMessage("Saved all model sections.");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save");
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
		return <p className="py-8 text-center text-sm text-muted-foreground">Failed to load model data.</p>;
	}

	return (
		<div className="space-y-4">
			<section className="space-y-3 rounded-lg border p-4">
				<div>
					<h2 className="text-base font-semibold">Basic</h2>
					<p className="text-sm text-muted-foreground">Edit core model fields and lifecycle status.</p>
				</div>
				<BasicTab model={model as any} onModelChange={(next) => setModel(next as ModelData)} />
			</section>

			<section className="space-y-3 rounded-lg border p-4">
				<div>
					<h2 className="text-base font-semibold">Details and Links</h2>
					<p className="text-sm text-muted-foreground">Manage modalities, detail rows, and reference links.</p>
				</div>
				<DetailsTab
					modelId={modelId}
					model={model as any}
					onModelChange={(next) => setModel(next as ModelData)}
					onDetailsChange={(rows) => setDetailRows(rows)}
					onLinksChange={(rows) => setLinkRows(rows)}
				/>
			</section>

			<section className="space-y-3 rounded-lg border p-4">
				<div>
					<h2 className="text-base font-semibold">Benchmark Results</h2>
					<p className="text-sm text-muted-foreground">Set benchmark scores, rank, and source metadata.</p>
				</div>
				<BenchmarksTab modelId={modelId} onBenchmarksChange={(rows) => setBenchmarkRows(rows)} />
			</section>

			<section className="space-y-3 rounded-lg border p-4">
				<div>
					<h2 className="text-base font-semibold">Provider Support</h2>
					<p className="text-sm text-muted-foreground">Configure provider mappings, family, and modality support.</p>
				</div>
				<ProvidersTab
					modelId={modelId}
					model={model as any}
					onModelChange={(next) => setModel(next as ModelData)}
					providers={providers}
					onProviderModelsChange={(rows) => setProviderRows(rows)}
				/>
			</section>

			<section className="space-y-3 rounded-lg border p-4">
				<div>
					<h2 className="text-base font-semibold">Pricing Rules</h2>
					<p className="text-sm text-muted-foreground">Define provider/model capability pricing records.</p>
				</div>
				<PricingTab modelId={modelId} onPricingRulesChange={(rows) => setPricingRows(rows)} />
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
				<Button onClick={handleSaveAll} disabled={saving}>
					{saving ? "Saving..." : "Save All Sections"}
				</Button>
			</div>
		</div>
	);
}
