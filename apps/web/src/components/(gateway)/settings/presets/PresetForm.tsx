"use client";

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
import { Badge } from "@/components/ui/badge";
import {
	Search,
	Plus,
	X,
	Settings2,
	AtSign,
	Shield,
	Sliders,
	ChevronRight,
	ChevronLeft,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { createPresetAction } from "@/app/(dashboard)/settings/presets/actions";
import { useRouter } from "next/navigation";
import type { ModelCard } from "@/lib/fetchers/models/getAllModels";

interface APIProviderCard {
	api_provider_id: string;
	api_provider_name: string;
	country_code: string;
}

interface PresetFormProps {
	models: ModelCard[];
	providers: APIProviderCard[];
	currentUserId?: string | null;
	currentTeamId?: string | null;
}

type ReasoningEffort = "low" | "medium" | "high";
type PresetVisibility = "private" | "team" | "public";
type PresetRoutingMode = "balanced" | "price" | "latency" | "throughput";
type ResponseHealingMode = "safe" | "strict";
type PresetEditorView =
	| "overview"
	| "identity"
	| "defaults"
	| "plugins"
	| "models"
	| "providers"
	| "parameters"
	| "reasoning";

const EXCLUDED_STATUSES = ["retired", "rumoured", "deprecated"];

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
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^[-._]+|[-._]+$/g, "");
}

function moveOrderedItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
	const nextIndex = index + direction;
	if (index < 0 || nextIndex < 0 || index >= items.length || nextIndex >= items.length) {
		return items;
	}
	const next = [...items];
	[next[index], next[nextIndex]] = [next[nextIndex], next[index]];
	return next;
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
}: PresetFormProps) {
	const [loading, setLoading] = useState(false);
	const [activeView, setActiveView] = useState<PresetEditorView>("overview");
	const [modelSearch, setModelSearch] = useState("");
	const [providerSearch, setProviderSearch] = useState("");

	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [description, setDescription] = useState("");
	const [systemPrompt, setSystemPrompt] = useState("");
	const [visibility, setVisibility] = useState<PresetVisibility>("team");
	const [routingMode, setRoutingMode] = useState<PresetRoutingMode>("balanced");
	const router = useRouter();

	const [selectedModels, setSelectedModels] = useState<string[]>([]);
	const [showModelPicker, setShowModelPicker] = useState(false);
	const [providerOrder, setProviderOrder] = useState<string[]>([]);
	const [providerIgnore, setProviderIgnore] = useState<string[]>([]);
	const [showProviderPicker, setShowProviderPicker] = useState(false);
	const [maxPricePrompt, setMaxPricePrompt] = useState("");
	const [maxPriceCompletion, setMaxPriceCompletion] = useState("");
	const [throughputP50, setThroughputP50] = useState("");
	const [throughputP75, setThroughputP75] = useState("");
	const [throughputP90, setThroughputP90] = useState("");
	const [throughputP99, setThroughputP99] = useState("");
	const [latencyP50, setLatencyP50] = useState("");
	const [latencyP75, setLatencyP75] = useState("");
	const [latencyP90, setLatencyP90] = useState("");
	const [latencyP99, setLatencyP99] = useState("");
	const [requiredExecutionRegion, setRequiredExecutionRegion] = useState("");
	const [requiredDataRegion, setRequiredDataRegion] = useState("");
	const [requireZeroDataRetention, setRequireZeroDataRetention] = useState(false);

	const [temperature, setTemperature] = useState("");
	const [topP, setTopP] = useState("");
	const [topK, setTopK] = useState("");
	const [frequencyPenalty, setFrequencyPenalty] = useState("");
	const [presencePenalty, setPresencePenalty] = useState("");
	const [repetitionPenalty, setRepetitionPenalty] = useState("");
	const [maxTokens, setMaxTokens] = useState("");
	const [seed, setSeed] = useState("");

	const [reasoningEnabled, setReasoningEnabled] = useState(false);
	const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
	const [reasoningMaxTokens, setReasoningMaxTokens] = useState("");
	const [excludeReasoningTokens, setExcludeReasoningTokens] = useState(false);
	const [responseHealingEnabled, setResponseHealingEnabled] = useState(false);
	const [responseHealingMode, setResponseHealingMode] =
		useState<ResponseHealingMode>("safe");
	const [responseCachingEnabled, setResponseCachingEnabled] = useState(false);
	const [responseCachingTtl, setResponseCachingTtl] = useState("300");

	const activeModels = useMemo(() => {
		return models.filter(
			(m) => !EXCLUDED_STATUSES.includes((m.status || "").toLowerCase())
		);
	}, [models]);

	const providerList = useMemo(() => {
		return providers
			.map((p) => ({
				id: p.api_provider_name.toLowerCase().replace(/\s+/g, "").replace(/-/g, ""),
				name: p.api_provider_name,
				logoId: getProviderLogoId(p.api_provider_name),
			}))
			.filter((p) => p.id.length > 0);
	}, [providers]);

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
		return parts.length > 0 ? parts.join(", ") : "Any eligible provider";
	}, [
		performanceHintCount,
		providerIgnore.length,
		providerOrder.length,
		requiredExecutionRegion,
		requiredDataRegion,
		requireZeroDataRetention,
	]);

	const pluginsSummary = responseHealingEnabled
		? `Response healing (${responseHealingMode})`
		: "No preset plugins enabled";

	const identitySummary = [
		`@${buildPresetSlugPreview(slug || name) || "new-preset"}`,
		visibility === "private"
			? "Only me"
			: visibility === "team"
				? "Workspace"
				: "Public",
	].join(", ");

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

	const modelsSummary =
		selectedModels.length > 0
			? `${selectedModels.length} selected, ${getModelName(selectedModels[0])} default`
			: "No model configured";

	function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
		setName(e.target.value);
	}

	function toggleArrayItem<T>(array: T[], item: T): T[] {
		if (array.includes(item)) {
			return array.filter((i) => i !== item);
		}
		return [...array, item];
	}

	function getModelName(id: string) {
		const model = activeModels.find((m) => m.model_id === id);
		return model?.name || id;
	}

	function getModelOrgInfo(id: string) {
		const model = activeModels.find((m) => m.model_id === id);
		return {
			name: model?.organisation_name || null,
			colour: model?.organisation_colour || null,
		};
	}

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();

		const trimmedName = name.trim();
		const slugPreview = buildPresetSlugPreview(slug || trimmedName);
		if (!trimmedName) {
			toast.error("Preset name is required");
			return;
		}
		if (!slugPreview) {
			toast.error("Preset slug is required");
			return;
		}
		if (selectedModels.length === 0) {
			toast.error("Select at least one model for this preset.");
			return;
		}
		if (!currentUserId || !currentTeamId) {
			toast.error("You must be signed in and in a workspace to create a preset.");
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
			await createPresetAction({
				name: `@${trimmedName.replace(/^@+/, "")}`,
				slug: slugPreview,
				description,
				visibility,
				config,
				creatorUserId: currentUserId,
				workspaceId: currentTeamId,
			});
			toast.success("Preset created");
			router.push("/settings/presets");
			router.refresh();
		} catch (error) {
			console.error("Failed to create preset:", error);
			toast.error(error instanceof Error ? error.message : "Failed to create preset");
		} finally {
			setLoading(false);
		}
	}

	return (
		<form onSubmit={onSubmit} className="space-y-8">
			{activeView === "overview" ? (
				<>
					<div className="space-y-6">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="min-w-0 flex-1">
								<Label htmlFor="preset-name" className="sr-only">
									Preset name
								</Label>
								<div className="flex items-center gap-2">
									<AtSign className="h-6 w-6 shrink-0 text-muted-foreground" />
									<Input
										id="preset-name"
										value={name}
										onChange={handleNameChange}
										placeholder="New Preset"
										className="h-auto border-0 bg-transparent px-0 py-0 text-4xl font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0 md:text-3xl"
									/>
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Button type="button" variant="outline" asChild disabled={loading}>
									<Link href="/settings/presets">Cancel</Link>
								</Button>
								<Button type="submit" disabled={loading || !name.trim()}>
									{loading ? "Saving..." : "Create"}
								</Button>
							</div>
						</div>

						<div className="space-y-3">
							<Textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="When should this preset be used?"
								className="min-h-0 h-10 resize-none overflow-hidden border-0 bg-transparent px-0 py-2 text-base text-muted-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:ring-0"
							/>
						</div>
					</div>

					<Separator />

					<div className="space-y-2">
						<div className="text-sm font-medium">Configuration groups</div>
						<p className="text-sm text-muted-foreground">
							Open one group at a time instead of working through a single long form.
						</p>
					</div>
					<div className="overflow-hidden rounded-xl border border-border/70">
						<SectionLinkRow
							title="Identity & Sharing"
							description="Set the invocation slug and who can use this preset."
							summary={identitySummary}
							onClick={() => setActiveView("identity")}
						/>
						<SectionLinkRow
							title="Model Selection"
							description="Pick the models this preset can use. The first selected model becomes the default."
							summary={modelsSummary}
							onClick={() => setActiveView("models")}
						/>
						<SectionLinkRow
							title="Provider Routing"
							description="Choose provider fallback order, exclusions, and routing performance thresholds."
							summary={providerRoutingSummary}
							onClick={() => setActiveView("providers")}
						/>
						<SectionLinkRow
							title="Request Defaults"
							description="Set routing behavior, response caching, and prompt defaults."
							summary={requestDefaultsSummary}
							onClick={() => setActiveView("defaults")}
						/>
						<SectionLinkRow
							title="Plugins"
							description="Enable deterministic gateway plugins for this preset."
							summary={pluginsSummary}
							onClick={() => setActiveView("plugins")}
						/>
						<SectionLinkRow
							title="Generation Parameters"
							description="Set sampling and deterministic defaults."
							summary={
								parameterOverrideCount > 0
									? `${parameterOverrideCount} overrides`
									: "Model defaults"
							}
							onClick={() => setActiveView("parameters")}
						/>
						<SectionLinkRow
							title="Reasoning Configuration"
							description="Configure reasoning-specific behavior when supported."
							summary={reasoningSummary}
							onClick={() => setActiveView("reasoning")}
						/>
					</div>
				</>
			) : null}

			{activeView === "identity" ? (
				<div className="space-y-6">
					<button
						type="button"
						onClick={() => setActiveView("overview")}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ChevronLeft className="h-4 w-4" />
						<span>Overview / Identity & Sharing</span>
					</button>
					<FormSection
						icon={<AtSign className="h-4 w-4" />}
						title="Identity & Sharing"
						description="Choose how requests invoke this preset and who can use it."
						stacked
					>
						<div className="space-y-2">
							<Label>Invocation Slug *</Label>
							<Input
								value={slug}
								onChange={(e) => setSlug(e.target.value)}
								placeholder={buildPresetSlugPreview(name) || "my-preset-name"}
							/>
							<p className="text-xs text-muted-foreground">
								Requests will reference <span className="font-mono">@{buildPresetSlugPreview(slug || name) || "my-preset-name"}</span>.
							</p>
						</div>

						<div className="space-y-2">
							<Label>Visibility</Label>
							<Select
								value={visibility}
								onValueChange={(value: PresetVisibility) => setVisibility(value)}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select visibility" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="private">Only me</SelectItem>
									<SelectItem value="team">Share with workspace</SelectItem>
									<SelectItem value="public">Make public (future marketplace)</SelectItem>
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								Private presets are only visible to you. Workspace presets can be used by
								anyone in the workspace. Public presets are planned for a future marketplace.
							</p>
						</div>
					</FormSection>
				</div>
			) : null}

			{activeView === "defaults" ? (
				<div className="space-y-6">
					<button
						type="button"
						onClick={() => setActiveView("overview")}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ChevronLeft className="h-4 w-4" />
						<span>Overview / Request Defaults</span>
					</button>
					<FormSection
						icon={<Sliders className="h-4 w-4" />}
						title="Request Defaults"
						description="Set the default routing profile, caching policy, and system prompt for requests using this preset."
						stacked
					>
						<div className="space-y-2">
							<Label>Preferred Routing Profile</Label>
							<Select
								value={routingMode}
								onValueChange={(value: PresetRoutingMode) => setRoutingMode(value)}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select routing profile" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="balanced">Balanced</SelectItem>
									<SelectItem value="price">Lowest cost</SelectItem>
									<SelectItem value="latency">Lowest latency</SelectItem>
									<SelectItem value="throughput">Highest throughput</SelectItem>
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								This overrides the workspace routing mode when requests use this preset.
							</p>
						</div>

						<div className="space-y-3 rounded-lg border p-4">
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label>Enable Response Caching</Label>
									<p className="text-xs text-muted-foreground">
										Cache exact-match non-stream text responses for requests using this preset.
									</p>
								</div>
								<Switch
									checked={responseCachingEnabled}
									onCheckedChange={setResponseCachingEnabled}
								/>
							</div>
							{responseCachingEnabled && (
								<div className="space-y-2">
									<Label>Cache TTL (seconds)</Label>
									<Input
										type="number"
										min="30"
										max="86400"
										value={responseCachingTtl}
										onChange={(e) => setResponseCachingTtl(e.target.value)}
										placeholder="300"
									/>
									<p className="text-xs text-muted-foreground">
										Controls how long cached responses remain reusable for exact request matches.
									</p>
								</div>
							)}
						</div>

						<div className="space-y-2">
							<Label>System Prompt</Label>
							<Textarea
								value={systemPrompt}
								onChange={(e) => setSystemPrompt(e.target.value)}
								placeholder="You are a helpful AI assistant..."
								rows={6}
							/>
							<p className="text-xs text-muted-foreground">
								This system prompt will be prepended to all requests using this preset
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
						<span>Overview / Plugins</span>
					</button>
					<FormSection
						icon={<Settings2 className="h-4 w-4" />}
						title="Plugins"
						description="Enable deterministic gateway plugins that should apply whenever this preset is used."
						stacked
					>
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label>Response Healing</Label>
							<p className="text-xs text-muted-foreground">
								Repair near-valid structured JSON responses before they reach the client.
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
								<Label>Healing Mode</Label>
								<Select
									value={responseHealingMode}
									onValueChange={(value: ResponseHealingMode) =>
										setResponseHealingMode(value)
									}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select healing mode" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="safe">Safe</SelectItem>
										<SelectItem value="strict">Strict</SelectItem>
									</SelectContent>
								</Select>
								<p className="text-xs text-muted-foreground">
									{responseHealingMode === "strict"
										? "Strict mode only unwraps already-valid JSON from fences or surrounding text."
										: "Safe mode enables the full bounded JSON repair path for structured-output workflows."}
								</p>
							</div>
							<p className="text-xs text-muted-foreground">
								Request-level plugin settings can still override this default by plugin ID.
							</p>
						</div>
					)}
					</FormSection>
				</div>
			) : null}

			{activeView === "models" ? (
				<div className="space-y-6">
					<button
						type="button"
						onClick={() => setActiveView("overview")}
						className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<ChevronLeft className="h-4 w-4" />
						<span>Overview / Model Selection</span>
					</button>
					<FormSection
						icon={<Sliders className="h-4 w-4" />}
						title="Model Selection"
						description="Select the models this preset should use. The first model becomes the default, and the remaining models stay available in the preset allowlist."
						stacked
					>
						<div className="space-y-3">
							<div className="flex items-center justify-between gap-3">
								<div>
									<div className="text-sm font-medium">Selected models</div>
									<p className="text-xs text-muted-foreground">
										The first selected model is the default resolved model for this preset.
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setShowModelPicker((prev) => !prev)}
									>
										<Plus className="mr-2 h-4 w-4" />
										Add model
									</Button>
									{selectedModels.length > 0 ? (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => setSelectedModels([])}
										>
											Clear
										</Button>
									) : null}
								</div>
							</div>
							<div className="rounded-lg border p-3">
								{selectedModels.length > 0 ? (
									<div className="flex flex-wrap gap-2">
										{selectedModels.map((id, index) => {
											const orgInfo = getModelOrgInfo(id);
											return (
												<div
													key={id}
													className="inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1"
												>
													<span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[11px] font-medium">
														{index + 1}
													</span>
													{orgInfo.name ? (
														<Logo
															id={orgInfo.name.toLowerCase().replace(/\s+/g, "-")}
															className="h-5 w-5 rounded-full"
															alt={orgInfo.name}
															width={20}
															height={20}
														/>
													) : null}
													<span className="max-w-[180px] truncate text-sm font-medium">
														{getModelName(id)}
													</span>
													{index === 0 ? (
														<Badge variant="secondary" className="h-5 text-[10px]">
															Default
														</Badge>
													) : null}
													<div className="flex items-center gap-1">
														<Button
															type="button"
															variant="ghost"
															size="icon"
															className="h-6 w-6"
															disabled={index === 0}
															onClick={() =>
																setSelectedModels((prev) =>
																	moveOrderedItem(prev, index, -1),
																)
															}
														>
															<ChevronLeft className="h-3.5 w-3.5" />
														</Button>
														<Button
															type="button"
															variant="ghost"
															size="icon"
															className="h-6 w-6"
															disabled={index === selectedModels.length - 1}
															onClick={() =>
																setSelectedModels((prev) =>
																	moveOrderedItem(prev, index, 1),
																)
															}
														>
															<ChevronRight className="h-3.5 w-3.5" />
														</Button>
														<Button
															type="button"
															variant="ghost"
															size="icon"
															className="h-6 w-6"
															onClick={() =>
																setSelectedModels((prev) => prev.filter((modelId) => modelId !== id))
															}
														>
															<X className="h-3.5 w-3.5" />
														</Button>
													</div>
												</div>
											);
										})}
									</div>
								) : (
									<p className="text-sm text-muted-foreground">
										No models selected yet.
									</p>
								)}
							</div>
						</div>

						{showModelPicker ? (
							<div className="space-y-3 rounded-lg border p-3">
								<div className="relative">
									<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<Input
										value={modelSearch}
										onChange={(e) => setModelSearch(e.target.value)}
										placeholder="Search models..."
										className="pl-9"
									/>
								</div>
								{filteredModels.length > 0 ? (
									<div className="max-h-96 overflow-y-auto rounded-md border">
										{filteredModels.map((model) => {
											const orgInfo = getModelOrgInfo(model.model_id);
											const selectedIndex = selectedModels.indexOf(model.model_id);
											const isSelected = selectedIndex >= 0;
											return (
												<button
													key={model.model_id}
													type="button"
													className="flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/20"
													onClick={() =>
														setSelectedModels((prev) =>
															prev.includes(model.model_id)
																? prev.filter((entry) => entry !== model.model_id)
																: [...prev, model.model_id],
														)
													}
												>
													<div className="flex h-5 w-5 items-center justify-center rounded-sm border text-[11px]">
														{isSelected ? selectedIndex + 1 : null}
													</div>
													{orgInfo.name ? (
														<Logo
															id={orgInfo.name.toLowerCase().replace(/\s+/g, "-")}
															className="h-8 w-8 rounded-full"
															alt={orgInfo.name}
															width={32}
															height={32}
														/>
													) : null}
													<div className="min-w-0 flex-1">
														<div className="truncate text-sm font-medium">{model.name}</div>
														<div className="flex items-center gap-2 text-xs text-muted-foreground">
															{orgInfo.name ? <span className="truncate">{orgInfo.name}</span> : null}
															{model.status && model.status !== "active" ? (
																<Badge variant="outline" className="h-4 text-[10px]">
																	{model.status}
																</Badge>
															) : null}
														</div>
													</div>
													{isSelected && selectedIndex === 0 ? (
														<Badge variant="secondary" className="h-5 text-[10px]">
															Default
														</Badge>
													) : null}
												</button>
											);
										})}
									</div>
								) : (
									<p className="py-8 text-center text-sm text-muted-foreground">
										No models found matching your search.
									</p>
								)}
							</div>
						) : null}
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
						<span>Overview / Provider Routing</span>
					</button>
					<FormSection
						icon={<Settings2 className="h-4 w-4" />}
						title="Provider Routing"
						description="Choose provider fallback order, block providers you never want used, and set price or performance routing thresholds."
						stacked
					>
						<div className="space-y-3">
							<div className="flex items-center justify-between gap-3">
								<div>
									<div className="text-sm font-medium">Provider order</div>
									<p className="text-xs text-muted-foreground">
										Select providers in order. The router will prefer the first available provider from this ordered subset.
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => setShowProviderPicker((prev) => !prev)}
									>
										<Plus className="mr-2 h-4 w-4" />
										Select providers
									</Button>
									{providerOrder.length > 0 ? (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => setProviderOrder([])}
										>
											Clear
										</Button>
									) : null}
								</div>
							</div>
							<div className="rounded-lg border p-3">
								{providerOrder.length > 0 ? (
									<div className="flex flex-wrap items-center gap-2">
										{providerOrder.map((providerId, index) => {
											const provider = providerList.find((entry) => entry.id === providerId);
											return (
												<React.Fragment key={providerId}>
													<div className="inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1">
														<span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[11px] font-medium">
															{index + 1}
														</span>
														{provider ? (
															<Logo
																id={provider.logoId}
																className="h-5 w-5 rounded-full"
																alt={provider.name}
																width={20}
																height={20}
															/>
														) : null}
														<span className="text-sm font-medium">
															{provider?.name ?? providerId}
														</span>
														<div className="flex items-center gap-1">
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="h-6 w-6"
																disabled={index === 0}
																onClick={() =>
																	setProviderOrder((prev) =>
																		moveOrderedItem(prev, index, -1),
																	)
																}
															>
																<ChevronLeft className="h-3.5 w-3.5" />
															</Button>
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="h-6 w-6"
																disabled={index === providerOrder.length - 1}
																onClick={() =>
																	setProviderOrder((prev) =>
																		moveOrderedItem(prev, index, 1),
																	)
																}
															>
																<ChevronRight className="h-3.5 w-3.5" />
															</Button>
															<Button
																type="button"
																variant="ghost"
																size="icon"
																className="h-6 w-6"
																onClick={() =>
																	setProviderOrder((prev) =>
																		prev.filter((entry) => entry !== providerId),
																	)
																}
															>
																<X className="h-3.5 w-3.5" />
															</Button>
														</div>
													</div>
													{index < providerOrder.length - 1 ? (
														<ChevronRight className="h-4 w-4 text-muted-foreground" />
													) : null}
												</React.Fragment>
											);
										})}
									</div>
								) : (
									<p className="text-sm text-muted-foreground">
										No provider order configured. Any eligible provider may be used.
									</p>
								)}
							</div>
						</div>

						{showProviderPicker ? (
							<div className="space-y-3 rounded-lg border p-3">
								<div className="relative">
									<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<Input
										value={providerSearch}
										onChange={(e) => setProviderSearch(e.target.value)}
										placeholder="Search providers..."
										className="pl-9"
									/>
								</div>
								<div className="max-h-80 overflow-y-auto rounded-md border">
									{filteredProviders.map((provider) => {
										const selectedIndex = providerOrder.indexOf(provider.id);
										const isSelected = selectedIndex >= 0;
										return (
											<button
												key={provider.id}
												type="button"
												className="flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/20"
												onClick={() =>
													setProviderOrder((prev) =>
														prev.includes(provider.id)
															? prev.filter((entry) => entry !== provider.id)
															: [...prev, provider.id],
													)
												}
											>
												<div className="flex h-5 w-5 items-center justify-center rounded-sm border text-[11px]">
													{isSelected ? selectedIndex + 1 : null}
												</div>
												<Logo
													id={provider.logoId}
													className="h-6 w-6 rounded-full"
													alt={provider.name}
													width={24}
													height={24}
												/>
												<span className="text-sm font-medium">{provider.name}</span>
											</button>
										);
									})}
								</div>
							</div>
						) : null}

						<div className="space-y-3">
							<div className="text-sm font-medium">Blocked providers</div>
							<p className="text-xs text-muted-foreground">
								These providers will never be used, even if they support the selected model.
							</p>
							<div className="flex flex-wrap gap-2 rounded-lg border p-3">
								{providerList.map((provider) => {
									const isIgnored = providerIgnore.includes(provider.id);
									return (
										<Button
											key={`ignore-${provider.id}`}
											type="button"
											variant={isIgnored ? "secondary" : "ghost"}
											size="sm"
											className="gap-2"
											onClick={() =>
												setProviderIgnore((prev) => toggleArrayItem(prev, provider.id))
											}
										>
											<Logo
												id={provider.logoId}
												className="h-4 w-4 rounded-full"
												alt={provider.name}
												width={16}
												height={16}
											/>
											<span>{provider.name}</span>
										</Button>
									);
								})}
							</div>
						</div>

						<div className="space-y-5">
							<div className="space-y-3 rounded-lg border p-4">
								<div className="space-y-1">
									<Label>Residency requirements</Label>
									<p className="text-xs text-muted-foreground">
										Restrict routing to providers that advertise matching execution or data residency metadata.
									</p>
								</div>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label>Required execution region</Label>
										<Select
											value={requiredExecutionRegion || "any"}
											onValueChange={(value) =>
												setRequiredExecutionRegion(value === "any" ? "" : value)
											}
										>
											<SelectTrigger>
												<SelectValue placeholder="Any region" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="any">Any region</SelectItem>
												<SelectItem value="eu">EU</SelectItem>
												<SelectItem value="us">US</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label>Required data region</Label>
										<Select
											value={requiredDataRegion || "any"}
											onValueChange={(value) =>
												setRequiredDataRegion(value === "any" ? "" : value)
											}
										>
											<SelectTrigger>
												<SelectValue placeholder="Any region" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="any">Any region</SelectItem>
												<SelectItem value="eu">EU</SelectItem>
												<SelectItem value="us">US</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>
								<div className="flex items-center justify-between gap-4 rounded-md border border-border/70 px-3 py-3">
									<div className="space-y-1">
										<div className="text-sm font-medium">
											Require zero data retention support
										</div>
										<p className="text-xs text-muted-foreground">
											Only route to providers that advertise default or optional zero-retention support.
										</p>
									</div>
									<Switch
										checked={requireZeroDataRetention}
										onCheckedChange={setRequireZeroDataRetention}
									/>
								</div>
							</div>
							<div className="text-sm font-medium">Performance routing</div>
							<div className="space-y-3 rounded-lg border p-4">
								<div className="space-y-1">
									<Label>max_price</Label>
									<p className="text-xs text-muted-foreground">
										Maximum price per million tokens for prompt and completion before the provider is deprioritized.
									</p>
								</div>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label>Prompt</Label>
										<Input
											type="number"
											step="0.01"
											min="0"
											value={maxPricePrompt}
											onChange={(e) => setMaxPricePrompt(e.target.value)}
											placeholder="e.g. 0.25"
										/>
									</div>
									<div className="space-y-2">
										<Label>Completion</Label>
										<Input
											type="number"
											step="0.01"
											min="0"
											value={maxPriceCompletion}
											onChange={(e) => setMaxPriceCompletion(e.target.value)}
											placeholder="e.g. 1.50"
										/>
									</div>
								</div>
							</div>

							<div className="space-y-3 rounded-lg border p-4">
								<div className="space-y-1">
									<Label>preferred_min_throughput</Label>
									<p className="text-xs text-muted-foreground">
										Preferred minimum throughput in tokens per second. Endpoints below these thresholds may still be used, but are deprioritized in routing.
									</p>
								</div>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label>p50</Label>
										<Input type="number" min="0" value={throughputP50} onChange={(e) => setThroughputP50(e.target.value)} placeholder="e.g. 100" />
									</div>
									<div className="space-y-2">
										<Label>p75</Label>
										<Input type="number" min="0" value={throughputP75} onChange={(e) => setThroughputP75(e.target.value)} placeholder="e.g. 100" />
									</div>
									<div className="space-y-2">
										<Label>p90</Label>
										<Input type="number" min="0" value={throughputP90} onChange={(e) => setThroughputP90(e.target.value)} placeholder="e.g. 100" />
									</div>
									<div className="space-y-2">
										<Label>p99</Label>
										<Input type="number" min="0" value={throughputP99} onChange={(e) => setThroughputP99(e.target.value)} placeholder="e.g. 100" />
									</div>
								</div>
							</div>

							<div className="space-y-3 rounded-lg border p-4">
								<div className="space-y-1">
									<Label>preferred_max_latency</Label>
									<p className="text-xs text-muted-foreground">
										Preferred maximum latency in seconds. Endpoints above these thresholds may still be used, but are deprioritized in routing.
									</p>
								</div>
								<div className="grid gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Label>p50</Label>
										<Input type="number" min="0" value={latencyP50} onChange={(e) => setLatencyP50(e.target.value)} placeholder="e.g. 5" />
									</div>
									<div className="space-y-2">
										<Label>p75</Label>
										<Input type="number" min="0" value={latencyP75} onChange={(e) => setLatencyP75(e.target.value)} placeholder="e.g. 5" />
									</div>
									<div className="space-y-2">
										<Label>p90</Label>
										<Input type="number" min="0" value={latencyP90} onChange={(e) => setLatencyP90(e.target.value)} placeholder="e.g. 5" />
									</div>
									<div className="space-y-2">
										<Label>p99</Label>
										<Input type="number" min="0" value={latencyP99} onChange={(e) => setLatencyP99(e.target.value)} placeholder="e.g. 5" />
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
						<span>Overview / Generation Parameters</span>
					</button>
					<FormSection
						icon={<Sliders className="h-4 w-4" />}
						title="Generation Parameters"
						description="Set deterministic and sampling defaults that apply to requests using this preset."
						stacked
					>
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
						<div className="space-y-2">
							<Label>Temperature</Label>
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
								Controls randomness. Lower is more focused (0-2)
							</p>
						</div>

						<div className="space-y-2">
							<Label>Top P</Label>
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
								Nucleus sampling threshold (0-1)
							</p>
						</div>

						<div className="space-y-2">
							<Label>Top K</Label>
							<Input
								type="number"
								min="0"
								value={topK}
								onChange={(e) => setTopK(e.target.value)}
								placeholder="40"
							/>
							<p className="text-xs text-muted-foreground">
								Token vocabulary cutoff (0 for unlimited)
							</p>
						</div>

						<div className="space-y-2">
							<Label>Max Tokens</Label>
							<Input
								type="number"
								min="1"
								value={maxTokens}
								onChange={(e) => setMaxTokens(e.target.value)}
								placeholder="4096"
							/>
							<p className="text-xs text-muted-foreground">
								Maximum response tokens
							</p>
						</div>

						<div className="space-y-2">
							<Label>Frequency Penalty</Label>
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
								Reduce repetition (-2 to 2)
							</p>
						</div>

						<div className="space-y-2">
							<Label>Presence Penalty</Label>
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
								Reduce repetition (-2 to 2)
							</p>
						</div>

						<div className="space-y-2">
							<Label>Repetition Penalty</Label>
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
								Penalize repeated tokens (1 to 2+)
							</p>
						</div>

						<div className="space-y-2">
							<Label>Seed</Label>
							<Input
								type="number"
								value={seed}
								onChange={(e) => setSeed(e.target.value)}
								placeholder="Random"
							/>
							<p className="text-xs text-muted-foreground">
								Deterministic output when specified
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
						<span>Overview / Reasoning Configuration</span>
					</button>
					<FormSection
						icon={<Shield className="h-4 w-4" />}
						title="Reasoning Configuration"
						description="Configure reasoning settings for models that expose reasoning-specific controls."
						stacked
					>
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label>Enable Reasoning</Label>
							<p className="text-xs text-muted-foreground">
								Enable chain-of-thought reasoning for supported models
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
									<Label>Reasoning Effort</Label>
									<Select
										value={reasoningEffort}
										onValueChange={(v) =>
											setReasoningEffort(v as ReasoningEffort)
										}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select effort level" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="low">Low</SelectItem>
											<SelectItem value="medium">Medium</SelectItem>
											<SelectItem value="high">High</SelectItem>
										</SelectContent>
									</Select>
									<p className="text-xs text-muted-foreground">
										Higher effort = more thorough reasoning but more tokens
									</p>
								</div>

								<div className="space-y-2">
									<Label>Reasoning Max Tokens</Label>
									<Input
										type="number"
										min="1"
										value={reasoningMaxTokens}
										onChange={(e) =>
											setReasoningMaxTokens(e.target.value)
										}
										placeholder="Leave empty for model default"
									/>
									<p className="text-xs text-muted-foreground">
										Maximum tokens for reasoning process
									</p>
								</div>
							</div>

							<div className="flex items-center justify-between pt-2">
								<div className="space-y-0.5">
									<Label>Exclude Reasoning from Output</Label>
									<p className="text-xs text-muted-foreground">
										Don&apos;t include reasoning tokens in final response
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
