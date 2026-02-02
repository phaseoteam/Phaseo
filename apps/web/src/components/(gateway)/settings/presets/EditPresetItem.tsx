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
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
	DialogClose,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Edit2, Search, X, Settings2, Sliders, Shield, AtSign } from "lucide-react";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { updatePresetAction } from "@/app/(dashboard)/settings/presets/actions";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface APIProviderCard {
	api_provider_id: string;
	api_provider_name: string;
	country_code: string;
}

type ReasoningEffort = "low" | "medium" | "high";
type PresetVisibility = "private" | "team" | "public";

interface EditPresetItemProps {
	p: any;
	providers?: APIProviderCard[];
}

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

export default function EditPresetItem({ p, providers = [] }: EditPresetItemProps) {
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [providerSearch, setProviderSearch] = useState("");

	const [name, setName] = useState(
		typeof p.name === "string" ? p.name.replace(/^@+/, "") : ""
	);
	const [description, setDescription] = useState(p.description || "");
	const [systemPrompt, setSystemPrompt] = useState(p.config?.system_prompt || "");
	const [visibility, setVisibility] = useState<PresetVisibility>(
		(p.visibility as PresetVisibility) || "team"
	);

	const [selectedModels, setSelectedModels] = useState<string[]>(
		p.config?.models || []
	);
	const [providerOnly, setProviderOnly] = useState<string[]>(
		p.config?.only_providers || []
	);
	const [providerIgnore, setProviderIgnore] = useState<string[]>(
		p.config?.ignore_providers || []
	);

	const [temperature, setTemperature] = useState(
		p.config?.parameters?.temperature !== null && p.config?.parameters?.temperature !== undefined
			? p.config.parameters.temperature.toString()
			: ""
	);
	const [topP, setTopP] = useState(p.config?.parameters?.top_p?.toString() || "");
	const [topK, setTopK] = useState(p.config?.parameters?.top_k?.toString() || "");
	const [frequencyPenalty, setFrequencyPenalty] = useState(
		p.config?.parameters?.frequency_penalty?.toString() || ""
	);
	const [presencePenalty, setPresencePenalty] = useState(
		p.config?.parameters?.presence_penalty?.toString() || ""
	);
	const [repetitionPenalty, setRepetitionPenalty] = useState(
		p.config?.parameters?.repetition_penalty?.toString() || ""
	);
	const [maxTokens, setMaxTokens] = useState(
		p.config?.parameters?.max_tokens?.toString() || ""
	);
	const [seed, setSeed] = useState(p.config?.parameters?.seed?.toString() || "");

	const [reasoningEnabled, setReasoningEnabled] = useState(
		p.config?.reasoning?.enabled || false
	);
	const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
		(p.config?.reasoning?.effort as ReasoningEffort) || "medium"
	);
	const [reasoningMaxTokens, setReasoningMaxTokens] = useState(
		p.config?.reasoning?.max_tokens?.toString() || ""
	);
	const [excludeReasoningTokens, setExcludeReasoningTokens] = useState(
		p.config?.reasoning?.exclude_from_output || false
	);

	const providerNames = useMemo(() => {
		return providers
			.map((p) => ({
				id: p.api_provider_name.toLowerCase().replace(/\s+/g, "").replace(/-/g, ""),
				name: p.api_provider_name,
				logoId: getProviderLogoId(p.api_provider_name),
			}))
			.filter((p) => p.id.length > 0);
	}, [providers]);

	const filteredProviderNames = useMemo(() => {
		if (!providerSearch.trim()) return providerNames;
		const search = providerSearch.toLowerCase();
		return providerNames.filter((p) => p.name.toLowerCase().includes(search));
	}, [providerNames, providerSearch]);

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
		const model = p.all_models?.find((m: any) => m.model_id === id);
		return model?.name || id;
	}

	function getModelOrgInfo(id: string) {
		const model = p.all_models?.find((m: any) => m.model_id === id);
		return {
			name: model?.organisation_name || null,
			colour: model?.organisation_colour || null,
		};
	}

	async function onSave(e?: React.FormEvent) {
		e?.preventDefault();
		const trimmedName = name.trim();
		if (!trimmedName) {
			toast.error("Preset name is required");
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

		const updates = {
			id: p.id,
			name: `@${trimmedName.replace(/^@+/, "")}`,
			description,
			visibility,
			config,
		};

		console.log("Updating preset:", updates);

		try {
			await updatePresetAction(updates);
			toast.success("Preset updated successfully");
		} catch (error) {
			console.error("Failed to update preset:", error);
			toast.error(error instanceof Error ? error.message : "Failed to update preset");
		}

		setLoading(false);
		setOpen(false);
	}

	return (
		<>
			<DropdownMenuItem asChild>
				<button
					className="w-full text-left flex items-center gap-2"
					onClick={(e) => {
						e.preventDefault();
						setTimeout(() => setOpen(true), 0);
					}}
				>
					<Edit2 className="mr-2" />
					Edit
				</button>
			</DropdownMenuItem>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Edit Preset: {p.name}</DialogTitle>
						<DialogDescription>
							Update this preset configuration.
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={onSave} className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Settings2 className="h-4 w-4" />
									Preset Identity
								</CardTitle>
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
								</div>

								<div className="space-y-2">
									<Label>Description</Label>
									<Textarea
										value={description}
										onChange={(e) => setDescription(e.target.value)}
										placeholder="Brief description"
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
										rows={4}
									/>
								</div>
							</CardContent>
						</Card>

						<Separator />

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Settings2 className="h-4 w-4" />
									Provider Preferences
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
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
									<div className="grid grid-cols-3 lg:grid-cols-4 gap-2 p-2 border rounded-md max-h-40 overflow-y-auto">
										{filteredProviderNames.map((provider) => (
											<label
												key={`only-${provider.id}`}
												className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
											>
												<input
													type="checkbox"
													checked={providerOnly.includes(provider.id)}
													onChange={() =>
														setProviderOnly((prev) =>
															toggleArrayItem(prev, provider.id)
														)
													}
													className="rounded border-gray-300"
												/>
												<Logo
													id={provider.logoId}
													className="w-5 h-5 rounded-full"
													alt={provider.name}
													width={20}
													height={20}
												/>
												<span className="text-sm capitalize truncate">{provider.name}</span>
											</label>
										))}
									</div>
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
									<div className="grid grid-cols-3 lg:grid-cols-4 gap-2 p-2 border rounded-md max-h-40 overflow-y-auto">
										{filteredProviderNames.map((provider) => (
											<label
												key={`ignore-${provider.id}`}
												className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
											>
												<input
													type="checkbox"
													checked={providerIgnore.includes(provider.id)}
													onChange={() =>
														setProviderIgnore((prev) =>
															toggleArrayItem(prev, provider.id)
														)
													}
													className="rounded border-gray-300"
												/>
												<Logo
													id={provider.logoId}
													className="w-5 h-5 rounded-full"
													alt={provider.name}
													width={20}
													height={20}
												/>
												<span className="text-sm capitalize truncate">{provider.name}</span>
											</label>
										))}
									</div>
								</div>
							</CardContent>
						</Card>

						<Separator />

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Sliders className="h-4 w-4" />
									Generation Parameters
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-2 gap-4">
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
									</div>

									<div className="space-y-2">
										<Label>Seed</Label>
										<Input
											type="number"
											value={seed}
											onChange={(e) => setSeed(e.target.value)}
											placeholder="Random"
										/>
									</div>
								</div>
							</CardContent>
						</Card>

						<Separator />

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-base">
									<Shield className="h-4 w-4" />
									Reasoning Configuration
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="flex items-center justify-between">
									<div className="space-y-0.5">
										<Label>Enable Reasoning</Label>
										<p className="text-xs text-muted-foreground">
											Enable chain-of-thought reasoning
										</p>
									</div>
									<Switch
										checked={reasoningEnabled}
										onCheckedChange={setReasoningEnabled}
									/>
								</div>

								{reasoningEnabled && (
									<>
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
												placeholder="Model default"
											/>
										</div>

										<div className="flex items-center justify-between">
											<div className="space-y-0.5">
												<Label>Exclude Reasoning from Output</Label>
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

						<DialogFooter>
							<DialogClose asChild>
								<Button variant="ghost">Cancel</Button>
							</DialogClose>
							<Button type="submit" disabled={loading}>
								{loading ? "Saving..." : "Save"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
