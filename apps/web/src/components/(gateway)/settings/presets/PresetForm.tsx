"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, X, Save, Settings2, AtSign, Shield, Sliders } from "lucide-react";
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

export default function PresetForm({
	models,
	providers,
	currentUserId,
	currentTeamId,
}: PresetFormProps) {
	const [loading, setLoading] = useState(false);
	const [modelSearch, setModelSearch] = useState("");
	const [providerSearch, setProviderSearch] = useState("");

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [systemPrompt, setSystemPrompt] = useState("");
	const [visibility, setVisibility] = useState<PresetVisibility>("team");
	const router = useRouter();

	const [selectedModels, setSelectedModels] = useState<string[]>([]);
	const [providerOnly, setProviderOnly] = useState<string[]>([]);
	const [providerIgnore, setProviderIgnore] = useState<string[]>([]);

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
		if (!trimmedName) {
			toast.error("Preset name is required");
			return;
		}
		if (!currentUserId || !currentTeamId) {
			toast.error("You must be signed in and on a team to create a preset.");
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

		if (providerOnly.length > 0) {
			config.only_providers = providerOnly;
		}

		if (providerIgnore.length > 0) {
			config.ignore_providers = providerIgnore;
		}

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
				description,
				visibility,
				config,
				creatorUserId: currentUserId,
				teamId: currentTeamId,
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
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AtSign className="h-5 w-5" />
						Preset Identity
					</CardTitle>
					<CardDescription>
						The unique name and description for this preset
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label>Preset Name *</Label>
						<InputGroup>
						<InputGroupAddon align="inline-start">
							<AtSign className="h-4 w-4" />
						</InputGroupAddon>
						<InputGroupInput
							value={name}
							onChange={handleNameChange}
							placeholder="my-preset-name"
						/>
					</InputGroup>
					<p className="text-xs text-muted-foreground">
						Unique within your team — we’ll prefix it with @ for you
					</p>
				</div>

					<div className="space-y-2">
						<Label>Description</Label>
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Brief description of when to use this preset"
							rows={3}
						/>
					</div>

					<div className="space-y-2">
						<Label>Visibility</Label>
						<Select
							value={visibility}
							onValueChange={(value: PresetVisibility) =>
								setVisibility(value)
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select visibility" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="private">Only me</SelectItem>
								<SelectItem value="team">Share with team</SelectItem>
								<SelectItem value="public">Make public (future marketplace)</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							Private presets are only visible to you. Team presets can be used by
							anyone on the team. Public presets are planned for a future marketplace.
						</p>
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
				</CardContent>
			</Card>

			<Separator />

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Sliders className="h-5 w-5" />
						Model Selection
					</CardTitle>
					<CardDescription>
						Choose specific models for this preset. Leave empty to allow any model.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{selectedModels.length > 0 && (
						<div className="flex flex-wrap gap-2 p-3 bg-muted rounded-lg">
							<span className="text-xs text-muted-foreground w-full mb-1">
								Selected ({selectedModels.length}):
							</span>
							{selectedModels.map((id) => {
								const orgInfo = getModelOrgInfo(id);
								return (
									<Badge
										key={id}
										variant="secondary"
										className="gap-1 pl-2 pr-1"
									>
										{orgInfo.name ? (
											<Logo
												id={orgInfo.name.toLowerCase().replace(/\s+/g, "-")}
												className="w-5 h-5 rounded-full"
												alt={orgInfo.name}
												width={20}
												height={20}
											/>
										) : (
											<div className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold">
												{getModelName(id).slice(0, 2).toUpperCase()}
											</div>
										)}
										<span className="max-w-[150px] truncate">{getModelName(id)}</span>
										<button
											type="button"
											onClick={() =>
												setSelectedModels((prev) =>
													prev.filter((m) => m !== id)
												)
											}
											className="hover:bg-muted-foreground/20 rounded p-0.5"
										>
											<X className="h-3 w-3" />
										</button>
									</Badge>
								);
							})}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="ml-auto h-6 text-xs"
								onClick={() => setSelectedModels([])}
							>
								Clear all
							</Button>
						</div>
					)}

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
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-80 overflow-y-auto p-2 border rounded-md">
							{filteredModels.map((model) => {
								const orgInfo = getModelOrgInfo(model.model_id);
								const isSelected = selectedModels.includes(model.model_id);
								return (
									<div
										key={model.model_id}
										className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
											isSelected
												? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
												: "hover:bg-muted"
										}`}
										onClick={() =>
											setSelectedModels((prev) =>
												toggleArrayItem(prev, model.model_id)
											)
										}
									>
										<input
											type="checkbox"
											checked={isSelected}
											readOnly
											className="rounded border-gray-300 mt-0.5"
										/>
										{orgInfo.name ? (
											<Logo
												id={orgInfo.name.toLowerCase().replace(/\s+/g, "-")}
												className="w-8 h-8 rounded-full flex-shrink-0"
												alt={orgInfo.name}
												width={32}
												height={32}
											/>
										) : (
											<div
												className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-xs"
												style={{
													backgroundColor: orgInfo.colour || "#e5e7eb",
													color: orgInfo.colour ? "#ffffff" : "#374151",
												}}
											>
												{model.name.slice(0, 2).toUpperCase()}
											</div>
										)}
										<div className="min-w-0 flex-1">
											<div className="font-medium text-sm truncate">
												{model.name}
											</div>
											<div className="flex items-center gap-1">
												{orgInfo.name && (
													<span className="text-xs text-muted-foreground truncate">
														{orgInfo.name}
													</span>
												)}
												{model.status && model.status !== "active" && (
													<Badge variant="outline" className="text-[10px] h-4">
														{model.status}
													</Badge>
												)}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<p className="text-sm text-muted-foreground text-center py-8">
							No models found matching your search
						</p>
					)}
					<p className="text-xs text-muted-foreground">
						Showing {filteredModels.length} active models
					</p>
				</CardContent>
			</Card>

			<Separator />

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Settings2 className="h-5 w-5" />
						Provider Preferences
					</CardTitle>
					<CardDescription>
						Control which providers can or cannot be used with this preset
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="space-y-3">
						<Label className="flex items-center gap-2">
							Only use these providers
							{providerOnly.length > 0 && (
								<Badge variant="secondary" className="text-xs">
									{providerOnly.length} selected
								</Badge>
							)}
						</Label>
						<div className="relative">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
							<Input
								value={providerSearch}
								onChange={(e) => setProviderSearch(e.target.value)}
								placeholder="Search providers..."
								className="pl-9"
							/>
						</div>
						<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-2 border rounded-md max-h-48 overflow-y-auto">
							{filteredProviders.map((provider) => {
								const isSelected = providerOnly.includes(provider.id);
								return (
									<div
										key={`only-${provider.id}`}
										className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
											isSelected
												? "bg-blue-50 dark:bg-blue-900/20 border-blue-300"
												: "hover:bg-muted"
										}`}
										onClick={() =>
											setProviderOnly((prev) =>
												toggleArrayItem(prev, provider.id)
											)
										}
									>
										<input
											type="checkbox"
											checked={isSelected}
											readOnly
											className="rounded border-gray-300"
										/>
										<Logo
											id={provider.logoId}
											className="w-5 h-5 rounded-full"
											alt={provider.name}
											width={20}
											height={20}
										/>
										<span className="text-sm capitalize truncate">
											{provider.name}
										</span>
									</div>
								);
							})}
						</div>
						<p className="text-xs text-muted-foreground">
							If set, only these providers will be used. Leave empty to allow any
							provider.
						</p>
					</div>

					<div className="space-y-3">
						<Label className="flex items-center gap-2">
							Ignore these providers
							{providerIgnore.length > 0 && (
								<Badge variant="destructive" className="text-xs">
									{providerIgnore.length} selected
								</Badge>
							)}
						</Label>
						<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-2 border rounded-md max-h-48 overflow-y-auto">
							{filteredProviders.map((provider) => {
								const isIgnored = providerIgnore.includes(provider.id);
								return (
									<div
										key={`ignore-${provider.id}`}
										className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
											isIgnored
												? "bg-red-50 dark:bg-red-900/20 border-red-300"
												: "hover:bg-muted"
										}`}
										onClick={() =>
											setProviderIgnore((prev) =>
												toggleArrayItem(prev, provider.id)
											)
										}
									>
										<input
											type="checkbox"
											checked={isIgnored}
											readOnly
											className="rounded border-gray-300"
										/>
										<Logo
											id={provider.logoId}
											className="w-5 h-5 rounded-full"
											alt={provider.name}
											width={20}
											height={20}
										/>
										<span className="text-sm capitalize truncate">
											{provider.name}
										</span>
									</div>
								);
							})}
						</div>
						<p className="text-xs text-muted-foreground">
							These providers will never be used, even if model is available.
						</p>
					</div>
				</CardContent>
			</Card>

			<Separator />

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Sliders className="h-5 w-5" />
						Generation Parameters
					</CardTitle>
					<CardDescription>
						Control how the model generates responses
					</CardDescription>
				</CardHeader>
				<CardContent>
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
				</CardContent>
			</Card>

			<Separator />

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5" />
						Reasoning Configuration
					</CardTitle>
					<CardDescription>
						Configure reasoning/extraction capabilities for supported models
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
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
				</CardContent>
			</Card>

			<div className="flex items-center justify-end gap-4 pt-6 border-t">
				<Button type="button" variant="outline">
					Cancel
				</Button>
				<Button type="submit" disabled={loading || !name.startsWith("@")}>
					{loading ? (
						<>Saving...</>
					) : (
						<>
							<Save className="mr-2 h-4 w-4" />
							Save Preset
						</>
					)}
				</Button>
			</div>
		</form>
	);
}
