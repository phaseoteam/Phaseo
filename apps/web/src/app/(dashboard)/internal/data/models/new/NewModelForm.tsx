"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	CAPABILITY_STATUS_OPTIONS,
	MODEL_CAPABILITY_OPTIONS,
	MODEL_MODALITY_OPTIONS,
	MODEL_STATUS_OPTIONS,
} from "@/lib/models/editorOptions";
import { PRICING_METER_OPTIONS } from "@/lib/pricing/meters";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type OrganisationOption = {
	organisation_id: string;
	name: string | null;
};

type ProviderOption = {
	api_provider_id: string;
	api_provider_name: string | null;
};

type FamilyOption = {
	family_id: string;
	family_name: string | null;
};

type BenchmarkOption = {
	id: string;
	name: string | null;
};

type PreviousModelOption = {
	model_id: string;
	name: string | null;
};

type CapabilityDraft = {
	id: string;
	capability_id: string;
	status: (typeof CAPABILITY_STATUS_OPTIONS)[number];
	params: Record<string, boolean>;
};

type ProviderDraft = {
	id: string;
	provider_id: string;
	api_model_id: string;
	provider_model_slug: string;
	is_active_gateway: boolean;
	input_modalities: string[];
	output_modalities: string[];
	quantization_scheme: string;
	context_length: string;
	max_output_tokens: string;
	effective_from: string;
	effective_to: string;
	capabilities: CapabilityDraft[];
};

type BenchmarkResultDraft = {
	id: string;
	benchmark_id: string;
	score: string;
	source_link: string;
	variant: string;
	other_info: string;
	is_self_reported: boolean;
};

type NewBenchmarkDraft = {
	id: string;
	name: string;
	category: string;
	link: string;
	ascending_order: "higher" | "lower" | "";
};

type PricingRuleDraft = {
	id: string;
	provider_id: string;
	api_model_id: string;
	capability_id: string;
	pricing_plan: string;
	meter: string;
	unit: string;
	unit_size: string;
	price_per_unit: string;
	currency: string;
};

type SubscriptionPlanOption = {
	plan_uuid: string;
	plan_id: string | null;
	name: string | null;
	frequency: string | null;
	price: number | null;
	currency: string | null;
};

type NewSubscriptionPlanDraft = {
	plan_id: string;
	name: string;
	frequency: string;
	price: string;
	currency: string;
};

const STATUS_OPTIONS = MODEL_STATUS_OPTIONS;
const MODALITY_OPTIONS = MODEL_MODALITY_OPTIONS;
const COMMON_CAPABILITIES = MODEL_CAPABILITY_OPTIONS;
const PARAMETER_FLAGS = [
	"temperature",
	"top_p",
	"top_k",
	"max_tokens",
	"max_completion_tokens",
	"frequency_penalty",
	"presence_penalty",
	"repetition_penalty",
	"stream",
	"seed",
	"include_reasoning",
	"response_format",
	"tool_choice",
	"parallel_tool_calls",
];

const METER_DEFAULTS: Record<string, { unit: string; unit_size: number }> = {
	input_tokens: { unit: "token", unit_size: 1_000_000 },
	input_text_tokens: { unit: "token", unit_size: 1_000_000 },
	output_tokens: { unit: "token", unit_size: 1_000_000 },
	output_text_tokens: { unit: "token", unit_size: 1_000_000 },
	output_reasoning_tokens: { unit: "token", unit_size: 1_000_000 },
	image_pixels: { unit: "pixel", unit_size: 1_000_000 },
	video_pixels: { unit: "pixel", unit_size: 1_000_000 },
	implicit_cached_input_text_tokens: { unit: "token", unit_size: 1_000_000 },
	cached_read_text_tokens: { unit: "token", unit_size: 1_000_000 },
	cached_write_text_tokens: { unit: "token", unit_size: 1_000_000 },
	cached_write_text_tokens_5m: { unit: "token", unit_size: 1_000_000 },
	cached_write_text_tokens_1h: { unit: "token", unit_size: 1_000_000 },
	input_image_tokens: { unit: "token", unit_size: 1_000_000 },
	output_image_tokens: { unit: "token", unit_size: 1_000_000 },
	cached_read_image_tokens: { unit: "token", unit_size: 1_000_000 },
	input_audio_tokens: { unit: "token", unit_size: 1_000_000 },
	output_audio_tokens: { unit: "token", unit_size: 1_000_000 },
	cached_read_audio_tokens: { unit: "token", unit_size: 1_000_000 },
	output_image: { unit: "image", unit_size: 1 },
	input_image: { unit: "image", unit_size: 1 },
	output_video: { unit: "video", unit_size: 1 },
	output_video_seconds: { unit: "second", unit_size: 1 },
	input_video_seconds: { unit: "second", unit_size: 1 },
	bfl_credits: { unit: "credit", unit_size: 1 },
	requests: { unit: "request", unit_size: 1 },
};

const MODEL_DETAIL_FIELDS = [
	{
		key: "input_context_length",
		label: "Input context length",
		inputType: "number",
		placeholder: "e.g., 128000",
	},
	{
		key: "output_context_length",
		label: "Output context length",
		inputType: "number",
		placeholder: "e.g., 8192",
	},
	{
		key: "knowledge_cutoff",
		label: "Knowledge cutoff",
		inputType: "date",
		placeholder: "Knowledge cutoff date",
	},
	{
		key: "parameter_count",
		label: "Parameter count",
		inputType: "text",
		placeholder: "e.g., 70000000000",
	},
	{
		key: "training_tokens",
		label: "Training tokens",
		inputType: "text",
		placeholder: "e.g., 13000000000000",
	},
] as const;

const MODEL_LINK_FIELDS = [
	{ key: "announcement", label: "Announcement" },
	{ key: "api_reference", label: "API reference" },
	{ key: "model_card", label: "Model card" },
	{ key: "paper", label: "Paper" },
	{ key: "playground", label: "Playground" },
	{ key: "repository", label: "Repository" },
	{ key: "weights", label: "Weights" },
] as const;

type DetailFieldKey = (typeof MODEL_DETAIL_FIELDS)[number]["key"];
type LinkFieldKey = (typeof MODEL_LINK_FIELDS)[number]["key"];

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
	notation: "compact",
	maximumFractionDigits: 2,
});

const COMPACT_DETAIL_FIELDS = new Set<DetailFieldKey>(["parameter_count", "training_tokens"]);

function sanitizeDigitInput(value: string): string {
	return value.replace(/[^\d]/g, "");
}

function formatCompactNumberLabel(value: string): string {
	if (!value) return "";
	const normalized = value.replace(/^0+(?=\d)/, "");
	const safe = normalized || "0";
	const numeric = Number(safe);
	if (!Number.isFinite(numeric)) return "";
	return COMPACT_NUMBER_FORMATTER.format(numeric);
}

function defaultCapability(): CapabilityDraft {
	return {
		id: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		capability_id: "text.generate",
		status: "active",
		params: {},
	};
}

function defaultProvider(providerId: string, modelId: string): ProviderDraft {
	return {
		id: `provider-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		provider_id: providerId,
		api_model_id: modelId,
		provider_model_slug: "",
		is_active_gateway: false,
		input_modalities: ["text"],
		output_modalities: ["text"],
		quantization_scheme: "",
		context_length: "",
		max_output_tokens: "",
		effective_from: "",
		effective_to: "",
		capabilities: [defaultCapability()],
	};
}

function formatSubscriptionPlanOption(plan: SubscriptionPlanOption): string {
	const name = plan.name?.trim() || plan.plan_id?.trim() || plan.plan_uuid;
	const frequency = plan.frequency?.trim();
	const price =
		typeof plan.price === "number" && Number.isFinite(plan.price)
			? `${plan.price}${plan.currency ? ` ${plan.currency}` : ""}`
			: null;
	const detail = [frequency, price].filter(Boolean).join(" | ");
	return detail ? `${name} (${detail})` : name;
}

export default function NewModelForm({
	organisations,
	providers,
	families,
	benchmarks,
	previousModels,
	subscriptionPlans,
	createAction,
}: {
	organisations: OrganisationOption[];
	providers: ProviderOption[];
	families: FamilyOption[];
	benchmarks: BenchmarkOption[];
	previousModels: PreviousModelOption[];
	subscriptionPlans: SubscriptionPlanOption[];
	createAction: (formData: FormData) => void | Promise<void>;
}) {
	const router = useRouter();
	const [modelId, setModelId] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [selectedFamilyId, setSelectedFamilyId] = useState("");
	const [newFamilyId, setNewFamilyId] = useState("");
	const [newFamilyName, setNewFamilyName] = useState("");
	const [newFamilyDescription, setNewFamilyDescription] = useState("");
	const [releaseDate, setReleaseDate] = useState("");
	const [announcementDate, setAnnouncementDate] = useState("");
	const [deprecationDate, setDeprecationDate] = useState("");
	const [retirementDate, setRetirementDate] = useState("");
	const [inputTypes, setInputTypes] = useState<string[]>(["text"]);
	const [outputTypes, setOutputTypes] = useState<string[]>(["text"]);
	const [providerRows, setProviderRows] = useState<ProviderDraft[]>([]);
	const [benchmarkRows, setBenchmarkRows] = useState<BenchmarkResultDraft[]>([]);
	const [newBenchmarkRows, setNewBenchmarkRows] = useState<NewBenchmarkDraft[]>([]);
	const [selectedPlanUuids, setSelectedPlanUuids] = useState<string[]>([]);
	const [newSubscriptionPlanRows, setNewSubscriptionPlanRows] = useState<NewSubscriptionPlanDraft[]>([]);
	const [pricingRows, setPricingRows] = useState<PricingRuleDraft[]>([]);
	const [detailValues, setDetailValues] = useState<Record<DetailFieldKey, string>>({
		input_context_length: "",
		output_context_length: "",
		knowledge_cutoff: "",
		parameter_count: "",
		training_tokens: "",
	});
	const [linkValues, setLinkValues] = useState<Record<LinkFieldKey, string>>({
		announcement: "",
		api_reference: "",
		model_card: "",
		paper: "",
		playground: "",
		repository: "",
		weights: "",
	});

	const benchmarkOptions = useMemo(() => {
		const merged = new Map<string, string>();
		for (const benchmark of benchmarks) {
			if (!benchmark.id) continue;
			merged.set(benchmark.id, benchmark.name ?? benchmark.id);
		}
		for (const benchmark of newBenchmarkRows) {
			if (!benchmark.id.trim()) continue;
			merged.set(benchmark.id.trim(), benchmark.name.trim() || benchmark.id.trim());
		}
		return Array.from(merged.entries()).map(([id, name]) => ({ id, name }));
	}, [benchmarks, newBenchmarkRows]);

	const modelIdOptions = useMemo(() => {
		const set = new Set(previousModels.map((row) => row.model_id).filter(Boolean));
		if (modelId.trim()) set.add(modelId.trim());
		for (const row of providerRows) {
			if (row.api_model_id.trim()) set.add(row.api_model_id.trim());
		}
		return Array.from(set).sort((a, b) =>
			a.localeCompare(b, undefined, { sensitivity: "base" })
		);
	}, [modelId, previousModels, providerRows]);

	const sortedProviders = useMemo(
		() =>
			[...providers].sort((a, b) =>
				(a.api_provider_name ?? a.api_provider_id).localeCompare(
					b.api_provider_name ?? b.api_provider_id,
					undefined,
					{ sensitivity: "base" }
				)
			),
		[providers]
	);

	const pricingProviderOptions = useMemo(() => {
		const selected = new Set(
			providerRows
				.map((row) => row.provider_id?.trim())
				.filter((value): value is string => Boolean(value))
		);
		return sortedProviders.filter((provider) =>
			selected.has(provider.api_provider_id)
		);
	}, [providerRows, sortedProviders]);
	const providerNameById = useMemo(
		() =>
			Object.fromEntries(
				sortedProviders.map((provider) => [
					provider.api_provider_id,
					provider.api_provider_name ?? provider.api_provider_id,
				])
			),
		[sortedProviders]
	);

	const defaultPricingProviderId =
		pricingProviderOptions[0]?.api_provider_id ?? "";
	const getDefaultPricingApiModelId = (providerId?: string) =>
		providerRows.find((row) => row.provider_id === providerId)?.api_model_id.trim() ||
		modelId.trim();
	const getDefaultPricingCapability = (providerId?: string) =>
		providerRows.find((row) => row.provider_id === providerId)?.capabilities[0]
			?.capability_id ?? "text.generate";

	const createPricingRow = (
		providerId?: string,
		meter?: string
	): PricingRuleDraft => {
		const chosenMeter = meter ?? PRICING_METER_OPTIONS[0]?.value ?? "input_text_tokens";
		const defaults = METER_DEFAULTS[chosenMeter];
		const resolvedProviderId = providerId ?? defaultPricingProviderId;
		return {
			id: `price-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			provider_id: resolvedProviderId,
			api_model_id: getDefaultPricingApiModelId(resolvedProviderId),
			capability_id: getDefaultPricingCapability(resolvedProviderId),
			pricing_plan: "standard",
			meter: chosenMeter,
			unit: defaults?.unit ?? "token",
			unit_size: String(defaults?.unit_size ?? 1),
			price_per_unit: "0",
			currency: "USD",
		};
	};

	const addPricingRows = (meters: string[]) => {
		if (!pricingProviderOptions.length) {
			toast.error("Select at least one provider before adding pricing rules.")
			return;
		}
		setPricingRows((prev) => [
			...prev,
			...meters.map((meter) => createPricingRow(defaultPricingProviderId, meter)),
		]);
	};
	const addPricingRowsForProvider = (providerId: string, meters: string[]) => {
		setPricingRows((prev) => [
			...prev,
			...meters.map((meter) => createPricingRow(providerId, meter)),
		]);
	};

	const setPricingField = (rowId: string, field: keyof PricingRuleDraft, value: string) => {
		setPricingRows((prev) =>
			prev.map((row) => {
				if (row.id !== rowId) return row;
				if (field !== "meter") return { ...row, [field]: value };
				const defaults = METER_DEFAULTS[value];
				return {
					...row,
					meter: value,
					unit: defaults?.unit ?? row.unit,
					unit_size: defaults ? String(defaults.unit_size) : row.unit_size,
				};
			})
		);
	};
	const groupedPricingRows = useMemo(() => {
		const groups = new Map<string, PricingRuleDraft[]>();
		for (const row of pricingRows) {
			const key = row.provider_id || "__unassigned__";
			const existing = groups.get(key) ?? [];
			existing.push(row);
			groups.set(key, existing);
		}

		const sortRows = (rows: PricingRuleDraft[]) =>
			[...rows].sort((a, b) => {
				const providerCmp = (providerNameById[a.provider_id] ?? a.provider_id).localeCompare(
					providerNameById[b.provider_id] ?? b.provider_id,
					undefined,
					{ sensitivity: "base" }
				);
				if (providerCmp !== 0) return providerCmp;
				const modelCmp = (a.api_model_id || modelId).localeCompare(
					b.api_model_id || modelId,
					undefined,
					{ sensitivity: "base" }
				);
				if (modelCmp !== 0) return modelCmp;
				const capabilityCmp = a.capability_id.localeCompare(b.capability_id, undefined, {
					sensitivity: "base",
				});
				if (capabilityCmp !== 0) return capabilityCmp;
				return a.meter.localeCompare(b.meter, undefined, { sensitivity: "base" });
			});

		const providerGroups = pricingProviderOptions.map((provider) => ({
			providerId: provider.api_provider_id,
			providerName: provider.api_provider_name ?? provider.api_provider_id,
			rows: sortRows(groups.get(provider.api_provider_id) ?? []),
		}));
		const unassignedRows = sortRows(groups.get("__unassigned__") ?? []);

		return {
			providerGroups,
			unassignedRows,
		};
	}, [modelId, pricingProviderOptions, pricingRows, providerNameById]);

	const providerModelPayload = useMemo(
		() =>
			JSON.stringify(
				providerRows.map((row) => ({
					provider_id: row.provider_id,
					api_model_id: row.api_model_id.trim() || modelId.trim(),
					provider_model_slug: row.provider_model_slug.trim() || null,
					is_active_gateway: row.is_active_gateway,
					input_modalities: row.input_modalities,
					output_modalities: row.output_modalities,
					quantization_scheme: row.quantization_scheme.trim() || null,
					context_length: row.context_length ? Number(row.context_length) : null,
					max_output_tokens: row.max_output_tokens ? Number(row.max_output_tokens) : null,
					effective_from: row.effective_from || null,
					effective_to: row.effective_to || null,
				}))
			),
		[providerRows, modelId]
	);

	const providerCapabilityPayload = useMemo(
		() =>
			JSON.stringify(
				providerRows.flatMap((provider) =>
					provider.capabilities.map((capability) => ({
						provider_id: provider.provider_id,
						api_model_id: provider.api_model_id.trim() || modelId.trim(),
						capability_id: capability.capability_id.trim(),
						status: capability.status,
						params: Object.fromEntries(
							Object.entries(capability.params).filter(([, enabled]) => enabled === true)
						),
					}))
				)
			),
		[providerRows, modelId]
	);

	const benchmarkResultsPayload = useMemo(
		() =>
			JSON.stringify(
				benchmarkRows.map((row) => ({
					benchmark_id: row.benchmark_id,
					score: row.score,
					source_link: row.source_link.trim() || null,
					variant: row.variant.trim() || null,
					other_info: row.other_info.trim() || null,
					is_self_reported: row.is_self_reported,
				}))
			),
		[benchmarkRows]
	);

	const newBenchmarksPayload = useMemo(
		() =>
			JSON.stringify(
				newBenchmarkRows.map((row) => ({
					id: row.id.trim(),
					name: row.name.trim(),
					category: row.category.trim() || null,
					link: row.link.trim() || null,
					ascending_order: row.ascending_order || null,
				}))
			),
		[newBenchmarkRows]
	);

	const pricingPayload = useMemo(
		() =>
			JSON.stringify(
				pricingRows.map((row) => ({
					provider_id: row.provider_id,
					api_model_id: row.api_model_id.trim() || modelId.trim(),
					capability_id: row.capability_id,
					pricing_plan: row.pricing_plan,
					meter: row.meter,
					unit: row.unit,
					unit_size: Number(row.unit_size || "1"),
					price_per_unit: Number(row.price_per_unit || "0"),
					currency: row.currency || "USD",
				}))
			),
		[pricingRows, modelId]
	);

	const subscriptionPlanModelsPayload = useMemo(
		() =>
			JSON.stringify(
				selectedPlanUuids.map((planUuid) => ({
					plan_uuid: planUuid,
					model_info: {},
					rate_limit: {},
					other_info: {},
				}))
			),
		[selectedPlanUuids]
	);

	const newSubscriptionPlansPayload = useMemo(
		() =>
			JSON.stringify(
				newSubscriptionPlanRows.map((row) => ({
					plan_id: row.plan_id.trim(),
					name: row.name.trim(),
					frequency: row.frequency.trim() || "monthly",
					price: Number(row.price || "0"),
					currency: (row.currency.trim() || "USD").toUpperCase(),
				}))
			),
		[newSubscriptionPlanRows]
	);

	const familyPayload = useMemo(
		() =>
			JSON.stringify({
				family_id: newFamilyId.trim() || null,
				family_name: newFamilyName.trim() || null,
				family_description: newFamilyDescription.trim() || null,
			}),
		[newFamilyDescription, newFamilyId, newFamilyName]
	);

	const modelDetailsPayload = useMemo(
		() =>
			JSON.stringify(
				MODEL_DETAIL_FIELDS.map((field) => ({
					detail_name: field.key,
					detail_value: detailValues[field.key].trim() || null,
				}))
			),
		[detailValues]
	);

	const modelLinksPayload = useMemo(
		() =>
			JSON.stringify(
				MODEL_LINK_FIELDS.map((field) => ({
					platform: field.key,
					url: linkValues[field.key].trim() || null,
				}))
			),
		[linkValues]
	);

	const providerSelected = (providerId: string) =>
		providerRows.some((row) => row.provider_id === providerId);

	const toggleProvider = (providerId: string) => {
		setProviderRows((prev) => {
			if (prev.some((row) => row.provider_id === providerId)) {
				return prev.filter((row) => row.provider_id !== providerId);
			}
			return [...prev, defaultProvider(providerId, modelId.trim())];
		});
	};

	const toggleModality = (
		providerRowId: string,
		field: "input_modalities" | "output_modalities",
		modality: string,
		enabled: boolean
	) => {
		setProviderRows((prev) =>
			prev.map((row) => {
				if (row.id !== providerRowId) return row;
				const current = new Set(row[field]);
				if (enabled) current.add(modality);
				else current.delete(modality);
				return { ...row, [field]: Array.from(current) };
			})
		);
	};

	const toggleCoreType = (field: "input" | "output", type: string) => {
		if (field === "input") {
			setInputTypes((prev) => {
				const next = new Set(prev);
				if (next.has(type)) next.delete(type);
				else next.add(type);
				return Array.from(next);
			});
			return;
		}
		setOutputTypes((prev) => {
			const next = new Set(prev);
			if (next.has(type)) next.delete(type);
			else next.add(type);
			return Array.from(next);
		});
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const promise = Promise.resolve(createAction(formData));

		setIsSubmitting(true);
		toast.promise(promise, {
			loading: "Creating model...",
			success: "Model created",
			error: (error) =>
				error instanceof Error ? error.message : "Failed to create model",
		});

		void promise
			.then(() => {
				router.push("/internal/data/models");
			})
			.finally(() => setIsSubmitting(false));
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6 rounded-lg border p-4">
			<input type="hidden" name="family_payload" value={familyPayload} />
			<input type="hidden" name="provider_models_payload" value={providerModelPayload} />
			<input type="hidden" name="provider_capabilities_payload" value={providerCapabilityPayload} />
			<input type="hidden" name="benchmark_results_payload" value={benchmarkResultsPayload} />
			<input type="hidden" name="new_benchmarks_payload" value={newBenchmarksPayload} />
			<input type="hidden" name="pricing_rules_payload" value={pricingPayload} />
			<input type="hidden" name="subscription_plan_models_payload" value={subscriptionPlanModelsPayload} />
			<input type="hidden" name="new_subscription_plans_payload" value={newSubscriptionPlansPayload} />
			<input type="hidden" name="model_details_payload" value={modelDetailsPayload} />
			<input type="hidden" name="model_links_payload" value={modelLinksPayload} />
			<input type="hidden" name="input_types" value={inputTypes.join(",")} />
			<input type="hidden" name="output_types" value={outputTypes.join(",")} />

			<section className="space-y-3">
				<h2 className="text-sm font-medium">Core</h2>
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Model ID</div>
						<Input name="model_id" value={modelId} onChange={(event) => setModelId(event.target.value)} required />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Name</div>
						<Input name="name" required />
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">Organisation</div>
						<select
							name="organisation_id"
							required
							defaultValue=""
							className="w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="" disabled>
								Select organisation
							</option>
							{organisations.map((org) => (
								<option key={org.organisation_id} value={org.organisation_id}>
									{org.name ?? org.organisation_id}
								</option>
							))}
						</select>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Status</div>
						<select name="status" defaultValue="Released" className="w-full rounded-md border px-3 py-2 text-sm">
							{STATUS_OPTIONS.map((status) => (
								<option key={status} value={status}>
									{status}
								</option>
							))}
						</select>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Previous model</div>
						<select name="previous_model_id" className="w-full rounded-md border px-3 py-2 text-sm">
							<option value="">None</option>
							{previousModels.map((previousModel) => (
								<option key={previousModel.model_id} value={previousModel.model_id}>
									{previousModel.name ?? previousModel.model_id}
								</option>
							))}
						</select>
					</label>
					<label className="text-sm flex items-center gap-2 self-end">
						<input type="checkbox" name="hidden" />
						<span>Hidden</span>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Release date</div>
						<DatePickerInput
							name="release_date"
							value={releaseDate}
							onChange={setReleaseDate}
							placeholder="Release date"
						/>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Announcement date</div>
						<DatePickerInput
							name="announcement_date"
							value={announcementDate}
							onChange={setAnnouncementDate}
							placeholder="Announcement date"
						/>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Deprecation date</div>
						<DatePickerInput
							name="deprecation_date"
							value={deprecationDate}
							onChange={setDeprecationDate}
							placeholder="Deprecation date"
						/>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Retirement date</div>
						<DatePickerInput
							name="retirement_date"
							value={retirementDate}
							onChange={setRetirementDate}
							placeholder="Retirement date"
						/>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">License</div>
						<Input name="license" placeholder="e.g., Apache-2.0" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Input types</div>
						<div className="flex flex-wrap gap-2">
							{MODALITY_OPTIONS.map((type) => {
								const active = inputTypes.includes(type);
								return (
									<Button
										key={`new-model-input-${type}`}
										type="button"
										variant="outline"
										size="sm"
										onClick={() => toggleCoreType("input", type)}
										className={cn(active && "border-primary bg-primary/10")}
									>
										{type}
									</Button>
								);
							})}
						</div>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Output types</div>
						<div className="flex flex-wrap gap-2">
							{MODALITY_OPTIONS.map((type) => {
								const active = outputTypes.includes(type);
								return (
									<Button
										key={`new-model-output-${type}`}
										type="button"
										variant="outline"
										size="sm"
										onClick={() => toggleCoreType("output", type)}
										className={cn(active && "border-primary bg-primary/10")}
									>
										{type}
									</Button>
								);
							})}
						</div>
					</label>
				</div>
			</section>

			<section className="space-y-3 rounded-lg border p-3">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-medium">Subscription plans</h2>
				</div>
				<p className="text-xs text-muted-foreground">
					Attach existing plans, or create new ones and attach them on save.
				</p>

				<div className="space-y-2 rounded-md border p-2">
					{subscriptionPlans.length === 0 ? (
						<p className="text-xs text-muted-foreground">No existing plans available.</p>
					) : null}
					{subscriptionPlans.map((plan) => {
						const checked = selectedPlanUuids.includes(plan.plan_uuid);
						return (
							<label
								key={plan.plan_uuid}
								className="flex items-center justify-between gap-3 rounded-md border px-2 py-1.5 text-xs"
							>
								<span className="truncate">{formatSubscriptionPlanOption(plan)}</span>
								<Checkbox
									checked={checked}
									onCheckedChange={(value) =>
										setSelectedPlanUuids((prev) => {
											if (value !== true) {
												return prev.filter((planUuid) => planUuid !== plan.plan_uuid);
											}
											return prev.includes(plan.plan_uuid)
												? prev
												: [...prev, plan.plan_uuid];
										})
									}
								/>
							</label>
						);
					})}
				</div>

				<div className="space-y-2 rounded-md border p-2">
					<div className="flex items-center justify-between">
						<h3 className="text-xs font-medium">Create plan inline</h3>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								setNewSubscriptionPlanRows((prev) => [
									...prev,
									{
										plan_id: "",
										name: "",
										frequency: "monthly",
										price: "0",
										currency: "USD",
									},
								])
							}
						>
							<Plus className="mr-1 h-3 w-3" />
							New plan
						</Button>
					</div>
					{newSubscriptionPlanRows.map((row, index) => (
						<div key={`new-plan-${index}`} className="grid gap-2 rounded-md border p-2 lg:grid-cols-12">
							<label className="text-xs lg:col-span-3">
								<div className="mb-1 text-muted-foreground">Plan ID</div>
								<Input
									value={row.plan_id}
									onChange={(event) =>
										setNewSubscriptionPlanRows((prev) =>
											prev.map((inner, innerIndex) =>
												innerIndex === index ? { ...inner, plan_id: event.target.value } : inner
											)
										)
									}
									className="h-8 text-xs"
									placeholder="starter-monthly"
								/>
							</label>
							<label className="text-xs lg:col-span-3">
								<div className="mb-1 text-muted-foreground">Name</div>
								<Input
									value={row.name}
									onChange={(event) =>
										setNewSubscriptionPlanRows((prev) =>
											prev.map((inner, innerIndex) =>
												innerIndex === index ? { ...inner, name: event.target.value } : inner
											)
										)
									}
									className="h-8 text-xs"
									placeholder="Starter"
								/>
							</label>
							<label className="text-xs lg:col-span-2">
								<div className="mb-1 text-muted-foreground">Frequency</div>
								<Input
									value={row.frequency}
									onChange={(event) =>
										setNewSubscriptionPlanRows((prev) =>
											prev.map((inner, innerIndex) =>
												innerIndex === index ? { ...inner, frequency: event.target.value } : inner
											)
										)
									}
									className="h-8 text-xs"
									placeholder="monthly"
								/>
							</label>
							<label className="text-xs lg:col-span-2">
								<div className="mb-1 text-muted-foreground">Price</div>
								<Input
									type="number"
									step="0.01"
									value={row.price}
									onChange={(event) =>
										setNewSubscriptionPlanRows((prev) =>
											prev.map((inner, innerIndex) =>
												innerIndex === index ? { ...inner, price: event.target.value } : inner
											)
										)
									}
									className="h-8 text-xs"
									placeholder="0"
								/>
							</label>
							<div className="flex items-end gap-2 lg:col-span-2">
								<label className="w-full text-xs">
									<div className="mb-1 text-muted-foreground">Currency</div>
									<Input
										value={row.currency}
										onChange={(event) =>
											setNewSubscriptionPlanRows((prev) =>
												prev.map((inner, innerIndex) =>
													innerIndex === index
														? { ...inner, currency: event.target.value.toUpperCase() }
														: inner
												)
											)
										}
										className="h-8 text-xs"
										placeholder="USD"
									/>
								</label>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() =>
										setNewSubscriptionPlanRows((prev) =>
											prev.filter((_, innerIndex) => innerIndex !== index)
										)
									}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="space-y-3 rounded-lg border p-3">
				<h2 className="text-sm font-medium">Family</h2>
				<div className="grid gap-3 lg:grid-cols-2">
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Existing family</div>
						<select
							name="family_id"
							value={selectedFamilyId}
							onChange={(event) => setSelectedFamilyId(event.target.value)}
							className="w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="">None</option>
							{families.map((family) => (
								<option key={family.family_id} value={family.family_id}>
									{family.family_name ?? family.family_id}
								</option>
							))}
						</select>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">New family name</div>
						<Input
							value={newFamilyName}
							onChange={(event) => {
								setNewFamilyName(event.target.value);
								if (event.target.value.trim()) setSelectedFamilyId("");
							}}
							placeholder="e.g., GPT-4"
						/>
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">New family ID (optional)</div>
						<Input
							value={newFamilyId}
							onChange={(event) => setNewFamilyId(event.target.value)}
							placeholder="gpt-4"
						/>
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">New family description</div>
						<textarea
							value={newFamilyDescription}
							onChange={(event) => setNewFamilyDescription(event.target.value)}
							className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
						/>
					</label>
				</div>
			</section>

			<section className="space-y-3 rounded-lg border p-3">
				<h2 className="text-sm font-medium">Details and Links</h2>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">Model details</Label>
						<div className="grid gap-3 lg:grid-cols-2">
							{MODEL_DETAIL_FIELDS.map((field) => {
								const isCompactField = COMPACT_DETAIL_FIELDS.has(field.key);
								const compactLabel = isCompactField
									? formatCompactNumberLabel(detailValues[field.key])
									: "";

								return (
									<label key={field.key} className="text-sm">
										<div className="mb-1 text-muted-foreground">{field.label}</div>
										{field.inputType === "date" ? (
											<DatePickerInput
												value={detailValues[field.key]}
												onChange={(value) =>
													setDetailValues((prev) => ({
														...prev,
														[field.key]: value,
													}))
												}
												placeholder={field.placeholder}
											/>
										) : isCompactField ? (
											<div className="relative">
												<Input
													type="text"
													inputMode="numeric"
													value={detailValues[field.key]}
													onChange={(event) =>
														setDetailValues((prev) => ({
															...prev,
															[field.key]: sanitizeDigitInput(event.target.value),
														}))
													}
													placeholder={field.placeholder}
													className={compactLabel ? "pr-16" : undefined}
												/>
												{compactLabel ? (
													<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
														{compactLabel}
													</span>
												) : null}
											</div>
										) : (
											<Input
												type={field.inputType}
												value={detailValues[field.key]}
												onChange={(event) =>
													setDetailValues((prev) => ({
														...prev,
														[field.key]: event.target.value,
													}))
												}
												placeholder={field.placeholder}
											/>
										)}
									</label>
								);
							})}
						</div>
					</div>

					<div className="space-y-2 border-t pt-3">
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">Model links</Label>
						<div className="grid gap-3 lg:grid-cols-2">
							{MODEL_LINK_FIELDS.map((field) => (
								<label key={field.key} className="text-sm">
									<div className="mb-1 text-muted-foreground">{field.label}</div>
									<Input
										type="url"
										value={linkValues[field.key]}
										onChange={(event) =>
											setLinkValues((prev) => ({
												...prev,
												[field.key]: event.target.value,
											}))
										}
										placeholder="https://..."
									/>
								</label>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="space-y-3 rounded-lg border p-3">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-medium">Provider availability and capabilities</h2>
					<p className="text-xs text-muted-foreground">Click logos to toggle availability.</p>
				</div>
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
					{sortedProviders.map((provider) => {
						const active = providerSelected(provider.api_provider_id);
						return (
							<button
								key={provider.api_provider_id}
								type="button"
								onClick={() => toggleProvider(provider.api_provider_id)}
								className={cn(
									"rounded-md border px-3 py-2 text-left transition",
									active
										? "border-primary bg-primary/5"
										: "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
								)}
							>
								<div className={cn("mb-2 flex items-center gap-2", !active && "opacity-50 grayscale")}>
									<Logo id={provider.api_provider_id} alt={provider.api_provider_name ?? provider.api_provider_id} width={18} height={18} />
									<span className="truncate text-xs">{provider.api_provider_name ?? provider.api_provider_id}</span>
								</div>
							</button>
						);
					})}
				</div>

				<div className="space-y-3">
					{providerRows.map((providerRow) => (
						<div key={providerRow.id} className="space-y-3 rounded-md border p-3">
							<div className="grid gap-2 lg:grid-cols-5">
								<label className="text-xs">
									<div className="mb-1 text-muted-foreground">Provider</div>
									<select
										value={providerRow.provider_id}
										onChange={(event) =>
											setProviderRows((prev) =>
												prev.map((row) =>
													row.id === providerRow.id ? { ...row, provider_id: event.target.value } : row
												)
											)
										}
										className="w-full rounded-md border px-2 py-1.5 text-xs"
									>
										{sortedProviders.map((provider) => (
											<option key={provider.api_provider_id} value={provider.api_provider_id}>
												{provider.api_provider_name ?? provider.api_provider_id}
											</option>
										))}
									</select>
								</label>
								<label className="text-xs">
									<div className="mb-1 text-muted-foreground">Public model ID</div>
									<>
										<Input
											list={`provider-model-ids-${providerRow.id}`}
											value={providerRow.api_model_id}
											onChange={(event) =>
												setProviderRows((prev) =>
													prev.map((row) =>
														row.id === providerRow.id
															? { ...row, api_model_id: event.target.value }
															: row
													)
												)
											}
											className="h-8 text-xs"
											placeholder="organisation/model-id"
										/>
										<datalist id={`provider-model-ids-${providerRow.id}`}>
											{modelIdOptions.map((option) => (
												<option key={`${providerRow.id}-${option}`} value={option} />
											))}
										</datalist>
									</>
								</label>
								<label className="text-xs">
									<div className="mb-1 text-muted-foreground">Provider model ID</div>
									<Input
										value={providerRow.provider_model_slug}
										onChange={(event) =>
											setProviderRows((prev) =>
												prev.map((row) =>
													row.id === providerRow.id ? { ...row, provider_model_slug: event.target.value } : row
												)
											)
										}
										className="h-8 text-xs"
									/>
								</label>
								<label className="text-xs">
									<div className="mb-1 text-muted-foreground">Internal model ID</div>
									<Input value={modelId} readOnly disabled className="h-8 text-xs" />
								</label>
								<div className="flex items-end justify-between gap-2">
									<label className="flex items-center gap-2 text-xs">
										<Checkbox
											checked={providerRow.is_active_gateway}
											onCheckedChange={(checked) =>
												setProviderRows((prev) =>
													prev.map((row) =>
														row.id === providerRow.id
															? { ...row, is_active_gateway: checked === true }
															: row
													)
												)
											}
										/>
										Gateway active
									</label>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => setProviderRows((prev) => prev.filter((row) => row.id !== providerRow.id))}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</div>

							<div className="grid gap-2 lg:grid-cols-3">
								<label className="text-xs">
									<div className="mb-1 text-muted-foreground">Quantisation</div>
									<Input
										value={providerRow.quantization_scheme}
										onChange={(event) =>
											setProviderRows((prev) =>
												prev.map((row) =>
													row.id === providerRow.id
														? { ...row, quantization_scheme: event.target.value }
														: row
												)
											)
										}
										className="h-8 text-xs"
										placeholder="FP16, INT8, etc."
									/>
								</label>
								<label className="text-xs">
									<div className="mb-1 text-muted-foreground">Input context</div>
									<Input
										type="number"
										value={providerRow.context_length}
										onChange={(event) =>
											setProviderRows((prev) =>
												prev.map((row) =>
													row.id === providerRow.id
														? { ...row, context_length: event.target.value }
														: row
												)
											)
										}
										className="h-8 text-xs"
										placeholder="e.g. 200000"
									/>
								</label>
								<label className="text-xs">
									<div className="mb-1 text-muted-foreground">Max output</div>
									<Input
										type="number"
										value={providerRow.max_output_tokens}
										onChange={(event) =>
											setProviderRows((prev) =>
												prev.map((row) =>
													row.id === providerRow.id
														? { ...row, max_output_tokens: event.target.value }
														: row
												)
											)
										}
										className="h-8 text-xs"
										placeholder="e.g. 32000"
									/>
								</label>
							</div>

							<div className="grid gap-2 lg:grid-cols-2">
								<div>
									<Label className="mb-1 block text-xs text-muted-foreground">Input modalities</Label>
									<div className="flex flex-wrap gap-2">
										{MODALITY_OPTIONS.map((modality) => (
											<label key={`${providerRow.id}-in-${modality}`} className="flex items-center gap-1 text-xs">
												<Checkbox
													checked={providerRow.input_modalities.includes(modality)}
													onCheckedChange={(checked) =>
														toggleModality(providerRow.id, "input_modalities", modality, checked === true)
													}
												/>
												{modality}
											</label>
										))}
									</div>
								</div>
								<div>
									<Label className="mb-1 block text-xs text-muted-foreground">Output modalities</Label>
									<div className="flex flex-wrap gap-2">
										{MODALITY_OPTIONS.map((modality) => (
											<label key={`${providerRow.id}-out-${modality}`} className="flex items-center gap-1 text-xs">
												<Checkbox
													checked={providerRow.output_modalities.includes(modality)}
													onCheckedChange={(checked) =>
														toggleModality(providerRow.id, "output_modalities", modality, checked === true)
													}
												/>
												{modality}
											</label>
										))}
									</div>
								</div>
							</div>

							<div className="space-y-2 rounded-md border p-2">
								<div className="flex items-center justify-between">
									<h3 className="text-xs font-medium">Capabilities</h3>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() =>
											setProviderRows((prev) =>
												prev.map((row) =>
													row.id === providerRow.id
														? { ...row, capabilities: [...row.capabilities, defaultCapability()] }
														: row
												)
											)
										}
									>
										<Plus className="mr-1 h-3 w-3" />
										Add capability
									</Button>
								</div>

								{providerRow.capabilities.map((capability) => (
									<div key={capability.id} className="space-y-2 rounded-md border p-2">
										<div className="grid gap-2 lg:grid-cols-4">
											<label className="text-xs">
												<div className="mb-1 text-muted-foreground">Endpoint</div>
												<select
													value={capability.capability_id}
													onChange={(event) =>
														setProviderRows((prev) =>
															prev.map((row) =>
																row.id === providerRow.id
																	? {
																			...row,
																			capabilities: row.capabilities.map((innerCapability) =>
																				innerCapability.id === capability.id
																					? { ...innerCapability, capability_id: event.target.value }
																					: innerCapability
																			),
																		}
																	: row
															)
														)
													}
													className="w-full rounded-md border px-2 py-1.5 text-xs"
												>
													{Array.from(new Set([...COMMON_CAPABILITIES, capability.capability_id])).map((endpoint) => (
														<option key={endpoint} value={endpoint}>
															{endpoint}
														</option>
													))}
												</select>
											</label>
											<label className="text-xs">
												<div className="mb-1 text-muted-foreground">Status</div>
												<select
													value={capability.status}
													onChange={(event) =>
														setProviderRows((prev) =>
															prev.map((row) =>
																row.id === providerRow.id
																	? {
																			...row,
																			capabilities: row.capabilities.map((innerCapability) =>
																				innerCapability.id === capability.id
																					? {
																							...innerCapability,
																							status: event.target.value as CapabilityDraft["status"],
																						}
																					: innerCapability
																			),
																		}
																	: row
															)
														)
													}
													className="w-full rounded-md border px-2 py-1.5 text-xs"
												>
													{CAPABILITY_STATUS_OPTIONS.map((status) => (
														<option key={status} value={status}>
															{status}
														</option>
													))}
												</select>
											</label>
											<div className="flex items-end justify-between gap-2">
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() =>
														setProviderRows((prev) =>
															prev.map((row) =>
																row.id === providerRow.id
																	? {
																			...row,
																			capabilities: row.capabilities.filter(
																				(innerCapability) => innerCapability.id !== capability.id
																			),
																		}
																	: row
															)
														)
													}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										</div>
										<div>
											<Label className="mb-1 block text-xs text-muted-foreground">Supported params</Label>
											<div className="flex flex-wrap gap-2">
												{PARAMETER_FLAGS.map((param) => (
													<label key={`${capability.id}-${param}`} className="flex items-center gap-1 text-xs">
														<Checkbox
															checked={Boolean(capability.params[param])}
															onCheckedChange={(checked) =>
																setProviderRows((prev) =>
																	prev.map((row) =>
																		row.id === providerRow.id
																			? {
																					...row,
																					capabilities: row.capabilities.map((innerCapability) =>
																						innerCapability.id === capability.id
																							? {
																									...innerCapability,
																									params: {
																										...innerCapability.params,
																										[param]: checked === true,
																									},
																								}
																							: innerCapability
																					),
																				}
																			: row
																	)
																)
															}
														/>
														{param}
													</label>
												))}
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="space-y-3 rounded-lg border p-3">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-medium">Benchmarks</h2>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() =>
							setBenchmarkRows((prev) => [
								...prev,
								{
									id: `benchmark-${Date.now()}`,
									benchmark_id: "",
									score: "",
									source_link: "",
									variant: "",
									other_info: "",
									is_self_reported: true,
								},
							])
						}
					>
						<Plus className="mr-1 h-4 w-4" />
						Add benchmark result
					</Button>
				</div>
				{benchmarkRows.map((row) => (
					<div key={row.id} className="space-y-2 rounded-md border p-2">
						<div className="grid gap-2 lg:grid-cols-12">
							<label className="text-xs lg:col-span-5">
								<div className="mb-1 text-muted-foreground">Benchmark</div>
								<select
									value={row.benchmark_id}
									onChange={(event) =>
										setBenchmarkRows((prev) =>
											prev.map((inner) => (inner.id === row.id ? { ...inner, benchmark_id: event.target.value } : inner))
										)
									}
									className="w-full rounded-md border px-2 py-1.5 text-xs"
								>
									<option value="">Select benchmark</option>
									{benchmarkOptions.map((option) => (
										<option key={option.id} value={option.id}>
											{option.name}
										</option>
									))}
								</select>
							</label>
							<label className="text-xs lg:col-span-2">
								<div className="mb-1 text-muted-foreground">Score</div>
								<Input
									value={row.score}
									onChange={(event) =>
										setBenchmarkRows((prev) =>
											prev.map((inner) => (inner.id === row.id ? { ...inner, score: event.target.value } : inner))
										)
									}
									placeholder="Score"
									className="h-8 text-xs"
								/>
							</label>
							<div className="flex items-end justify-end lg:col-span-3">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => setBenchmarkRows((prev) => prev.filter((inner) => inner.id !== row.id))}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						</div>

						<div className="grid gap-2 lg:grid-cols-12">
							<label className="text-xs lg:col-span-6">
								<div className="mb-1 text-muted-foreground">Source link</div>
								<Input
									value={row.source_link}
									onChange={(event) =>
										setBenchmarkRows((prev) =>
											prev.map((inner) => (inner.id === row.id ? { ...inner, source_link: event.target.value } : inner))
										)
									}
									placeholder="https://..."
									className="h-8 text-xs"
								/>
							</label>
							<label className="text-xs lg:col-span-3">
								<div className="mb-1 text-muted-foreground">Variant</div>
								<Input
									value={row.variant}
									onChange={(event) =>
										setBenchmarkRows((prev) =>
											prev.map((inner) => (inner.id === row.id ? { ...inner, variant: event.target.value } : inner))
										)
									}
									placeholder="e.g., Max"
									className="h-8 text-xs"
								/>
							</label>
							<div className="flex items-end lg:col-span-3">
								<label className="flex items-center gap-1 pb-2 text-xs">
									<Checkbox
										checked={row.is_self_reported}
										onCheckedChange={(checked) =>
											setBenchmarkRows((prev) =>
												prev.map((inner) =>
													inner.id === row.id ? { ...inner, is_self_reported: checked === true } : inner
												)
											)
										}
									/>
									Self-reported
								</label>
							</div>
						</div>
					</div>
				))}

				<div className="space-y-2 rounded-md border p-2">
					<div className="flex items-center justify-between">
						<h3 className="text-xs font-medium">Create benchmark inline</h3>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() =>
								setNewBenchmarkRows((prev) => [
									...prev,
									{
										id: "",
										name: "",
										category: "",
										link: "",
										ascending_order: "",
									},
								])
							}
						>
							<Plus className="mr-1 h-3 w-3" />
							New benchmark
						</Button>
					</div>
					{newBenchmarkRows.map((row, index) => (
						<div key={`new-benchmark-${index}`} className="space-y-2 rounded-md border p-2">
							<div className="grid gap-2 lg:grid-cols-12">
								<label className="text-xs lg:col-span-3">
									<div className="mb-1 text-muted-foreground">Benchmark ID</div>
									<Input
										value={row.id}
										onChange={(event) =>
											setNewBenchmarkRows((prev) =>
												prev.map((inner, innerIndex) =>
													innerIndex === index ? { ...inner, id: event.target.value } : inner
												)
											)
										}
										placeholder="benchmark_id"
										className="h-8 text-xs"
									/>
								</label>
								<label className="text-xs lg:col-span-3">
									<div className="mb-1 text-muted-foreground">Name</div>
									<Input
										value={row.name}
										onChange={(event) =>
											setNewBenchmarkRows((prev) =>
												prev.map((inner, innerIndex) =>
													innerIndex === index ? { ...inner, name: event.target.value } : inner
												)
											)
										}
										placeholder="Name"
										className="h-8 text-xs"
									/>
								</label>
								<label className="text-xs lg:col-span-3">
									<div className="mb-1 text-muted-foreground">Category</div>
									<Input
										value={row.category}
										onChange={(event) =>
											setNewBenchmarkRows((prev) =>
												prev.map((inner, innerIndex) =>
													innerIndex === index ? { ...inner, category: event.target.value } : inner
												)
											)
										}
										placeholder="Category"
										className="h-8 text-xs"
									/>
								</label>
								<label className="text-xs lg:col-span-3">
									<div className="mb-1 text-muted-foreground">Direction</div>
									<select
										value={row.ascending_order}
										onChange={(event) =>
											setNewBenchmarkRows((prev) =>
												prev.map((inner, innerIndex) =>
													innerIndex === index
														? {
																...inner,
																ascending_order: event.target.value as NewBenchmarkDraft["ascending_order"],
															}
														: inner
												)
											)
										}
										className="w-full rounded-md border px-2 py-1.5 text-xs"
									>
										<option value="">No direction</option>
										<option value="higher">Higher is better</option>
										<option value="lower">Lower is better</option>
									</select>
								</label>
							</div>
							<div className="grid gap-2 lg:grid-cols-12">
								<label className="text-xs lg:col-span-11">
									<div className="mb-1 text-muted-foreground">Link</div>
									<Input
										value={row.link}
										onChange={(event) =>
											setNewBenchmarkRows((prev) =>
												prev.map((inner, innerIndex) =>
													innerIndex === index ? { ...inner, link: event.target.value } : inner
												)
											)
										}
										placeholder="https://..."
										className="h-8 text-xs"
									/>
								</label>
								<div className="flex items-end justify-end lg:col-span-1">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() =>
											setNewBenchmarkRows((prev) =>
												prev.filter((_, innerIndex) => innerIndex !== index)
											)
										}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="space-y-3 rounded-lg border p-3">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-medium">Pricing rules</h2>
					<Button type="button" variant="outline" size="sm" onClick={() => addPricingRows([PRICING_METER_OPTIONS[0]?.value ?? "input_text_tokens"])}>
						<Plus className="mr-1 h-4 w-4" />
						Add pricing row
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					Pricing rules are grouped by provider so it is easier to see each provider's current meter set. Picking a meter auto-fills unit and unit size defaults.
				</p>
				<div className="space-y-4">
					{groupedPricingRows.providerGroups.map((group) => (
						<div key={group.providerId} className="space-y-3 rounded-xl border border-border/70 bg-muted/[0.18] p-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div>
									<div className="text-sm font-medium">{group.providerName}</div>
									<p className="text-xs text-muted-foreground">
										{group.rows.length} pricing {group.rows.length === 1 ? "row" : "rows"}
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button type="button" variant="outline" size="sm" onClick={() => addPricingRowsForProvider(group.providerId, [PRICING_METER_OPTIONS[0]?.value ?? "input_text_tokens"])}>
										<Plus className="mr-1 h-4 w-4" />
										Add row
									</Button>
									<Button type="button" variant="outline" size="sm" onClick={() => addPricingRowsForProvider(group.providerId, ["input_text_tokens", "output_text_tokens", "cached_read_text_tokens"])}>
										Add text bundle
									</Button>
									<Button type="button" variant="outline" size="sm" onClick={() => addPricingRowsForProvider(group.providerId, ["input_image_tokens", "output_image_tokens", "cached_read_image_tokens"])}>
										Add image bundle
									</Button>
								</div>
							</div>
							<div className="space-y-2">
								{group.rows.map((row) => (
									<div key={row.id} className="grid gap-2 rounded-md border bg-background p-2 lg:grid-cols-8">
										<select
											value={row.provider_id}
											onChange={(event) => setPricingField(row.id, "provider_id", event.target.value)}
											className="rounded-md border px-2 py-1.5 text-xs"
										>
											<option value="">Provider</option>
											{pricingProviderOptions.map((provider) => (
												<option key={provider.api_provider_id} value={provider.api_provider_id}>
													{provider.api_provider_name ?? provider.api_provider_id}
												</option>
											))}
										</select>
										<Input
											list={`pricing-model-ids-${row.id}`}
											value={row.api_model_id}
											onChange={(event) => setPricingField(row.id, "api_model_id", event.target.value)}
											placeholder="api_model_id"
											className="h-8 text-xs"
										/>
										<datalist id={`pricing-model-ids-${row.id}`}>
											{modelIdOptions.map((option) => (
												<option key={`pricing-${row.id}-${option}`} value={option} />
											))}
										</datalist>
										<select
											value={row.capability_id}
											onChange={(event) => setPricingField(row.id, "capability_id", event.target.value)}
											className="rounded-md border px-2 py-1.5 text-xs"
										>
											{COMMON_CAPABILITIES.map((capability) => (
												<option key={capability} value={capability}>
													{capability}
												</option>
											))}
										</select>
										<select
											value={row.meter}
											onChange={(event) => setPricingField(row.id, "meter", event.target.value)}
											className="rounded-md border px-2 py-1.5 text-xs"
										>
											{PRICING_METER_OPTIONS.map((meter) => (
												<option key={meter.value} value={meter.value}>
													{meter.label}
												</option>
											))}
										</select>
										<Input
											value={row.price_per_unit}
											onChange={(event) => setPricingField(row.id, "price_per_unit", event.target.value)}
											placeholder="Price"
											className="h-8 text-xs"
										/>
										<Input
											value={row.unit}
											onChange={(event) => setPricingField(row.id, "unit", event.target.value)}
											placeholder="Unit"
											className="h-8 text-xs"
										/>
										<Input
											value={row.unit_size}
											onChange={(event) => setPricingField(row.id, "unit_size", event.target.value)}
											placeholder="Unit size"
											className="h-8 text-xs"
										/>
										<div className="flex items-center justify-between gap-2">
											<Input
												value={row.currency}
												onChange={(event) => setPricingField(row.id, "currency", event.target.value)}
												placeholder="USD"
												className="h-8 text-xs"
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												onClick={() => setPricingRows((prev) => prev.filter((inner) => inner.id !== row.id))}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									</div>
								))}
							</div>
						</div>
					))}
					{groupedPricingRows.unassignedRows.length > 0 ? (
						<div className="space-y-2 rounded-xl border border-dashed p-3">
							<div className="text-sm font-medium">Unassigned provider</div>
							{groupedPricingRows.unassignedRows.map((row) => (
								<div key={row.id} className="grid gap-2 rounded-md border bg-background p-2 lg:grid-cols-8">
									<select
										value={row.provider_id}
										onChange={(event) => setPricingField(row.id, "provider_id", event.target.value)}
										className="rounded-md border px-2 py-1.5 text-xs"
									>
										<option value="">Provider</option>
										{pricingProviderOptions.map((provider) => (
											<option key={provider.api_provider_id} value={provider.api_provider_id}>
												{provider.api_provider_name ?? provider.api_provider_id}
											</option>
										))}
									</select>
									<Input
										list={`pricing-model-ids-${row.id}`}
										value={row.api_model_id}
										onChange={(event) => setPricingField(row.id, "api_model_id", event.target.value)}
										placeholder="api_model_id"
										className="h-8 text-xs"
									/>
									<datalist id={`pricing-model-ids-${row.id}`}>
										{modelIdOptions.map((option) => (
											<option key={`pricing-${row.id}-${option}`} value={option} />
										))}
									</datalist>
									<select
										value={row.capability_id}
										onChange={(event) => setPricingField(row.id, "capability_id", event.target.value)}
										className="rounded-md border px-2 py-1.5 text-xs"
									>
										{COMMON_CAPABILITIES.map((capability) => (
											<option key={capability} value={capability}>
												{capability}
											</option>
										))}
									</select>
									<select
										value={row.meter}
										onChange={(event) => setPricingField(row.id, "meter", event.target.value)}
										className="rounded-md border px-2 py-1.5 text-xs"
									>
										{PRICING_METER_OPTIONS.map((meter) => (
											<option key={meter.value} value={meter.value}>
												{meter.label}
											</option>
										))}
									</select>
									<Input
										value={row.price_per_unit}
										onChange={(event) => setPricingField(row.id, "price_per_unit", event.target.value)}
										placeholder="Price"
										className="h-8 text-xs"
									/>
									<Input
										value={row.unit}
										onChange={(event) => setPricingField(row.id, "unit", event.target.value)}
										placeholder="Unit"
										className="h-8 text-xs"
									/>
									<Input
										value={row.unit_size}
										onChange={(event) => setPricingField(row.id, "unit_size", event.target.value)}
										placeholder="Unit size"
										className="h-8 text-xs"
									/>
									<div className="flex items-center justify-between gap-2">
										<Input
											value={row.currency}
											onChange={(event) => setPricingField(row.id, "currency", event.target.value)}
											placeholder="USD"
											className="h-8 text-xs"
										/>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											onClick={() => setPricingRows((prev) => prev.filter((inner) => inner.id !== row.id))}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</div>
							))}
						</div>
					) : null}
				</div>
			</section>

			<div className="flex flex-wrap gap-2">
				<Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
					{isSubmitting ? "Creating..." : "Create model"}
				</Button>
				<Link href="/internal/data/models" className="w-full rounded-md border px-3 py-2 text-center text-sm sm:w-auto">
					Cancel
				</Link>
			</div>
		</form>
	);
}
