"use client";

import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { MoreVertical, Copy, AtSign, CheckCircle2, Route } from "lucide-react";
import EditPresetItem from "./EditPresetItem";
import DeletePresetItem from "./DeletePresetItem";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";

interface APIProviderCard {
	api_provider_id: string;
	api_provider_name: string;
	country_code: string;
}

interface PresetsPanelProps {
	teamsWithPresets: any[];
	initialTeamId: string | null;
	currentUserId?: string | null;
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

function PresetLogo({ name, className }: { name: string; className?: string }) {
	const initials = name.slice(1, 3).toUpperCase();

	return (
		<div
			className={`${className} flex items-center justify-center border border-border/70 bg-muted/40 font-mono text-[11px] font-semibold text-muted-foreground`}
		>
			{initials}
		</div>
	);
}

function ConfigPill({
	children,
	tone = "neutral",
}: {
	children: React.ReactNode;
	tone?: "neutral" | "blue" | "green" | "amber" | "violet" | "cyan";
}) {
	const toneClass =
		tone === "blue"
			? "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300"
			: tone === "green"
				? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
				: tone === "amber"
					? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
					: tone === "violet"
						? "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300"
						: tone === "cyan"
							? "border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
							: "border-border/70 bg-muted/40 text-muted-foreground";

	return (
		<span
			className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs font-medium ${toneClass}`}
		>
			{children}
		</span>
	);
}

export default function PresetsPanel({
	teamsWithPresets,
	initialTeamId,
	currentUserId,
	providers = [],
}: PresetsPanelProps) {
	const sortedTeams = useMemo(() => {
		if (!Array.isArray(teamsWithPresets)) return teamsWithPresets;
		const withPresets: any[] = [];
		const withoutPresets: any[] = [];
		for (const t of teamsWithPresets) {
			if (t && Array.isArray(t.presets) && t.presets.length > 0)
				withPresets.push(t);
			else withoutPresets.push(t);
		}
		return [...withPresets, ...withoutPresets];
	}, [teamsWithPresets]);

	function onCopyPresetName(name: string) {
		navigator.clipboard.writeText(name);
		toast.success("Preset name copied", { duration: 2000 });
	}

	if (!sortedTeams || sortedTeams.length === 0) {
		return (
			<Empty className="mt-6 rounded-xl border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<AtSign className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>No presets yet</EmptyTitle>
					<EmptyDescription>
						Create a preset to reuse model, provider, and prompt configuration.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="mt-6 space-y-8">
			{sortedTeams.map((team: any) => (
				<div key={team.id ?? "personal"}>
					<div className="mb-3 flex items-center justify-between gap-3">
						<div>
							<h2 className="text-sm font-semibold text-foreground">
								{team.name}
							</h2>
							<p className="mt-0.5 text-xs text-muted-foreground">
								{team.presets?.length ?? 0} preset
								{(team.presets?.length ?? 0) === 1 ? "" : "s"}
							</p>
						</div>
					</div>
					{!team.presets || team.presets.length === 0 ? (
						<Empty
							size="compact"
							className="rounded-lg border border-dashed border-border/80 p-6"
						>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<AtSign className="h-5 w-5" />
								</EmptyMedia>
								<EmptyTitle className="text-base">No presets for this workspace</EmptyTitle>
								<EmptyDescription>
									Create one to standardize request settings across apps.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="overflow-hidden rounded-xl border border-border/70 bg-card/25">
							{team.presets.map((p: any) => (
								<div
									key={p.id}
									className="relative border-b border-border/70 px-4 py-4 transition-colors last:border-b-0 hover:bg-muted/20 sm:px-5"
								>
									<div className="flex items-start justify-between gap-4">
										<div className="flex min-w-0 flex-1 items-start gap-4">
											<div className="mt-0.5 flex-shrink-0">
												<PresetLogo name={p.name} className="h-9 w-9 rounded-md" />
											</div>
											<div className="min-w-0 flex-1 space-y-2">
												<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
													<h3 className="min-w-0 truncate text-base font-semibold text-foreground">
														{p.name}
													</h3>
													{p.visibility && (
														<Badge
															variant="outline"
															className="h-5 px-1.5 text-[10px] font-semibold uppercase tracking-normal text-muted-foreground"
														>
															{p.visibility}
														</Badge>
													)}
													{p.source_preset_id && (
														<Badge
															variant="secondary"
															className="h-5 px-1.5 text-[10px] font-semibold uppercase tracking-normal"
														>
															Fork
														</Badge>
													)}
												</div>
												{p.slug ? (
													<button
														type="button"
														onClick={() => onCopyPresetName(p.name)}
														className="inline-flex max-w-full items-center gap-2 rounded-md border border-border/70 bg-background/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
													>
														<AtSign className="h-3.5 w-3.5 shrink-0" />
														<span className="truncate font-mono">@{p.slug}</span>
														<Copy className="h-3.5 w-3.5 shrink-0" />
													</button>
												) : null}
												{p.description && (
													<p className="max-w-3xl text-sm leading-6 text-muted-foreground">
														{p.description}
													</p>
												)}
												<div className="flex flex-wrap gap-1.5 pt-1">
													{p.config?.provider && (
														<ConfigPill>
															<Logo
																id={getProviderLogoId(p.config.provider)}
																className="h-4 w-4 rounded-full"
																alt={p.config.provider}
																width={16}
																height={16}
															/>
															{p.config.provider}
														</ConfigPill>
													)}
													{p.config?.model && (
														<ConfigPill>
															{p.config.model}
														</ConfigPill>
													)}
													{p.config?.temperature !== null && p.config?.temperature !== undefined && (
														<ConfigPill>
															temp: {p.config.temperature}
														</ConfigPill>
													)}
													{p.config?.max_tokens && (
														<ConfigPill>
															max: {p.config.max_tokens}
														</ConfigPill>
													)}
													{p.config?.system_prompt && (
														<ConfigPill tone="blue">
															<CheckCircle2 className="h-3.5 w-3.5" />
															System prompt
														</ConfigPill>
													)}
													{p.config?.routing_mode && (
														<ConfigPill tone="green">
															<Route className="h-3.5 w-3.5" />
															{p.config.routing_mode}
														</ConfigPill>
													)}
													{p.config?.provider_preferences &&
														Object.keys(p.config.provider_preferences).length > 0 && (
															<ConfigPill tone="amber">
																weights: {Object.keys(p.config.provider_preferences).length}
															</ConfigPill>
														)}
													{p.config?.response_caching?.enabled && (
														<ConfigPill tone="cyan">
															cache: {p.config?.response_caching?.ttl_seconds ?? 300}s
														</ConfigPill>
													)}
													{Array.isArray(p.config?.plugins) &&
														p.config.plugins.some(
															(plugin: any) =>
																plugin &&
																typeof plugin === "object" &&
																plugin.id === "response-healing" &&
																plugin.enabled !== false,
														) && (
															<ConfigPill tone="violet">
																response healing
																{(() => {
																	const plugin = p.config.plugins.find(
																		(plugin: any) =>
																			plugin &&
																			typeof plugin === "object" &&
																			plugin.id === "response-healing" &&
																			plugin.enabled !== false,
																	);
																	return plugin?.mode === "strict"
																		? " (strict)"
																		: "";
																})()}
															</ConfigPill>
														)}
												</div>
											</div>
										</div>
										<div className="ml-2 flex flex-shrink-0 items-center gap-1">
											<Button
												variant="ghost"
												size="sm"
												className="hidden h-8 gap-2 px-2 text-muted-foreground hover:text-foreground sm:inline-flex"
												onClick={() => onCopyPresetName(p.name)}
											>
												<Copy className="h-4 w-4" />
												Copy
											</Button>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														aria-label="Actions"
														className="h-8 w-8 text-muted-foreground hover:text-foreground"
													>
														<MoreVertical className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent
													side="bottom"
													align="end"
												>
													<DropdownMenuItem asChild>
														<button
															className="w-full text-left flex items-center gap-2"
															onClick={() => onCopyPresetName(p.name)}
														>
															<Copy className="mr-2 h-4 w-4" />
															Copy preset name
														</button>
													</DropdownMenuItem>
													<EditPresetItem p={p} providers={providers} />
													<DeletePresetItem p={p} />
												</DropdownMenuContent>
											</DropdownMenu>
										</div>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
