"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { UnsavedChangesGuard } from "@/components/(data)/UnsavedChangesGuard";
import { useCatalogFormChanges } from "@/components/(data)/useCatalogFormChanges";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
		inputType: "number",
	},
	{
		key: "output_context_length",
		inputType: "number",
	},
	{
		key: "knowledge_cutoff",
		inputType: "date",
	},
	{
		key: "parameter_count",
		inputType: "text",
	},
	{
		key: "training_tokens",
		inputType: "text",
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

const COMPACT_DETAIL_FIELDS = new Set<DetailFieldKey>(["parameter_count", "training_tokens"]);

function sanitizeDigitInput(value: string): string {
	return value.replace(/[^\d]/g, "");
}

function formatCompactNumberLabel(value: string, formatter: Intl.NumberFormat): string {
	if (!value) return "";
	const normalized = value.replace(/^0+(?=\d)/, "");
	const safe = normalized || "0";
	const numeric = Number(safe);
	if (!Number.isFinite(numeric)) return "";
	return formatter.format(numeric);
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

function formatSubscriptionPlanOption(
	plan: SubscriptionPlanOption,
	locale: string,
	formatFrequency: (frequency: string | null | undefined) => string
): string {
	const name = plan.name?.trim() || plan.plan_id?.trim() || plan.plan_uuid;
	const frequency = formatFrequency(plan.frequency);
	const price =
		typeof plan.price === "number" && Number.isFinite(plan.price)
			? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(plan.price)}${plan.currency ? ` ${plan.currency}` : ""}`
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
	const locale = useLocale();
	const t = useTranslations("Common.ui");
	const tPricing = useTranslations("Catalogue.modelDetail.pricing");
	const compactNumberFormatter = useMemo(
		() => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 2 }),
		[locale]
	);
	const modelStatusLabels: Record<string, string> = {
		Rumoured: t("modelEditor.modelStatuses.rumoured"),
		Announced: t("modelEditor.modelStatuses.announced"),
		Preview: t("modelEditor.modelStatuses.preview"),
		"Limited Access": t("modelEditor.modelStatuses.limitedAccess"),
		Withheld: t("modelEditor.modelStatuses.withheld"),
		Released: t("modelEditor.modelStatuses.released"),
		Deprecated: t("modelEditor.modelStatuses.deprecated"),
		Retired: t("modelEditor.modelStatuses.retired"),
	};
	const modalityLabels: Record<string, string> = {
		text: t("modelCreation.modalities.text"),
		image: t("modelCreation.modalities.image"),
		audio: t("modelCreation.modalities.audio"),
		audio_stt: t("modelCreation.modalities.audioStt"),
		audio_tts: t("modelCreation.modalities.audioTts"),
		audio_music: t("modelCreation.modalities.audioMusic"),
		video: t("modelCreation.modalities.video"),
		embedding: t("modelCreation.modalities.embedding"),
		rerank: t("modelCreation.modalities.rerank"),
		moderation: t("modelCreation.modalities.moderation"),
	};
	const capabilityStatusLabels: Record<string, string> = {
		active: t("modelEditor.capabilityStatuses.active"),
		deranked_lvl1: t("modelEditor.capabilityStatuses.derankedLvl1"),
		deranked_lvl2: t("modelEditor.capabilityStatuses.derankedLvl2"),
		deranked_lvl3: t("modelEditor.capabilityStatuses.derankedLvl3"),
		disabled: t("modelEditor.capabilityStatuses.disabled"),
	};
	const detailFieldLabels: Record<DetailFieldKey, string> = {
		input_context_length: t("modelCreation.form.detailFields.inputContextLength"),
		output_context_length: t("modelCreation.form.detailFields.outputContextLength"),
		knowledge_cutoff: t("modelCreation.form.detailFields.knowledgeCutoff"),
		parameter_count: t("modelCreation.form.detailFields.parameterCount"),
		training_tokens: t("modelCreation.form.detailFields.trainingTokens"),
	};
	const detailFieldPlaceholders: Record<DetailFieldKey, string> = {
		input_context_length: t("modelCreation.form.detailExamples.inputContextLength"),
		output_context_length: t("modelCreation.form.detailExamples.outputContextLength"),
		knowledge_cutoff: t("modelCreation.form.detailFields.knowledgeCutoff"),
		parameter_count: t("modelCreation.form.detailExamples.parameterCount"),
		training_tokens: t("modelCreation.form.detailExamples.trainingTokens"),
	};
	const linkFieldLabels: Record<LinkFieldKey, string> = {
		announcement: t("linkTypes.announcement"),
		api_reference: t("linkTypes.apiReference"),
		model_card: t("modelCreation.form.linkTypes.modelCard"),
		paper: t("linkTypes.researchPaper"),
		playground: t("modelCreation.form.linkTypes.playground"),
		repository: t("modelCreation.form.linkTypes.repository"),
		weights: t("modelCreation.form.linkTypes.weights"),
	};
	const pricingMeterLabel = (meter: string, fallback: string) => {
		const key = `meters.${meter}`;
		return tPricing.has(key as never) ? tPricing(key as never) : fallback;
	};
	const pricingFrequencyLabel = (frequency: string | null | undefined) => {
		const value = frequency?.trim();
		if (!value) return "";
		const key = `sections.${value}`;
		return tPricing.has(key as never) ? tPricing(key as never) : value;
	};
	const [modelId, setModelId] = useState("");
	const { attach: formRef, isDirty, allowSavedNavigation } = useCatalogFormChanges();
	const saved = useRef(false);
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
			toast.error(t("modelCreation.form.selectProviderBeforePricing"));
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
					kind: field.key,
					title: field.label,
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
			loading: t("modelCreation.form.creatingModel"),
			success: t("modelCreation.form.modelCreated"),
			error: () => t("modelCreation.failedCreate"),
		});

		void promise
			.then(() => {
				saved.current = true;
				allowSavedNavigation();
				router.push("/internal/data/models");
			})
			.catch(() => { /* The toast reports the error; keep the draft and guard. */ })
			.finally(() => setIsSubmitting(false));
	};

	return (
		<form ref={formRef} onSubmit={handleSubmit} className="space-y-6 rounded-lg border p-4">
			<UnsavedChangesGuard dirty={isDirty} saving={isSubmitting} allowNavigation={() => saved.current} />
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
				<h2 className="text-sm font-medium">{t("modelCreation.form.core")}</h2>
				<div className="grid gap-4 lg:grid-cols-2">
					<label htmlFor="new-model-model-id" className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("modelCreation.modelId")}</div>
						<Input id="new-model-model-id" name="model_id" value={modelId} onChange={(event) => setModelId(event.target.value)} required />
					</label>
					<label htmlFor="new-model-name" className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("chatComposer.name")}</div>
						<Input id="new-model-name" name="name" required />
					</label>
					<label htmlFor="new-model-organisation" className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">{t("modelCreation.organization")}</div>
						<select
							id="new-model-organisation"
							name="organisation_id"
							required
							defaultValue=""
							className="w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="" disabled>
								{t("modelCreation.selectOrganization")}
							</option>
							{organisations.map((org) => (
								<option key={org.organisation_id} value={org.organisation_id}>
									{org.name ?? org.organisation_id}
								</option>
							))}
						</select>
					</label>
					<label htmlFor="new-model-status" className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("modelCreation.status")}</div>
						<select id="new-model-status" name="status" defaultValue="Released" className="w-full rounded-md border px-3 py-2 text-sm">
							{STATUS_OPTIONS.map((status) => (
								<option key={status} value={status}>
									{modelStatusLabels[status] ?? status}
								</option>
							))}
						</select>
					</label>
					<label htmlFor="new-model-previous-model" className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("modelEditor.previousModel")}</div>
						<select id="new-model-previous-model" name="previous_model_id" className="w-full rounded-md border px-3 py-2 text-sm">
							<option value="">{t("auditDataTable.none")}</option>
							{previousModels.map((previousModel) => (
								<option key={previousModel.model_id} value={previousModel.model_id}>
									{previousModel.name ?? previousModel.model_id}
								</option>
							))}
						</select>
					</label>
					<label htmlFor="new-model-replacement-model" className="text-sm">
						<div className="mb-1 text-muted-foreground">Recommended successor</div>
						<select id="new-model-replacement-model" name="replacement_model_id" className="w-full rounded-md border px-3 py-2 text-sm">
							<option value="">None</option>
							{previousModels.map((successor) => (
								<option key={successor.model_id} value={successor.model_id}>
									{successor.name ?? successor.model_id}
								</option>
							))}
						</select>
						<p className="mt-1 text-xs text-muted-foreground">Shown in deprecation notices; independent of lineage.</p>
					</label>
					<label className="text-sm flex items-center gap-2 self-end">
						<input type="checkbox" name="hidden" />
						<span>{t("modelCreation.hidden")}</span>
					</label>
					<label htmlFor="new-model-release-date" className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("modelCreation.releaseDate")}</div>
						<DatePickerInput
							id="new-model-release-date"
							name="release_date"
							value={releaseDate}
							onChange={setReleaseDate}
							placeholder={t("modelCreation.releaseDate")}
						/>
					</label>
					<label htmlFor="new-model-announcement-date" className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("modelEditor.announcementDate")}</div>
						<DatePickerInput
							id="new-model-announcement-date"
							name="announcement_date"
							value={announcementDate}
							onChange={setAnnouncementDate}
							placeholder={t("modelEditor.announcementDate")}
						/>
					</label>
					<label htmlFor="new-model-deprecation-date" className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("modelEditor.deprecationDate")}</div>
						<DatePickerInput
							id="new-model-deprecation-date"
							name="deprecation_date"
							value={deprecationDate}
							onChange={setDeprecationDate}
							placeholder={t("modelEditor.deprecationDate")}
						/>
					</label>
					<label htmlFor="new-model-retirement-date" className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("modelCreation.retirementDate")}</div>
						<DatePickerInput
							id="new-model-retirement-date"
							name="retirement_date"
							value={retirementDate}
							onChange={setRetirementDate}
							placeholder={t("modelCreation.retirementDate")}
						/>
					</label>
					<div className="text-sm">
						<Label htmlFor="new-model-license" className="mb-1 block text-muted-foreground">
							{t("modelEditor.license")}
						</Label>
						<Input id="new-model-license" name="license" placeholder={t("modelEditor.licenseExample")} />
					</div>
					<div className="text-sm">
								<div className="mb-1 text-muted-foreground">{t("modelEditor.inputTypes")}</div>
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
										{modalityLabels[type] ?? type}
									</Button>
								);
							})}
						</div>
					</div>
					<div className="text-sm">
								<div className="mb-1 text-muted-foreground">{t("modelEditor.outputTypes")}</div>
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
										{modalityLabels[type] ?? type}
									</Button>
								);
							})}
						</div>
					</div>
				</div>
			</section>

			<section className="space-y-3 rounded-lg border p-3">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-medium">{t("modelCreation.form.subscriptionPlans")}</h2>
				</div>
				<p className="text-xs text-muted-foreground">
					{t("modelCreation.form.attachExistingPlans")}
				</p>

				<div className="space-y-2 rounded-md border p-2">
					{subscriptionPlans.length === 0 ? (
						<p className="text-xs text-muted-foreground">{t("modelCreation.form.noExistingPlans")}</p>
					) : null}
					{subscriptionPlans.map((plan) => {
						const checked = selectedPlanUuids.includes(plan.plan_uuid);
						return (
							<label
								key={plan.plan_uuid}
								className="flex items-center justify-between gap-3 rounded-md border px-2 py-1.5 text-xs"
							>
								<span className="truncate">{formatSubscriptionPlanOption(plan, locale, pricingFrequencyLabel)}</span>
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
						<h3 className="text-xs font-medium">{t("modelCreation.form.createPlanInline")}</h3>
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
							{t("modelCreation.form.newPlan")}
						</Button>
					</div>
					{newSubscriptionPlanRows.map((row, index) => (
						<div key={`new-plan-${index}`} className="grid gap-2 rounded-md border p-2 lg:grid-cols-12">
							<label htmlFor={`new-plan-id-${index}`} className="text-xs lg:col-span-3">
								<div className="mb-1 text-muted-foreground">{t("modelCreation.form.planId")}</div>
								<Input
									id={`new-plan-id-${index}`}
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
							<label htmlFor={`new-plan-name-${index}`} className="text-xs lg:col-span-3">
								<div className="mb-1 text-muted-foreground">{t("chatComposer.name")}</div>
								<Input
									id={`new-plan-name-${index}`}
									value={row.name}
									onChange={(event) =>
										setNewSubscriptionPlanRows((prev) =>
											prev.map((inner, innerIndex) =>
												innerIndex === index ? { ...inner, name: event.target.value } : inner
											)
										)
									}
									className="h-8 text-xs"
									placeholder={t("modelCreation.form.planNameExample")}
								/>
							</label>
							<label htmlFor={`new-plan-frequency-${index}`} className="text-xs lg:col-span-2">
								<div className="mb-1 text-muted-foreground">{t("modelCreation.form.frequency")}</div>
								<Input
									id={`new-plan-frequency-${index}`}
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
							<label htmlFor={`new-plan-price-${index}`} className="text-xs lg:col-span-2">
								<div className="mb-1 text-muted-foreground">{t("versionedPricing.price")}</div>
								<Input
									id={`new-plan-price-${index}`}
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
								<label htmlFor={`new-plan-currency-${index}`} className="w-full text-xs">
									<div className="mb-1 text-muted-foreground">{t("versionedPricing.currency")}</div>
									<Input
										id={`new-plan-currency-${index}`}
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
								aria-label={t("actions.remove")}
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
				<h2 className="text-sm font-medium">{t("modelCreation.form.family")}</h2>
				<div className="grid gap-3 lg:grid-cols-2">
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("modelCreation.form.existingFamily")}</div>
						<select
							name="family_id"
							value={selectedFamilyId}
							onChange={(event) => setSelectedFamilyId(event.target.value)}
							className="w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="">{t("auditDataTable.none")}</option>
							{families.map((family) => (
								<option key={family.family_id} value={family.family_id}>
									{family.family_name ?? family.family_id}
								</option>
							))}
						</select>
					</label>
					<div className="text-sm">
						<Label htmlFor="new-family-name" className="mb-1 block text-muted-foreground">
							{t("modelCreation.form.newFamilyName")}
						</Label>
						<Input
							id="new-family-name"
							value={newFamilyName}
							onChange={(event) => {
								setNewFamilyName(event.target.value);
								if (event.target.value.trim()) setSelectedFamilyId("");
							}}
											placeholder={t("modelCreation.displayNameExample")}
						/>
					</div>
					<div className="text-sm">
						<Label htmlFor="new-family-id" className="mb-1 block text-muted-foreground">
							{t("modelCreation.form.newFamilyIdOptional")}
						</Label>
						<Input
							id="new-family-id"
							value={newFamilyId}
							onChange={(event) => setNewFamilyId(event.target.value)}
							placeholder="gpt-4"
						/>
					</div>
					<div className="text-sm lg:col-span-2">
						<Label htmlFor="new-family-description" className="mb-1 block text-muted-foreground">
							{t("modelCreation.form.newFamilyDescription")}
						</Label>
						<textarea
							id="new-family-description"
							aria-label={t("modelCreation.form.newFamilyDescription")}
							value={newFamilyDescription}
							onChange={(event) => setNewFamilyDescription(event.target.value)}
							className="min-h-20 w-full rounded-md border px-3 py-2 text-sm"
						/>
					</div>
				</div>
			</section>

			<section className="space-y-3 rounded-lg border p-3">
				<h2 className="text-sm font-medium">{t("modelCreation.form.detailsAndLinks")}</h2>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("editorTabs.details")}</Label>
						<div className="grid gap-3 lg:grid-cols-2">
							{MODEL_DETAIL_FIELDS.map((field) => {
								const isCompactField = COMPACT_DETAIL_FIELDS.has(field.key);
								const compactLabel = isCompactField
									? formatCompactNumberLabel(detailValues[field.key], compactNumberFormatter)
									: "";

								return (
									<label key={field.key} className="text-sm">
										<div className="mb-1 text-muted-foreground">{detailFieldLabels[field.key]}</div>
										{field.inputType === "date" ? (
											<DatePickerInput
												value={detailValues[field.key]}
												onChange={(value) =>
													setDetailValues((prev) => ({
														...prev,
														[field.key]: value,
													}))
												}
												placeholder={detailFieldPlaceholders[field.key]}
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
													placeholder={detailFieldPlaceholders[field.key]}
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
												placeholder={detailFieldPlaceholders[field.key]}
											/>
										)}
									</label>
								);
							})}
						</div>
					</div>

					<div className="space-y-2 border-t pt-3">
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("editorTabs.links")}</Label>
						<div className="grid gap-3 lg:grid-cols-2">
							{MODEL_LINK_FIELDS.map((field) => (
								<label key={field.key} className="text-sm">
									<div className="mb-1 text-muted-foreground">{linkFieldLabels[field.key]}</div>
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
					<h2 className="text-sm font-medium">{t("modelCreation.form.providerAvailabilityAndCapabilities")}</h2>
					<p className="text-xs text-muted-foreground">{t("modelCreation.form.toggleAvailability")}</p>
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
									<div className="mb-1 text-muted-foreground">{t("versionedPricing.provider")}</div>
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
								<div className="text-xs">
									<Label htmlFor={`provider-public-model-${providerRow.id}`} className="mb-1 block text-muted-foreground">
										{t("modelEditor.publicModelId")}
									</Label>
									<Input
										id={`provider-public-model-${providerRow.id}`}
										value={providerRow.api_model_id}
										onChange={(event) =>
											setProviderRows((prev) =>
												prev.map((row) =>
													row.id === providerRow.id ? { ...row, api_model_id: event.target.value } : row
												)
											)
										}
										className="h-8 text-xs"
										placeholder="organisation/model-id"
									/>
								</div>
								<div className="text-xs">
									<Label htmlFor={`provider-model-id-${providerRow.id}`} className="mb-1 block text-muted-foreground">
										{t("modelEditor.providerModelId")}
									</Label>
									<Input
										id={`provider-model-id-${providerRow.id}`}
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
								</div>
								<div className="text-xs">
									<Label htmlFor={`provider-internal-model-${providerRow.id}`} className="mb-1 block text-muted-foreground">
										{t("modelEditor.internalModelId")}
									</Label>
									<Input id={`provider-internal-model-${providerRow.id}`} value={modelId} readOnly disabled className="h-8 text-xs" />
								</div>
								<div className="flex items-end justify-between gap-2">
									<label htmlFor={`provider-active-${providerRow.id}`} className="flex items-center gap-2 text-xs">
										<Checkbox
											id={`provider-active-${providerRow.id}`}
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
										{t("modelEditor.gatewayActive")}
									</label>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={t("actions.remove")}
										onClick={() => setProviderRows((prev) => prev.filter((row) => row.id !== providerRow.id))}
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							</div>

							<div className="grid gap-2 lg:grid-cols-3">
								<label htmlFor={`provider-quant-${providerRow.id}`} className="text-xs">
									<div className="mb-1 text-muted-foreground">{t("modelEditor.quantizationScheme")}</div>
									<Input
										id={`provider-quant-${providerRow.id}`}
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
										placeholder={t("modelEditor.quantizationExample")}
									/>
								</label>
								<label htmlFor={`provider-context-${providerRow.id}`} className="text-xs">
									<div className="mb-1 text-muted-foreground">{t("modelEditor.inputContextLength")}</div>
									<Input
										id={`provider-context-${providerRow.id}`}
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
										placeholder={t("modelCreation.form.detailExamples.providerContextLength")}
									/>
								</label>
								<label htmlFor={`provider-max-output-${providerRow.id}`} className="text-xs">
									<div className="mb-1 text-muted-foreground">{t("modelEditor.maxOutputTokens")}</div>
									<Input
										id={`provider-max-output-${providerRow.id}`}
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
										placeholder={t("modelCreation.form.detailExamples.providerMaxOutput")}
									/>
								</label>
							</div>

							<div className="grid gap-2 lg:grid-cols-2">
								<div>
									<Label className="mb-1 block text-xs text-muted-foreground">{t("modelCreation.inputModalities")}</Label>
									<div className="flex flex-wrap gap-2">
										{MODALITY_OPTIONS.map((modality) => (
											<label key={`${providerRow.id}-in-${modality}`} className="flex items-center gap-1 text-xs">
												<Checkbox
													checked={providerRow.input_modalities.includes(modality)}
													onCheckedChange={(checked) =>
														toggleModality(providerRow.id, "input_modalities", modality, checked === true)
													}
												/>
												{modalityLabels[modality] ?? modality}
											</label>
										))}
									</div>
								</div>
								<div>
									<Label className="mb-1 block text-xs text-muted-foreground">{t("modelCreation.outputModalities")}</Label>
									<div className="flex flex-wrap gap-2">
										{MODALITY_OPTIONS.map((modality) => (
											<label key={`${providerRow.id}-out-${modality}`} className="flex items-center gap-1 text-xs">
												<Checkbox
													checked={providerRow.output_modalities.includes(modality)}
													onCheckedChange={(checked) =>
														toggleModality(providerRow.id, "output_modalities", modality, checked === true)
													}
												/>
												{modalityLabels[modality] ?? modality}
											</label>
										))}
									</div>
								</div>
							</div>

							<div className="space-y-2 rounded-md border p-2">
								<div className="flex items-center justify-between">
									<h3 className="text-xs font-medium">{t("modelEditor.capabilities")}</h3>
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
										{t("modelEditor.addCapability")}
									</Button>
								</div>

								{providerRow.capabilities.map((capability) => (
									<div key={capability.id} className="space-y-2 rounded-md border p-2">
										<div className="grid gap-2 lg:grid-cols-4">
											<label className="text-xs">
												<div className="mb-1 text-muted-foreground">{t("modelCreation.form.endpoint")}</div>
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
												<div className="mb-1 text-muted-foreground">{t("modelCreation.status")}</div>
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
															{capabilityStatusLabels[status] ?? status}
														</option>
													))}
												</select>
											</label>
											<div className="flex items-end justify-between gap-2">
												<Button
													type="button"
										variant="ghost"
										size="icon"
										aria-label={t("actions.remove")}
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
										<Label className="mb-1 block text-xs text-muted-foreground">{t("modelEditor.supportedParams")}</Label>
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
				<h2 className="text-sm font-medium">{t("auditDataTable.benchmarks")}</h2>
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
						{t("modelEditor.advanced.benchmarks.addResult")}
					</Button>
				</div>
				{benchmarkRows.map((row) => (
					<div key={row.id} className="space-y-2 rounded-md border p-2">
						<div className="grid gap-2 lg:grid-cols-12">
							<label htmlFor={`benchmark-select-${row.id}`} className="text-xs lg:col-span-5">
								<div className="mb-1 text-muted-foreground">{t("benchmarkComparison.benchmark")}</div>
								<select
									id={`benchmark-select-${row.id}`}
									value={row.benchmark_id}
									onChange={(event) =>
										setBenchmarkRows((prev) =>
											prev.map((inner) => (inner.id === row.id ? { ...inner, benchmark_id: event.target.value } : inner))
										)
									}
									className="w-full rounded-md border px-2 py-1.5 text-xs"
								>
					<option value="">{t("benchmarkComparison.selectBenchmark")}</option>
									{benchmarkOptions.map((option) => (
										<option key={option.id} value={option.id}>
											{option.name}
										</option>
									))}
								</select>
							</label>
							<label htmlFor={`benchmark-score-${row.id}`} className="text-xs lg:col-span-2">
								<div className="mb-1 text-muted-foreground">{t("modelEditor.advanced.benchmarks.score")}</div>
								<Input
									id={`benchmark-score-${row.id}`}
									value={row.score}
									onChange={(event) =>
										setBenchmarkRows((prev) =>
											prev.map((inner) => (inner.id === row.id ? { ...inner, score: event.target.value } : inner))
										)
									}
					placeholder={t("modelEditor.advanced.benchmarks.score")}
									className="h-8 text-xs"
								/>
							</label>
							<div className="flex items-end justify-end lg:col-span-3">
								<Button
									type="button"
								variant="ghost"
								size="icon"
								aria-label={t("actions.remove")}
								onClick={() => setBenchmarkRows((prev) => prev.filter((inner) => inner.id !== row.id))}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						</div>

						<div className="grid gap-2 lg:grid-cols-12">
							<label htmlFor={`benchmark-source-${row.id}`} className="text-xs lg:col-span-6">
								<div className="mb-1 text-muted-foreground">{t("modelEditor.advanced.benchmarks.sourceLink")}</div>
								<Input
									id={`benchmark-source-${row.id}`}
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
							<label htmlFor={`benchmark-variant-${row.id}`} className="text-xs lg:col-span-3">
								<div className="mb-1 text-muted-foreground">{t("modelCreation.form.variant")}</div>
								<Input
									id={`benchmark-variant-${row.id}`}
									value={row.variant}
									onChange={(event) =>
										setBenchmarkRows((prev) =>
											prev.map((inner) => (inner.id === row.id ? { ...inner, variant: event.target.value } : inner))
										)
									}
										placeholder={t("modelCreation.form.detailExamples.benchmarkVariant")}
									className="h-8 text-xs"
								/>
							</label>
							<div className="flex items-end lg:col-span-3">
								<label htmlFor={`benchmark-self-${row.id}`} className="flex items-center gap-1 pb-2 text-xs">
									<Checkbox
										id={`benchmark-self-${row.id}`}
										checked={row.is_self_reported}
										onCheckedChange={(checked) =>
											setBenchmarkRows((prev) =>
												prev.map((inner) =>
													inner.id === row.id ? { ...inner, is_self_reported: checked === true } : inner
												)
											)
										}
									/>
									{t("benchmarkComparison.selfReported")}
								</label>
							</div>
						</div>
					</div>
				))}

				<div className="space-y-2 rounded-md border p-2">
					<div className="flex items-center justify-between">
						<h3 className="text-xs font-medium">{t("modelCreation.form.createBenchmarkInline")}</h3>
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
							{t("modelCreation.form.newBenchmark")}
						</Button>
					</div>
					{newBenchmarkRows.map((row, index) => (
						<div key={`new-benchmark-${index}`} className="space-y-2 rounded-md border p-2">
							<div className="grid gap-2 lg:grid-cols-12">
								<div className="text-xs lg:col-span-3">
									<Label htmlFor={`new-benchmark-id-${row.id}`} className="mb-1 block text-muted-foreground">
										{t("modelCreation.form.benchmarkId")}
									</Label>
									<Input
										id={`new-benchmark-id-${row.id}`}
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
								</div>
								<div className="text-xs lg:col-span-3">
									<Label htmlFor={`new-benchmark-name-${row.id}`} className="mb-1 block text-muted-foreground">
									{t("chatComposer.name")}
									</Label>
									<Input
										id={`new-benchmark-name-${row.id}`}
										value={row.name}
										onChange={(event) =>
											setNewBenchmarkRows((prev) =>
												prev.map((inner, innerIndex) =>
													innerIndex === index ? { ...inner, name: event.target.value } : inner
												)
											)
										}
										placeholder={t("chatComposer.name")}
										className="h-8 text-xs"
									/>
								</div>
								<div className="text-xs lg:col-span-3">
									<Label htmlFor={`new-benchmark-category-${row.id}`} className="mb-1 block text-muted-foreground">
									{t("modelCreation.form.category")}
									</Label>
									<Input
										id={`new-benchmark-category-${row.id}`}
										value={row.category}
										onChange={(event) =>
											setNewBenchmarkRows((prev) =>
												prev.map((inner, innerIndex) =>
													innerIndex === index ? { ...inner, category: event.target.value } : inner
												)
											)
										}
										placeholder={t("modelCreation.form.category")}
										className="h-8 text-xs"
									/>
								</div>
								<div className="text-xs lg:col-span-3">
									<Label htmlFor={`new-benchmark-direction-${row.id}`} className="mb-1 block text-muted-foreground">
									{t("modelCreation.form.direction")}
									</Label>
									<select
										id={`new-benchmark-direction-${row.id}`}
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
										<option value="">{t("modelCreation.form.noDirection")}</option>
										<option value="higher">{t("modelCreation.form.higherIsBetter")}</option>
										<option value="lower">{t("benchmarkComparison.lowerIsBetter")}</option>
									</select>
								</div>
							</div>
							<div className="grid gap-2 lg:grid-cols-12">
								<div className="text-xs lg:col-span-11">
									<Label htmlFor={`new-benchmark-link-${row.id}`} className="mb-1 block text-muted-foreground">
										{t("modelCreation.form.link")}
									</Label>
									<Input
										id={`new-benchmark-link-${row.id}`}
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
								</div>
								<div className="flex items-end justify-end lg:col-span-1">
									<Button
										type="button"
										variant="ghost"
										size="icon"
										aria-label={t("actions.remove")}
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
					<h2 className="text-sm font-medium">{t("modelEditor.pricingRules")}</h2>
					<Button type="button" variant="outline" size="sm" onClick={() => addPricingRows([PRICING_METER_OPTIONS[0]?.value ?? "input_text_tokens"])}>
						<Plus className="mr-1 h-4 w-4" />
						{t("modelCreation.form.addPricingRow")}
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					{t("modelCreation.form.pricingRulesDescription")}
				</p>
				<div className="space-y-4">
					{groupedPricingRows.providerGroups.map((group) => (
						<div key={group.providerId} className="space-y-3 rounded-xl border border-border/70 bg-muted/[0.18] p-3">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<div>
									<div className="text-sm font-medium">{group.providerName}</div>
									<p className="text-xs text-muted-foreground">
										{t("modelCreation.form.pricingRowCount", { count: group.rows.length })}
									</p>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button type="button" variant="outline" size="sm" onClick={() => addPricingRowsForProvider(group.providerId, [PRICING_METER_OPTIONS[0]?.value ?? "input_text_tokens"])}>
										<Plus className="mr-1 h-4 w-4" />
										{t("modelCreation.form.addRow")}
									</Button>
									<Button type="button" variant="outline" size="sm" onClick={() => addPricingRowsForProvider(group.providerId, ["input_text_tokens", "output_text_tokens", "cached_read_text_tokens"])}>
										{t("modelCreation.form.addTextBundle")}
									</Button>
									<Button type="button" variant="outline" size="sm" onClick={() => addPricingRowsForProvider(group.providerId, ["input_image_tokens", "output_image_tokens", "cached_read_image_tokens"])}>
										{t("modelCreation.form.addImageBundle")}
									</Button>
								</div>
							</div>
							<div className="space-y-2">
								{group.rows.map((row) => (
									<div key={row.id} className="grid gap-2 rounded-md border bg-background p-2 lg:grid-cols-8">
									<select
										aria-label={t("versionedPricing.provider")}
										value={row.provider_id}
										onChange={(event) => setPricingField(row.id, "provider_id", event.target.value)}
										className="rounded-md border px-2 py-1.5 text-xs"
									>
											<option value="">{t("versionedPricing.provider")}</option>
											{pricingProviderOptions.map((provider) => (
												<option key={provider.api_provider_id} value={provider.api_provider_id}>
													{provider.api_provider_name ?? provider.api_provider_id}
												</option>
											))}
										</select>
									<Input
										aria-label={t("modelEditor.publicModelId")}
										value={row.api_model_id}
										onChange={(event) => setPricingField(row.id, "api_model_id", event.target.value)}
										placeholder="api_model_id"
										className="h-8 text-xs"
									/>
									<select
										aria-label={t("modelEditor.capability")}
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
										aria-label={t("modelEditor.meter")}
										value={row.meter}
										onChange={(event) => setPricingField(row.id, "meter", event.target.value)}
										className="rounded-md border px-2 py-1.5 text-xs"
									>
											{PRICING_METER_OPTIONS.map((meter) => (
												<option key={meter.value} value={meter.value}>
													{pricingMeterLabel(meter.value, meter.label)}
												</option>
											))}
										</select>
									<Input
										aria-label={t("modelEditor.pricePerUnit")}
										value={row.price_per_unit}
										onChange={(event) => setPricingField(row.id, "price_per_unit", event.target.value)}
										placeholder={t("versionedPricing.price")}
										className="h-8 text-xs"
									/>
									<Input
										aria-label={t("versionedPricing.unit")}
										value={row.unit}
										onChange={(event) => setPricingField(row.id, "unit", event.target.value)}
										placeholder={t("versionedPricing.unit")}
										className="h-8 text-xs"
									/>
									<Input
										aria-label={t("modelEditor.unitSize")}
										value={row.unit_size}
										onChange={(event) => setPricingField(row.id, "unit_size", event.target.value)}
										placeholder={t("modelEditor.unitSize")}
										className="h-8 text-xs"
									/>
									<div className="flex items-center justify-between gap-2">
										<Input
											aria-label={t("versionedPricing.currency")}
											value={row.currency}
											onChange={(event) => setPricingField(row.id, "currency", event.target.value)}
											placeholder="USD"
											className="h-8 text-xs"
										/>
											<Button
												type="button"
									variant="ghost"
									size="icon"
									aria-label={t("actions.remove")}
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
							<div className="text-sm font-medium">{t("modelCreation.form.unassignedProvider")}</div>
							{groupedPricingRows.unassignedRows.map((row) => (
								<div key={row.id} className="grid gap-2 rounded-md border bg-background p-2 lg:grid-cols-8">
									<select
										aria-label={t("versionedPricing.provider")}
										value={row.provider_id}
										onChange={(event) => setPricingField(row.id, "provider_id", event.target.value)}
										className="rounded-md border px-2 py-1.5 text-xs"
									>
										<option value="">{t("versionedPricing.provider")}</option>
										{pricingProviderOptions.map((provider) => (
											<option key={provider.api_provider_id} value={provider.api_provider_id}>
												{provider.api_provider_name ?? provider.api_provider_id}
											</option>
										))}
									</select>
									<Input
										aria-label={t("modelEditor.publicModelId")}
										value={row.api_model_id}
										onChange={(event) => setPricingField(row.id, "api_model_id", event.target.value)}
										placeholder="api_model_id"
										className="h-8 text-xs"
									/>
									<select
										aria-label={t("modelEditor.capability")}
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
										aria-label={t("modelEditor.meter")}
										value={row.meter}
										onChange={(event) => setPricingField(row.id, "meter", event.target.value)}
										className="rounded-md border px-2 py-1.5 text-xs"
									>
										{PRICING_METER_OPTIONS.map((meter) => (
											<option key={meter.value} value={meter.value}>
												{pricingMeterLabel(meter.value, meter.label)}
											</option>
										))}
									</select>
									<Input
										aria-label={t("modelEditor.pricePerUnit")}
										value={row.price_per_unit}
										onChange={(event) => setPricingField(row.id, "price_per_unit", event.target.value)}
										placeholder={t("versionedPricing.price")}
										className="h-8 text-xs"
									/>
									<Input
										aria-label={t("versionedPricing.unit")}
										value={row.unit}
										onChange={(event) => setPricingField(row.id, "unit", event.target.value)}
										placeholder={t("versionedPricing.unit")}
										className="h-8 text-xs"
									/>
									<Input
										aria-label={t("modelEditor.unitSize")}
										value={row.unit_size}
										onChange={(event) => setPricingField(row.id, "unit_size", event.target.value)}
										placeholder={t("modelEditor.unitSize")}
										className="h-8 text-xs"
									/>
									<div className="flex items-center justify-between gap-2">
										<Input
											aria-label={t("versionedPricing.currency")}
											value={row.currency}
											onChange={(event) => setPricingField(row.id, "currency", event.target.value)}
											placeholder="USD"
											className="h-8 text-xs"
										/>
										<Button
											type="button"
								variant="ghost"
								size="icon"
								aria-label={t("actions.remove")}
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
					{isSubmitting ? t("modelCreation.form.creatingModel") : t("modelCreation.title")}
				</Button>
				<Link href="/internal/data/models" className="w-full rounded-md border px-3 py-2 text-center text-sm sm:w-auto">
					{t("modelCreation.cancel")}
				</Link>
			</div>
		</form>
	);
}
