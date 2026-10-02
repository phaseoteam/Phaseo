"use client";

import { settingsStringKey } from "@/i18n/settings-string-keys";
import { resolveProviderDisplayName } from "@/lib/providers/providerOffers";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Search,
	Plus,
	Settings2,
	Check,
	X,
	Shield,
	Sliders,
	ChevronRight,
	ChevronLeft,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { createPresetAction, updatePresetAction } from "@/app/(dashboard)/settings/presets/actions";
import { useSettingsRouter as useRouter } from "../PrivateSettingsQuery";
import type { ModelCard } from "@/lib/fetchers/models/getAllModels";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SortablePresetList } from "./SortablePresetList";
import { useTranslations } from "next-intl";
import { localizedSettingsError } from "@/i18n/error-messages";

interface APIProviderCard {
	api_provider_id: string;
	api_provider_name: string;
	country_code: string;
	active_models: number;
}

interface PresetFormProps {
	models: ModelCard[];
	providers: APIProviderCard[];
	currentUserId?: string | null;
	currentTeamId?: string | null;
	workspacePublisher?: { handle: string | null; canManage: boolean };
	initialPreset?: any;
}

type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
type PresetVisibility = "private" | "team" | "public";
type PresetRoutingMode = "balanced" | "price" | "latency" | "throughput";
type ResponseHealingMode = "safe" | "strict";
type PresetEditorView =
	| "overview"
	| "defaults"
	| "plugins"
	| "providers"
	| "parameters"
	| "reasoning";

const EXCLUDED_STATUSES = ["retired", "rumoured", "deprecated"];
const REASONING_LABELS: Record<ReasoningEffort, string> = { none: "None", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra High", max: "Maximum" };

const PROVIDER_TO_LOGO_MAP: Record<string, string> = {
	"openai": "openai",
	"anthropic": "anthropic",
	"google": "google",
	"deepseek": "deepseek",
	"xai": "xai",
	"mistral": "mistral",
	"cohere": "cohere",
	"huggingface": "huggingface",
	"azure": "azure",
	"bedrock": "amazon-bedrock",
	"groq": "groq",
	"perplexity": "perplexity",
	"alibaba": "alibaba",
	"meta": "meta",
	"amazon": "amazon",
	"cloudflare": "cloudflare",
	"cerebras": "cerebras",
	"fireworks": "fireworks",
	"ai21": "ai21",
	"sambanova": "sambanova",
	"nvidia": "nvidia",
	"together": "together",
	"hyperbolic": "hyperbolic",
	"nebius": "nebius-token-factory",
	"moonshot": "moonshotai",
	"moonshotai": "moonshotai",
};

function getProviderLogoId(name: string): string {
	const normalized = name.toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
	return PROVIDER_TO_LOGO_MAP[normalized] || normalized;
}

function buildPresetSlugPreview(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^@+/, "")
		.replace(/[^a-z0-9._:-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^[-._:]+|[-._:]+$/g, "");
}

function parseThresholdInputs(values: {
	p50: string;
	p75: string;
	p90: string;
	p99: string;
}): Record<string, number> | null {
	const parsed = Object.fromEntries(
		Object.entries(values)
			.map(([key, value]) => [key, Number.parseFloat(value)])
			.filter(([, value]) => Number.isFinite(value as number) && (value as number) >= 0),
	);
	return Object.keys(parsed).length > 0 ? parsed : null;
}

function FormSection({
	icon,
	title,
	description,
	children,
	stacked = false,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	children: React.ReactNode;
	stacked?: boolean;
}) {
	if (stacked) {
		return (
			<section className="space-y-4">
				<div className="space-y-2">
					<div className="flex items-center gap-2 font-semibold">
						{icon}
						<span>{title}</span>
					</div>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
				<div className="space-y-4">{children}</div>
			</section>
		);
	}

	return (
		<section className="space-y-4">
			<div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
				<div className="space-y-2">
					<div className="flex items-center gap-2 font-semibold">
						{icon}
						<span>{title}</span>
					</div>
					<p className="text-sm text-muted-foreground">{description}</p>
				</div>
				<div className="space-y-4">{children}</div>
			</div>
		</section>
	);
}

function SectionLinkRow({
	title,
	description,
	summary,
	onClick,
}: {
	title: string;
	description: string;
	summary: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex w-full items-start justify-between gap-4 border-b border-border/70 px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-muted/20"
		>
			<div className="min-w-0">
				<div className="text-sm font-medium">{title}</div>
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			</div>
			<div className="flex items-center gap-3 pl-4">
				<span className="max-w-[220px] text-right text-xs text-muted-foreground">
					{summary}
				</span>
				<ChevronRight className="h-4 w-4 text-muted-foreground" />
			</div>
		</button>
	);
}

export default function PresetForm({
	models,
	providers,
	currentUserId,
	currentTeamId,
	workspacePublisher,
	initialPreset,
}: PresetFormProps) {
	const t = useTranslations("SettingsUI");
	const numberExamplePlaceholder = (value: string) =>
		t("strings.numberExamplePlaceholder" as never, { value } as never);
	const initialConfig = initialPreset?.config ?? {};
	const initialProvider = initialConfig.provider ?? {};
	const initialParameters = initialConfig.parameters ?? {};
	const initialReasoning = initialConfig.reasoning ?? {};
	const initialResponseCaching = initialConfig.response_caching ?? {};
	const initialHealingPlugin = Array.isArray(initialConfig.plugins)
		? initialConfig.plugins.find((plugin: any) => plugin?.id === "response-healing")
		: null;
	const asInputValue = (value: unknown) => value === null || value === undefined ? "" : String(value);
	const [loading, setLoading] = useState(false);
	const [activeView, setActiveView] = useState<PresetEditorView>("overview");
	const [modelSearch, setModelSearch] = useState("");
	const [providerSearch, setProviderSearch] = useState("");
	const [blockedProviderSearch, setBlockedProviderSearch] = useState("");

	const [name, setName] = useState(String(initialPreset?.name ?? "").replace(/^@+/, ""));
	const [slug, setSlug] = useState(String(initialPreset?.slug ?? ""));
	const [slugEdited, setSlugEdited] = useState(() => {
		const initialName = String(initialPreset?.name ?? "").replace(/^@+/, "");
		const initialSlug = String(initialPreset?.slug ?? "");
		return Boolean(initialSlug && initialSlug !== buildPresetSlugPreview(initialName));
	});
	const [description, setDescription] = useState(String(initialPreset?.description ?? ""));
	const [systemPrompt, setSystemPrompt] = useState(String(initialConfig.system_prompt ?? ""));
	const [visibility, setVisibility] = useState<PresetVisibility>(initialPreset?.visibility ?? "team");
	const [routingMode, setRoutingMode] = useState<PresetRoutingMode>(initialConfig.routing_mode ?? "balanced");
	const router = useRouter();

	const [selectedModels, setSelectedModels] = useState<string[]>(Array.isArray(initialConfig.models) ? initialConfig.models : []);
	const [showModelPicker, setShowModelPicker] = useState(false);
	const [providerOrder, setProviderOrder] = useState<string[]>(Array.isArray(initialProvider.order) ? initialProvider.order : Array.isArray(initialConfig.only_providers) ? initialConfig.only_providers : []);
	const [providerIgnore, setProviderIgnore] = useState<string[]>(Array.isArray(initialProvider.ignore) ? initialProvider.ignore : Array.isArray(initialConfig.ignore_providers) ? initialConfig.ignore_providers : []);
	const [showProviderPicker, setShowProviderPicker] = useState(false);
	const [showBlockedProviderPicker, setShowBlockedProviderPicker] = useState(false);
	const [maxPricePrompt, setMaxPricePrompt] = useState(asInputValue(initialProvider.max_price?.prompt));
	const [maxPriceCompletion, setMaxPriceCompletion] = useState(asInputValue(initialProvider.max_price?.completion));
	const [throughputP50, setThroughputP50] = useState(asInputValue(initialProvider.preferred_min_throughput?.p50));
	const [throughputP75, setThroughputP75] = useState(asInputValue(initialProvider.preferred_min_throughput?.p75));
	const [throughputP90, setThroughputP90] = useState(asInputValue(initialProvider.preferred_min_throughput?.p90));
	const [throughputP99, setThroughputP99] = useState(asInputValue(initialProvider.preferred_min_throughput?.p99));
	const [latencyP50, setLatencyP50] = useState(asInputValue(initialProvider.preferred_max_latency?.p50));
	const [latencyP75, setLatencyP75] = useState(asInputValue(initialProvider.preferred_max_latency?.p75));
	const [latencyP90, setLatencyP90] = useState(asInputValue(initialProvider.preferred_max_latency?.p90));
	const [latencyP99, setLatencyP99] = useState(asInputValue(initialProvider.preferred_max_latency?.p99));
	const [requiredExecutionRegion, setRequiredExecutionRegion] = useState(String(initialProvider.required_execution_region ?? ""));
	const [requiredDataRegion, setRequiredDataRegion] = useState(String(initialProvider.required_data_region ?? ""));
	const [requireZeroDataRetention, setRequireZeroDataRetention] = useState(Boolean(initialProvider.require_zero_data_retention));

	const [temperature, setTemperature] = useState(asInputValue(initialParameters.temperature));
	const [topP, setTopP] = useState(asInputValue(initialParameters.top_p));
	const [topK, setTopK] = useState(asInputValue(initialParameters.top_k));
	const [frequencyPenalty, setFrequencyPenalty] = useState(asInputValue(initialParameters.frequency_penalty));
	const [presencePenalty, setPresencePenalty] = useState(asInputValue(initialParameters.presence_penalty));
	const [repetitionPenalty, setRepetitionPenalty] = useState(asInputValue(initialParameters.repetition_penalty));
	const [maxTokens, setMaxTokens] = useState(asInputValue(initialParameters.max_tokens));
	const [seed, setSeed] = useState(asInputValue(initialParameters.seed));

	const [reasoningEnabled, setReasoningEnabled] = useState(Boolean(initialReasoning.enabled));
	const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(initialReasoning.effort ?? "medium");
	const [reasoningMaxTokens, setReasoningMaxTokens] = useState(asInputValue(initialReasoning.max_tokens));
	const [excludeReasoningTokens, setExcludeReasoningTokens] = useState(Boolean(initialReasoning.exclude_from_output));
	const [responseHealingEnabled, setResponseHealingEnabled] = useState(Boolean(initialHealingPlugin && initialHealingPlugin.enabled !== false));
	const [responseHealingMode, setResponseHealingMode] =
		useState<ResponseHealingMode>(initialHealingPlugin?.mode === "strict" ? "strict" : "safe");
	const [responseCachingEnabled, setResponseCachingEnabled] = useState(Boolean(initialResponseCaching.enabled));
	const [responseCachingTtl, setResponseCachingTtl] = useState(asInputValue(initialResponseCaching.ttl_seconds || 300));

	const activeModels = useMemo(() => {
		return models
			.filter((model) => !EXCLUDED_STATUSES.includes((model.status || "").toLowerCase()))
			.sort((left, right) => {
				const organisationOrder = (left.organisation_name ?? "\uffff").localeCompare(right.organisation_name ?? "\uffff", undefined, { sensitivity: "base" });
				return organisationOrder || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
			});
	}, [models]);

	const providerList = useMemo(() => {
		return providers
			.filter((provider) => provider.active_models > 0)
			.map((p) => ({
				id: p.api_provider_id,
				name: resolveProviderDisplayName({ providerId: p.api_provider_id, providerName: p.api_provider_name }),
				logoId: getProviderLogoId(p.api_provider_name),
			}))
			.filter((p) => p.id.length > 0);
	}, [providers]);

	const selectedModelOptions = useMemo(() => selectedModels.map((id) => {
		const model = activeModels.find((entry) => entry.model_id === id);
		const organisationName = model?.organisation_name ?? null;
		return {
			id,
			label: model?.name ?? id,
			icon: organisationName ? <Logo id={model?.organisation_id ?? organisationName} className="h-5 w-5 rounded-sm object-contain" alt={organisationName} width={20} height={20} /> : undefined,
		};
	}), [selectedModels, activeModels]);

	const selectedProviderOptions = useMemo(() => providerOrder.map((id) => {
		const provider = providerList.find((entry) => entry.id === id);
		return {
			id,
			label: provider?.name ?? id,
			icon: provider ? <Logo id={provider.logoId} className="h-5 w-5 rounded-sm object-contain" alt={provider.name} width={20} height={20} /> : undefined,
		};
	}), [providerOrder, providerList]);

	const filteredModels = useMemo(() => {
		if (!modelSearch.trim()) return activeModels;
		const search = modelSearch.toLowerCase();
		return activeModels.filter(
			(m) =>
				m.name.toLowerCase().includes(search) ||
				m.organisation_name?.toLowerCase().includes(search)
		);
	}, [activeModels, modelSearch]);

	const filteredProviders = useMemo(() => {
		if (!providerSearch.trim()) return providerList;
		const search = providerSearch.toLowerCase();
		return providerList.filter((p) => p.name.toLowerCase().includes(search));
	}, [providerList, providerSearch]);

	const filteredBlockedProviders = useMemo(() => {
		if (!blockedProviderSearch.trim()) return providerList;
		const search = blockedProviderSearch.toLowerCase();
		return providerList.filter((provider) => provider.name.toLowerCase().includes(search));
	}, [providerList, blockedProviderSearch]);

	const parameterOverrideCount = useMemo(
		() =>
			[
				temperature,
				topP,
				topK,
				frequencyPenalty,
				presencePenalty,
				repetitionPenalty,
				maxTokens,
				seed,
			].filter((value) => String(value ?? "").trim().length > 0).length,
		[
			temperature,
			topP,
			topK,
			frequencyPenalty,
			presencePenalty,
			repetitionPenalty,
			maxTokens,
			seed,
		],
	);

	const performanceHintCount = useMemo(
		() =>
			[
				maxPricePrompt,
				maxPriceCompletion,
				throughputP50,
				throughputP75,
				throughputP90,
				throughputP99,
				latencyP50,
				latencyP75,
				latencyP90,
				latencyP99,
			].filter((value) => String(value ?? "").trim().length > 0).length,
		[
			maxPricePrompt,
			maxPriceCompletion,
			throughputP50,
			throughputP75,
			throughputP90,
			throughputP99,
			latencyP50,
			latencyP75,
			latencyP90,
			latencyP99,
		],
	);

	const providerRoutingSummary = useMemo(() => {
		const parts: string[] = [];
		if (providerOrder.length > 0) parts.push(`${providerOrder.length} ordered`);
		if (providerIgnore.length > 0) parts.push(`${providerIgnore.length} blocked`);
		if (requiredExecutionRegion) parts.push(`exec ${requiredExecutionRegion.toUpperCase()}`);
		if (requiredDataRegion) parts.push(`data ${requiredDataRegion.toUpperCase()}`);
		if (requireZeroDataRetention) parts.push("ZDR");
		if (performanceHintCount > 0) parts.push(`${performanceHintCount} performance rules`);
		return parts.length > 0 ? parts.join(", ") : t("strings.Any eligible provider" as never);
	}, [
		performanceHintCount,
		providerIgnore.length,
		providerOrder.length,
		requiredExecutionRegion,
		requiredDataRegion,
		requireZeroDataRetention,
		t,
	]);

	const pluginsSummary = responseHealingEnabled
		? `${t("strings.Response healing" as never)} (${t(settingsStringKey(responseHealingMode === "safe" ? "Safe" : "Strict") as never)})`
		: t("strings.No preset plugins enabled" as never);

	const requestDefaultsSummary = [
		`${routingMode} routing`,
		responseCachingEnabled
			? `cache ${responseCachingTtl ? `${responseCachingTtl}s` : "on"}`
			: "cache off",
		systemPrompt.trim() ? "prompt set" : "no prompt",
	].join(", ");

	const reasoningSummary = !reasoningEnabled
		? "Disabled"
		: `${reasoningEffort} effort${
			reasoningMaxTokens ? `, max ${reasoningMaxTokens} tokens` : ""
		}`;

	function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
		const nextName = e.target.value;
		setName(nextName);
		if (!slugEdited) setSlug(buildPresetSlugPreview(nextName));
	}

	function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
		setSlugEdited(true);
		setSlug(buildPresetSlugPreview(e.target.value));
	}

	function toggleArrayItem<T>(array: T[], item: T): T[] {
		if (array.includes(item)) {
			return array.filter((i) => i !== item);
		}
		return [...array, item];
	}

	function getModelOrgInfo(id: string) {
		const model = activeModels.find((m) => m.model_id === id);
		return {
			id: model?.organisation_id || null,
			name: model?.organisation_name || null,
			colour: model?.organisation_colour || null,
		};
	}

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();

		const trimmedName = name.trim();
		const slugPreview = buildPresetSlugPreview(slug || trimmedName);
		if (!trimmedName) {
			toast.error(t("strings.Preset name is required" as never));
			return;
		}
		if (!slugPreview) {
			toast.error(t("strings.Preset slug is required" as never));
			return;
		}
		if (selectedModels.length === 0) {
			toast.error(t("strings.phraseSelectAtLeastOneModelForThisPreset" as never));
			return;
		}
		if (!currentUserId || !currentTeamId) {
			toast.error(t("strings.phraseYouMustBeSignedInAndInAWorkspaceToSaveAPreset" as never));
			return;
		}

		setLoading(true);

		const config: Record<string, unknown> = {};

		if (systemPrompt) {
			config.system_prompt = systemPrompt;
		}

		if (selectedModels.length > 0) {
			config.models = selectedModels;
		}

		if (providerOrder.length > 0) {
			config.only_providers = providerOrder;
		}

		if (providerIgnore.length > 0) {
			config.ignore_providers = providerIgnore;
		}

		const providerConfig: Record<string, unknown> = {};
		if (providerOrder.length > 0) {
			providerConfig.order = providerOrder;
			providerConfig.only = providerOrder;
		}
		if (providerIgnore.length > 0) {
			providerConfig.ignore = providerIgnore;
		}
		if (requiredExecutionRegion) {
			providerConfig.required_execution_region = requiredExecutionRegion;
		}
		if (requiredDataRegion) {
			providerConfig.required_data_region = requiredDataRegion;
		}
		if (requireZeroDataRetention) {
			providerConfig.require_zero_data_retention = true;
		}
		const maxPrice: Record<string, number> = {};
		if (maxPricePrompt) maxPrice.prompt = Number.parseFloat(maxPricePrompt);
		if (maxPriceCompletion) {
			maxPrice.completion = Number.parseFloat(maxPriceCompletion);
		}
		if (Object.keys(maxPrice).length > 0) {
			providerConfig.max_price = maxPrice;
		}
		const preferredMinThroughput = parseThresholdInputs({
			p50: throughputP50,
			p75: throughputP75,
			p90: throughputP90,
			p99: throughputP99,
		});
		if (preferredMinThroughput) {
			providerConfig.preferred_min_throughput = preferredMinThroughput;
		}
		const preferredMaxLatency = parseThresholdInputs({
			p50: latencyP50,
			p75: latencyP75,
			p90: latencyP90,
			p99: latencyP99,
		});
		if (preferredMaxLatency) {
			providerConfig.preferred_max_latency = preferredMaxLatency;
		}
		if (Object.keys(providerConfig).length > 0) {
			config.provider = providerConfig;
		}

		if (responseHealingEnabled) {
			config.plugins = [
				{ id: "response-healing", enabled: true, mode: responseHealingMode },
			];
		}

		config.routing_mode = routingMode;
		const ttlSeconds = Number.parseInt(responseCachingTtl, 10);
		config.response_caching = {
			enabled: responseCachingEnabled,
			...(responseCachingEnabled && Number.isFinite(ttlSeconds) && ttlSeconds > 0
				? { ttl_seconds: ttlSeconds }
				: {}),
		};

		const params: Record<string, unknown> = {};
		if (temperature) params.temperature = parseFloat(temperature);
		if (topP) params.top_p = parseFloat(topP);
		if (topK) params.top_k = parseInt(topK, 10);
		if (frequencyPenalty) params.frequency_penalty = parseFloat(frequencyPenalty);
		if (presencePenalty) params.presence_penalty = parseFloat(presencePenalty);
		if (repetitionPenalty) params.repetition_penalty = parseFloat(repetitionPenalty);
		if (maxTokens) params.max_tokens = parseInt(maxTokens, 10);
		if (seed) params.seed = parseInt(seed, 10);
		if (Object.keys(params).length > 0) {
			config.parameters = params;
		}

		if (reasoningEnabled) {
			const reasoning: Record<string, unknown> = {
				enabled: true,
			};
			if (reasoningEffort) reasoning.effort = reasoningEffort;
			if (reasoningMaxTokens) reasoning.max_tokens = parseInt(reasoningMaxTokens, 10);
			if (excludeReasoningTokens) reasoning.exclude_from_output = excludeReasoningTokens;
			config.reasoning = reasoning;
		}

		try {
			if (initialPreset?.id) {
				await updatePresetAction({
					id: initialPreset.id,
					name: trimmedName,
					slug: slugPreview,
					description,
					visibility,
					config,
				});
			toast.success(t("strings.Draft saved" as never));
			} else {
				await createPresetAction({
					name: trimmedName,
					slug: slugPreview,
					description,
					visibility,
					config,
					creatorUserId: currentUserId,
					workspaceId: currentTeamId,
				});
			toast.success(t("strings.Preset created" as never));
			}
			router.push("/settings/presets");
			router.refresh();
		} catch (error) {
			toast.error(localizedSettingsError(error, t, "Failed to save preset"));
		} finally {
			setLoading(false);
		}
	}

	return (
		<form
			onSubmit={onSubmit}
			className="space-y-6 [&_[data-slot=button]]:rounded-md [&_[data-slot=select-trigger]]:w-full [&_[data-slot=select-trigger]]:rounded-md"
		>
			{activeView === "overview" ? (
				<>
					<div className="space-y-6">
						<div className="flex flex-wrap items-start justify-between gap-4">
							<div className="min-w-0 flex-1 space-y-1">
				<Label htmlFor="preset-name" className="sr-only">{t("strings.Preset Name" as never)}</Label>
								<input
									id="preset-name"
									value={name}
									onChange={handleNameChange}
				placeholder={t("strings.Concise Support Assistant" as never)}
									className="block w-full min-w-0 bg-transparent py-1 text-3xl font-semibold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/70"
								/>
								<div className="flex min-w-0 items-center gap-1 font-mono text-sm text-muted-foreground focus-within:text-foreground">
									<span aria-hidden="true">@</span>
				<Label htmlFor="preset-slug" className="sr-only">{t("strings.Invocation Slug" as never)}</Label>
									<input
										id="preset-slug"
										value={slug}
										onChange={handleSlugChange}
				placeholder={t("strings.concise-support-assistant" as never)}
										className="min-w-0 flex-1 bg-transparent py-1 font-mono text-sm outline-none placeholder:text-muted-foreground/60"
									/>
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Button type="button" variant="outline" asChild disabled={loading}>
				<Link href="/settings/presets">{t("labels.cancel")}</Link>
								</Button>
								<Button type="submit" disabled={loading || !name.trim()}>
									{loading ? t("strings.phraseSaving") : initialPreset ? t("finalSettingsCopy.saveDraft") : t("labels.create")}
								</Button>
							</div>
						</div>

						<div className="space-y-3">
							<Textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
				placeholder={t("strings.When should this preset be used?" as never)}
								className="min-h-0 h-10 resize-none overflow-hidden border-0 bg-transparent px-0 py-2 text-base text-muted-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
							/>
						</div>
					</div>

					<Separator />

					<section className="space-y-3">
						<div>
			<h2 className="text-sm font-semibold">{t("strings.Visibility" as never)}</h2>
			<p className="mt-1 text-sm text-muted-foreground">{t("strings.phraseControlWhoCanDiscoverAndUseThisPreset" as never)}</p>
						</div>
						<div className="flex flex-col gap-3 border-y py-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
			<div className="text-sm font-medium">{t("strings.Preset Access" as never)}</div>
			<p className="mt-1 text-xs text-muted-foreground">{t("strings.phrasePrivatePresetsAreOnlyVisibleToYouWorkspacePresetsCanBeUsedByMembersPublicPresetsAppearInTheMarketplace" as never)}</p>
							</div>
							<Select value={visibility} onValueChange={(value: PresetVisibility) => setVisibility(value)}>
								<SelectTrigger className="w-full sm:w-56"><SelectValue>{visibility === "private" ? t("strings.Only Me" as never) : visibility === "team" ? t("strings.Share With Workspace" as never) : t("strings.Publish to Marketplace" as never)}</SelectValue></SelectTrigger>
								<SelectContent className="rounded-md">
			<SelectItem value="private">{t("strings.Only Me" as never)}</SelectItem>
			<SelectItem value="team">{t("strings.Share With Workspace" as never)}</SelectItem>
			<SelectItem value="public">{t("strings.Publish to Marketplace" as never)}</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{visibility === "public" ? (
							<p className="text-xs text-muted-foreground">
								{t("presetForm.publicMarketplaceReference", { reference: `@${workspacePublisher?.handle ?? "workspace"}/${buildPresetSlugPreview(slug || name) || "preset"}` })}
							</p>
						) : null}
					</section>

					<section className="space-y-4">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
							<div>
			<h2 className="text-sm font-semibold">{t("strings.Models" as never)}</h2>
			<p className="mt-1 text-sm text-muted-foreground">{t("strings.phraseDragToSetTheDefaultModelAndFallbackOrder" as never)}</p>
							</div>
							<div className="flex items-center gap-2">
								<Popover open={showModelPicker} onOpenChange={setShowModelPicker}>
									<PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="rounded-md"><Plus className="mr-2 h-4 w-4" />{t("strings.Add Model" as never)}</Button></PopoverTrigger>
									<PopoverContent align="end" className="w-[min(92vw,440px)] gap-0 overflow-hidden rounded-md p-0">
										<div className="relative border-b p-2"><Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder={t("strings.phraseSearchModels" as never)} className="rounded-md pl-9" /></div>
										<ScrollArea className="h-80">
											{filteredModels.length ? filteredModels.map((model) => {
												const orgInfo = getModelOrgInfo(model.model_id);
												const isSelected = selectedModels.includes(model.model_id);
								return <button key={model.model_id} type="button" className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-3 py-1.5 text-left last:border-b-0 hover:bg-muted/40" onClick={() => setSelectedModels((current) => isSelected ? current.filter((id) => id !== model.model_id) : [...current, model.model_id])}>
									<span className="flex h-5 w-5 items-center justify-center rounded-sm border">{isSelected ? <Check className="h-3.5 w-3.5" /> : null}</span>
									{orgInfo.name ? <Logo id={orgInfo.id ?? orgInfo.name} className="h-5 w-5 rounded-sm object-contain" alt={orgInfo.name} width={20} height={20} /> : <span className="h-5 w-5" />}
									<span className="truncate text-sm font-medium">{model.name}</span>
									<span className="max-w-32 truncate text-right text-xs text-muted-foreground">{orgInfo.name}</span>
												</button>;
																											}) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("strings.No matching models" as never)}</p>}
										</ScrollArea>
									</PopoverContent>
								</Popover>
								{selectedModels.length ? <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedModels([])}>{t("strings.Clear" as never)}</Button> : null}
							</div>
						</div>
						<SortablePresetList items={selectedModelOptions} onChange={setSelectedModels} defaultFirst emptyLabel={t("presetForm.emptyModels")} />
					</section>

					<Separator />

					<div>
						<div className="text-sm font-medium">{t("strings.Configuration groups" as never)}</div>
					</div>
					<div className="border-y border-border/70">
						<SectionLinkRow
							title={t("strings.Provider Routing" as never)}
							description={t("strings.phraseChooseProviderFallbackOrderExclusionsAndRoutingPerformanceThresholds" as never)}
							summary={providerRoutingSummary}
							onClick={() => setActiveView("providers")}
						/>
						<SectionLinkRow
							title={t("strings.Request Defaults" as never)}
							description={t("strings.phraseSetRoutingBehaviorResponseCachingAndPromptDefaults" as never)}
							summary={requestDefaultsSummary}
							onClick={() => setActiveView("defaults")}
						/>
						<SectionLinkRow
							title={t("strings.Plugins" as never)}
							description={t("strings.phraseEnableDeterministicGatewayPluginsForThisPreset" as never)}
							summary={pluginsSummary}
							onClick={() => setActiveView("plugins")}
						/>
						<SectionLinkRow
							title={t("strings.Generation Parameters" as never)}
							description={t("strings.phraseSetSamplingAndDeterministicDefaults" as never)}
							summary={
								parameterOverrideCount > 0
									? `${parameterOverrideCount} overrides`
									: t("strings.Model defaults" as never)
							}
							onClick={() => setActiveView("parameters")}
						/>
						<SectionLinkRow
								title={t("strings.Reasoning Configuration" as never)}
								description={t("strings.phraseConfigureReasoningSpecificBehaviorWhenSupported" as never)}
							summary={reasoningSummary}
							onClick={() => setActiveView("reasoning")}
						/>
					</div>
				</>
			) : null}

			{activeView === "defaults" ? (
				<div className="space-y-6">
					<button
						type="button"
						onClick={() => setActiveView("overview")}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ChevronLeft className="h-4 w-4" />
						<span>{t("strings.Overview / Request Defaults" as never)}</span>
					</button>
					<FormSection
						icon={<Sliders className="h-4 w-4" />}
						title={t("presetForm.requestDefaultsTitle")}
						description={t("presetForm.requestDefaultsDescription")}
						stacked
					>
						<div className="space-y-2">
						<Label>{t("strings.Preferred Routing Profile" as never)}</Label>
							<Select
								value={routingMode}
								onValueChange={(value: PresetRoutingMode) => setRoutingMode(value)}
							>
								<SelectTrigger>
									<SelectValue>{routingMode === "balanced" ? t("strings.Balanced" as never) : routingMode === "price" ? t("strings.Lowest cost" as never) : routingMode === "latency" ? t("strings.Lowest latency" as never) : t("strings.Highest throughput" as never)}</SelectValue>
								</SelectTrigger>
								<SelectContent className="rounded-md">
									<SelectItem value="balanced">{t("strings.Balanced" as never)}</SelectItem>
									<SelectItem value="price">{t("strings.Lowest cost" as never)}</SelectItem>
									<SelectItem value="latency">{t("strings.Lowest latency" as never)}</SelectItem>
									<SelectItem value="throughput">{t("strings.Highest throughput" as never)}</SelectItem>
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.routingProfileHelp")}
							</p>
						</div>

						<div className="space-y-3 rounded-lg border p-4">
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
						<Label>{t("strings.Enable Response Caching" as never)}</Label>
									<p className="text-xs text-muted-foreground">
										{t("presetForm.responseCachingHelp")}
									</p>
								</div>
								<Switch
									checked={responseCachingEnabled}
									onCheckedChange={setResponseCachingEnabled}
								/>
							</div>
							{responseCachingEnabled && (
								<div className="space-y-2">
						<Label>{t("strings.Cache TTL (seconds)" as never)}</Label>
									<Input
										type="number"
										min="30"
										max="86400"
										value={responseCachingTtl}
										onChange={(e) => setResponseCachingTtl(e.target.value)}
										placeholder="300"
									/>
									<p className="text-xs text-muted-foreground">
										{t("presetForm.cacheTtlHelp")}
									</p>
								</div>
							)}
						</div>

						<div className="space-y-2">
						<Label>{t("strings.System Prompt" as never)}</Label>
							<Textarea
								value={systemPrompt}
								onChange={(e) => setSystemPrompt(e.target.value)}
								placeholder={t("presetForm.systemPromptPlaceholder")}
								rows={6}
							/>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.systemPromptHelp")}
							</p>
						</div>
					</FormSection>
				</div>
			) : null}

			{activeView === "plugins" ? (
				<div className="space-y-6">
					<button
						type="button"
						onClick={() => setActiveView("overview")}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ChevronLeft className="h-4 w-4" />
						<span>{t("presetForm.pluginsBreadcrumb")}</span>
					</button>
					<FormSection
						icon={<Settings2 className="h-4 w-4" />}
						title={t("presetForm.pluginsTitle")}
						description={t("presetForm.pluginsDescription")}
						stacked
					>
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label>{t("strings.Response Healing" as never)}</Label>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.responseHealingDescription")}
							</p>
						</div>
						<Switch
							checked={responseHealingEnabled}
							onCheckedChange={setResponseHealingEnabled}
						/>
					</div>
					{responseHealingEnabled && (
						<div className="space-y-3">
							<div className="space-y-2">
								<Label>{t("presetForm.healingModeLabel")}</Label>
								<Select
									value={responseHealingMode}
									onValueChange={(value: ResponseHealingMode) =>
										setResponseHealingMode(value)
									}
								>
									<SelectTrigger>
										<SelectValue>{t(settingsStringKey(responseHealingMode === "safe" ? "Safe" : "Strict") as never)}</SelectValue>
									</SelectTrigger>
									<SelectContent className="rounded-md">
										<SelectItem value="safe">{t("strings.Safe" as never)}</SelectItem>
										<SelectItem value="strict">{t("strings.Strict" as never)}</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									{responseHealingMode === "strict"
										? t("strings.phraseStrictModeOnlyUnwrapsAlreadyValidJSONFromFencesOrSurroundingText" as never)
										: t("strings.phraseSafeModeEnablesTheFullBoundedJSONRepairPathForStructuredOutputWorkflows" as never)}
								</p>
							</div>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.pluginOverrideHelp")}
							</p>
						</div>
					)}
					</FormSection>
				</div>
			) : null}

			{activeView === "providers" ? (
				<div className="space-y-6">
					<button
						type="button"
						onClick={() => setActiveView("overview")}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ChevronLeft className="h-4 w-4" />
						<span>{t("strings.Overview / Provider Routing" as never)}</span>
					</button>
					<FormSection
						icon={<Settings2 className="h-4 w-4" />}
						title={t("strings.Provider Routing" as never)}
						description={t("strings.phraseChooseProviderFallbackOrderBlockProvidersYouNeverWantUsedAndSetPriceOrPerformanceRoutingThresholds" as never)}
						stacked
					>
						<div className="space-y-3">
							<div className="flex items-center justify-between gap-3">
								<div>
									<div className="text-sm font-medium">{t("strings.Provider order" as never)}</div>
									<p className="text-xs text-muted-foreground">
										{t("strings.phraseSelectProvidersInOrderTheRouterWillPreferTheFirstAvailableProviderFromThisOrderedSubset" as never)}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Popover open={showProviderPicker} onOpenChange={setShowProviderPicker}>
										<PopoverTrigger asChild>
													<Button type="button" variant="outline" size="sm" className="rounded-md"><Plus className="mr-2 h-4 w-4" />{t("strings.Select Providers" as never)}</Button>
										</PopoverTrigger>
										<PopoverContent align="end" className="w-[min(92vw,400px)] gap-0 overflow-hidden rounded-md p-0">
													<div className="relative border-b p-2"><Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={providerSearch} onChange={(event) => setProviderSearch(event.target.value)} placeholder={t("strings.phraseSearchProviders" as never)} className="rounded-md pl-9" /></div>
											<ScrollArea className="h-72">
												{filteredProviders.length ? filteredProviders.map((provider) => {
													const isSelected = providerOrder.includes(provider.id);
											return <button key={provider.id} type="button" className="flex w-full items-center gap-2 border-b px-3 py-1.5 text-left last:border-b-0 hover:bg-muted/40" onClick={() => setProviderOrder((current) => isSelected ? current.filter((id) => id !== provider.id) : [...current, provider.id])}>
												<span className="flex h-5 w-5 items-center justify-center rounded-sm border">{isSelected ? <Check className="h-3.5 w-3.5" /> : null}</span>
												<Logo id={provider.logoId} className="h-5 w-5 rounded-sm object-contain" alt={provider.name} width={20} height={20} />
														<span className="truncate text-sm font-medium">{provider.name}</span>
													</button>;
													}) : <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("strings.No matching routable providers" as never)}</p>}
											</ScrollArea>
										</PopoverContent>
									</Popover>
									{providerOrder.length > 0 ? (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => setProviderOrder([])}
										>
																	{t("strings.Clear" as never)}
										</Button>
									) : null}
								</div>
							</div>
							<SortablePresetList items={selectedProviderOptions} onChange={setProviderOrder} emptyLabel={t("strings.phraseNoProviderOrderConfiguredAnyEligibleProviderMayBeUsed" as never)} />
						</div>

						<div className="space-y-3">
							<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
								<div><div className="text-sm font-medium">{t("strings.Blocked Providers" as never)}</div><p className="mt-1 text-xs text-muted-foreground">{t("strings.phraseTheseProvidersWillNeverBeUsedEvenIfTheySupportTheSelectedModel" as never)}</p></div>
								<Popover open={showBlockedProviderPicker} onOpenChange={setShowBlockedProviderPicker}>
								<PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="rounded-md"><Plus className="mr-2 h-4 w-4" />{t("strings.Select Providers" as never)}</Button></PopoverTrigger>
									<PopoverContent align="end" className="w-[min(92vw,400px)] gap-0 overflow-hidden rounded-md p-0">
										<div className="relative border-b p-2"><Search className="absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input autoFocus value={blockedProviderSearch} onChange={(event) => setBlockedProviderSearch(event.target.value)} placeholder={t("strings.phraseSearchProviders" as never)} className="rounded-md pl-9" /></div>
										<ScrollArea className="h-72">
											{filteredBlockedProviders.map((provider) => {
												const isBlocked = providerIgnore.includes(provider.id);
												return <button key={`blocked-picker-${provider.id}`} type="button" className="flex w-full items-center gap-2 border-b px-3 py-1.5 text-left last:border-b-0 hover:bg-muted/40" onClick={() => setProviderIgnore((current) => toggleArrayItem(current, provider.id))}>
													<span className="flex h-5 w-5 items-center justify-center rounded-sm border">{isBlocked ? <Check className="h-3.5 w-3.5" /> : null}</span>
													<Logo id={provider.logoId} className="h-5 w-5 rounded-sm object-contain" alt={provider.name} width={20} height={20} />
													<span className="truncate text-sm font-medium">{provider.name}</span>
												</button>;
											})}
										</ScrollArea>
									</PopoverContent>
								</Popover>
							</div>
							{providerIgnore.length ? <div className="flex flex-wrap gap-2">{providerIgnore.map((providerId) => {
								const provider = providerList.find((entry) => entry.id === providerId);
								return <div key={`blocked-${providerId}`} className="inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1">
									{provider ? <Logo id={provider.logoId} className="h-4 w-4 rounded-sm object-contain" alt={provider.name} width={16} height={16} /> : null}
									<span className="text-sm font-medium">{provider?.name ?? providerId}</span>
									<button type="button" className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setProviderIgnore((current) => current.filter((id) => id !== providerId))} aria-label={`Remove ${provider?.name ?? providerId}`}><X className="h-3.5 w-3.5" /></button>
								</div>;
							})}</div> : <p className="text-sm text-muted-foreground">{t("strings.phraseNoProvidersBlocked" as never)}</p>}
						</div>

						<div className="space-y-5">
							<div className="space-y-3 rounded-lg border p-4">
								<div className="space-y-1">
									<Label>{t("strings.Residency requirements" as never)}</Label>
									<p className="text-xs text-muted-foreground">
										{t("strings.phraseRestrictRoutingToProvidersThatAdvertiseMatchingExecutionOrDataResidencyMetadata" as never)}
									</p>
								</div>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label>{t("strings.Required execution region" as never)}</Label>
										<Select
											value={requiredExecutionRegion || "any"}
											onValueChange={(value) =>
												setRequiredExecutionRegion(value === "any" ? "" : value)
											}
										>
											<SelectTrigger>
											<SelectValue>{requiredExecutionRegion === "eu" ? "EU" : requiredExecutionRegion === "us" ? "US" : t("strings.Any Region" as never)}</SelectValue>
											</SelectTrigger>
											<SelectContent className="rounded-md">
													<SelectItem value="any">{t("strings.Any region" as never)}</SelectItem>
												<SelectItem value="eu">EU</SelectItem>
												<SelectItem value="us">US</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label>{t("strings.Required data region" as never)}</Label>
										<Select
											value={requiredDataRegion || "any"}
											onValueChange={(value) =>
												setRequiredDataRegion(value === "any" ? "" : value)
											}
										>
											<SelectTrigger>
											<SelectValue>{requiredDataRegion === "eu" ? "EU" : requiredDataRegion === "us" ? "US" : t("strings.Any Region" as never)}</SelectValue>
											</SelectTrigger>
											<SelectContent className="rounded-md">
													<SelectItem value="any">{t("strings.Any region" as never)}</SelectItem>
												<SelectItem value="eu">EU</SelectItem>
												<SelectItem value="us">US</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>
								<div className="flex items-center justify-between gap-4 rounded-md border border-border/70 px-3 py-3">
									<div className="space-y-1">
										<div className="text-sm font-medium">
													{t("strings.Require zero data retention support" as never)}
										</div>
										<p className="text-xs text-muted-foreground">
													{t("strings.phraseOnlyRouteToProvidersThatAdvertiseDefaultOrOptionalZeroRetentionSupport" as never)}
										</p>
									</div>
									<Switch
										checked={requireZeroDataRetention}
										onCheckedChange={setRequireZeroDataRetention}
									/>
								</div>
							</div>
							<div className="text-sm font-medium">{t("strings.Performance routing" as never)}</div>
							<div className="space-y-3 rounded-lg border p-4">
								<div className="space-y-1">
									<Label>{t("strings.Maximum Price" as never)}</Label>
									<p className="text-xs text-muted-foreground">
										{t("strings.phraseMaximumPricePerMillionTokensForPromptAndCompletionBeforeTheProviderIsDeprioritized" as never)}
									</p>
								</div>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label>{t("strings.Prompt" as never)}</Label>
										<Input
											type="number"
											step="0.01"
											min="0"
											value={maxPricePrompt}
											onChange={(e) => setMaxPricePrompt(e.target.value)}
											placeholder={numberExamplePlaceholder("0.25")}
										/>
									</div>
									<div className="space-y-2">
										<Label>{t("strings.Completion" as never)}</Label>
										<Input
											type="number"
											step="0.01"
											min="0"
											value={maxPriceCompletion}
											onChange={(e) => setMaxPriceCompletion(e.target.value)}
											placeholder={numberExamplePlaceholder("1.50")}
										/>
									</div>
								</div>
							</div>

							<div className="space-y-3 rounded-lg border p-4">
								<div className="space-y-1">
									<Label>{t("strings.Preferred Minimum Throughput" as never)}</Label>
									<p className="text-xs text-muted-foreground">
										{t("strings.phrasePreferredMinimumThroughputInTokensPerSecondEndpointsBelowTheseThresholdsMayStillBeUsedButAreDeprioritizedInRouting" as never)}
									</p>
								</div>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label>p50</Label>
										<Input type="number" min="0" value={throughputP50} onChange={(e) => setThroughputP50(e.target.value)} placeholder={numberExamplePlaceholder("100")} />
									</div>
									<div className="space-y-2">
										<Label>p75</Label>
										<Input type="number" min="0" value={throughputP75} onChange={(e) => setThroughputP75(e.target.value)} placeholder={numberExamplePlaceholder("100")} />
									</div>
									<div className="space-y-2">
										<Label>p90</Label>
										<Input type="number" min="0" value={throughputP90} onChange={(e) => setThroughputP90(e.target.value)} placeholder={numberExamplePlaceholder("100")} />
									</div>
									<div className="space-y-2">
										<Label>p99</Label>
										<Input type="number" min="0" value={throughputP99} onChange={(e) => setThroughputP99(e.target.value)} placeholder={numberExamplePlaceholder("100")} />
									</div>
								</div>
							</div>

							<div className="space-y-3 rounded-lg border p-4">
								<div className="space-y-1">
									<Label>{t("strings.Preferred Maximum Latency" as never)}</Label>
									<p className="text-xs text-muted-foreground">
										{t("strings.phrasePreferredMaximumLatencyInSecondsEndpointsAboveTheseThresholdsMayStillBeUsedButAreDeprioritizedInRouting" as never)}
									</p>
								</div>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label>p50</Label>
										<Input type="number" min="0" value={latencyP50} onChange={(e) => setLatencyP50(e.target.value)} placeholder={numberExamplePlaceholder("5")} />
									</div>
									<div className="space-y-2">
										<Label>p75</Label>
										<Input type="number" min="0" value={latencyP75} onChange={(e) => setLatencyP75(e.target.value)} placeholder={numberExamplePlaceholder("5")} />
									</div>
									<div className="space-y-2">
										<Label>p90</Label>
										<Input type="number" min="0" value={latencyP90} onChange={(e) => setLatencyP90(e.target.value)} placeholder={numberExamplePlaceholder("5")} />
									</div>
									<div className="space-y-2">
										<Label>p99</Label>
										<Input type="number" min="0" value={latencyP99} onChange={(e) => setLatencyP99(e.target.value)} placeholder={numberExamplePlaceholder("5")} />
									</div>
								</div>
							</div>
						</div>
					</FormSection>
				</div>
			) : null}

			{activeView === "parameters" ? (
				<div className="space-y-6">
					<button
						type="button"
						onClick={() => setActiveView("overview")}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ChevronLeft className="h-4 w-4" />
						<span>{t("strings.Overview / Generation Parameters" as never)}</span>
					</button>
					<FormSection
						icon={<Sliders className="h-4 w-4" />}
						title={t("strings.Generation Parameters" as never)}
						description={t("strings.phraseSetDeterministicAndSamplingDefaultsThatApplyToRequestsUsingThisPreset" as never)}
						stacked
					>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
						<div className="space-y-2">
							<Label>{t("strings.Temperature" as never)}</Label>
							<Input
								type="number"
								step="0.01"
								min="0"
								max="2"
								value={temperature}
								onChange={(e) => setTemperature(e.target.value)}
								placeholder="0.7"
							/>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.temperatureHelp")}
							</p>
						</div>

						<div className="space-y-2">
							<Label>{t("strings.Top P" as never)}</Label>
							<Input
								type="number"
								step="0.01"
								min="0"
								max="1"
								value={topP}
								onChange={(e) => setTopP(e.target.value)}
								placeholder="0.9"
							/>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.topPHelp")}
							</p>
						</div>

						<div className="space-y-2">
							<Label>{t("strings.Top K" as never)}</Label>
							<Input
								type="number"
								min="0"
								value={topK}
								onChange={(e) => setTopK(e.target.value)}
								placeholder="40"
							/>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.topKHelp")}
							</p>
						</div>

						<div className="space-y-2">
							<Label>{t("strings.Max Tokens" as never)}</Label>
							<Input
								type="number"
								min="1"
								value={maxTokens}
								onChange={(e) => setMaxTokens(e.target.value)}
								placeholder="4096"
							/>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.maxTokensHelp")}
							</p>
						</div>

						<div className="space-y-2">
							<Label>{t("strings.Frequency Penalty" as never)}</Label>
							<Input
								type="number"
								step="0.01"
								min="-2"
								max="2"
								value={frequencyPenalty}
								onChange={(e) => setFrequencyPenalty(e.target.value)}
								placeholder="0"
							/>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.penaltyHelp")}
							</p>
						</div>

						<div className="space-y-2">
							<Label>{t("strings.Presence Penalty" as never)}</Label>
							<Input
								type="number"
								step="0.01"
								min="-2"
								max="2"
								value={presencePenalty}
								onChange={(e) => setPresencePenalty(e.target.value)}
								placeholder="0"
							/>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.penaltyHelp")}
							</p>
						</div>

						<div className="space-y-2">
							<Label>{t("strings.Repetition Penalty" as never)}</Label>
							<Input
								type="number"
								step="0.01"
								min="1"
								max="2"
								value={repetitionPenalty}
								onChange={(e) => setRepetitionPenalty(e.target.value)}
								placeholder="1"
							/>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.repetitionPenaltyHelp")}
							</p>
						</div>

						<div className="space-y-2">
							<Label>{t("strings.Seed" as never)}</Label>
							<Input
								type="number"
								value={seed}
								onChange={(e) => setSeed(e.target.value)}
								placeholder={t("strings.Random" as never)}
							/>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.seedHelp")}
							</p>
						</div>
					</div>
					</FormSection>
				</div>
			) : null}

			{activeView === "reasoning" ? (
				<div className="space-y-6">
					<button
						type="button"
						onClick={() => setActiveView("overview")}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ChevronLeft className="h-4 w-4" />
						<span>{t("strings.Overview / Reasoning Configuration" as never)}</span>
					</button>
					<FormSection
						icon={<Shield className="h-4 w-4" />}
						title={t("strings.Reasoning Configuration" as never)}
						description={t("strings.phraseConfigureReasoningSettingsForModelsThatExposeReasoningSpecificControls" as never)}
						stacked
					>
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label>{t("strings.Enable Reasoning" as never)}</Label>
							<p className="text-xs text-muted-foreground">
								{t("presetForm.reasoningEnabledHelp")}
							</p>
						</div>
						<Switch
							checked={reasoningEnabled}
							onCheckedChange={setReasoningEnabled}
						/>
					</div>

					{reasoningEnabled && (
						<>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
								<div className="space-y-2">
									<Label>{t("strings.Reasoning Effort" as never)}</Label>
									<Select
										value={reasoningEffort}
										onValueChange={(v) =>
											setReasoningEffort(v as ReasoningEffort)
										}
									>
										<SelectTrigger>
										<SelectValue>{t(settingsStringKey(REASONING_LABELS[reasoningEffort]) as never)}</SelectValue>
										</SelectTrigger>
									<SelectContent className="rounded-md">
											<SelectItem value="none">{t("strings.None" as never)}</SelectItem>
											<SelectItem value="minimal">{t("strings.Minimal" as never)}</SelectItem>
											<SelectItem value="low">{t("strings.Low" as never)}</SelectItem>
											<SelectItem value="medium">{t("strings.Medium" as never)}</SelectItem>
											<SelectItem value="high">{t("strings.High" as never)}</SelectItem>
											<SelectItem value="xhigh">{t("strings.Extra High" as never)}</SelectItem>
											<SelectItem value="max">{t("strings.Maximum" as never)}</SelectItem>
										</SelectContent>
									</Select>
									<p className="text-xs text-muted-foreground">
										{t("presetForm.reasoningEffortHelp")}
									</p>
								</div>

								<div className="space-y-2">
									<Label>{t("strings.Reasoning Max Tokens" as never)}</Label>
									<Input
										type="number"
										min="1"
										value={reasoningMaxTokens}
										onChange={(e) =>
											setReasoningMaxTokens(e.target.value)
										}
										placeholder={t("strings.Leave empty for model default" as never)}
									/>
									<p className="text-xs text-muted-foreground">
										{t("presetForm.reasoningMaxTokensHelp")}
									</p>
								</div>
							</div>

							<div className="flex items-center justify-between pt-2">
								<div className="space-y-0.5">
									<Label>{t("strings.Exclude Reasoning from Output" as never)}</Label>
									<p className="text-xs text-muted-foreground">
										{t("presetForm.excludeReasoningHelp")}
									</p>
								</div>
								<Switch
									checked={excludeReasoningTokens}
									onCheckedChange={setExcludeReasoningTokens}
								/>
							</div>
						</>
					)}
					</FormSection>
				</div>
			) : null}
		</form>
	);
}
