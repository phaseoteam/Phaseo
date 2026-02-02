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
import { MoreVertical, Copy, AtSign } from "lucide-react";
import EditPresetItem from "./EditPresetItem";
import DeletePresetItem from "./DeletePresetItem";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";

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
			className={`${className} flex items-center justify-center font-bold text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400`}
		>
			{initials}
		</div>
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
			<div className="mt-6 text-sm text-muted-foreground">
				No teams or presets to manage.
			</div>
		);
	}

	return (
		<div className="mt-6 space-y-6">
			{sortedTeams.map((team: any) => (
				<div key={team.id ?? "personal"}>
					<div className="font-medium mb-2">{team.name}</div>
					{!team.presets || team.presets.length === 0 ? (
						<div className="text-sm text-muted-foreground">
							No presets for this team.
						</div>
					) : (
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							{team.presets.map((p: any) => (
								<div
									key={p.id}
									className="relative p-4 border rounded-md bg-white dark:bg-zinc-950 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
								>
								<div className="flex items-start justify-between">
										<div className="flex items-start gap-3 flex-1 min-w-0">
											<div className="flex-shrink-0 mt-0.5">
												<PresetLogo name={p.name} className="w-10 h-10 rounded-lg" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="font-medium flex items-center gap-2 mb-1">
													<span className="truncate">{p.name}</span>
													{p.visibility && (
														<Badge variant="outline" className="text-[10px] uppercase">
															{p.visibility}
														</Badge>
													)}
													{p.source_preset_id && (
														<Badge variant="secondary" className="text-[10px] uppercase">
															Fork
														</Badge>
													)}
												</div>
												{p.description && (
													<p className="text-sm text-muted-foreground line-clamp-2">
														{p.description}
													</p>
												)}
												<div className="mt-2 flex flex-wrap gap-1">
													{p.config?.provider && (
														<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
															<Logo
																id={getProviderLogoId(p.config.provider)}
																className="w-4 h-4 rounded-full"
																alt={p.config.provider}
																width={16}
																height={16}
															/>
															{p.config.provider}
														</span>
													)}
													{p.config?.model && (
														<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
															{p.config.model}
														</span>
													)}
													{p.config?.temperature !== null && p.config?.temperature !== undefined && (
														<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
															temp: {p.config.temperature}
														</span>
													)}
													{p.config?.max_tokens && (
														<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
															max: {p.config.max_tokens}
														</span>
													)}
													{p.config?.system_prompt && (
														<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
															has system prompt
														</span>
													)}
												</div>
											</div>
										</div>
										<div className="ml-2 flex-shrink-0">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														aria-label="Actions"
														className="h-8 w-8"
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
