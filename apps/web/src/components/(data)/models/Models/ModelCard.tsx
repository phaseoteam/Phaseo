"use client";

import Link from "next/link";
import { memo, useState, type CSSProperties, type MouseEvent } from "react";
import {
	ArrowUpRight,
	ArrowUpDown,
	Check,
	Copy,
	Type,
	ImageIcon,
	AudioLines,
	Video,
	Binary,
	Shield,
	FileText,
	CircleDot,
	type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ModelCard as ModelCardType } from "@/lib/fetchers/models/getAllModels";
import { Logo } from "@/components/Logo";
import { useRouter } from "next/navigation";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";

const PRIMARY_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
	year: "numeric",
	month: "short",
	day: "numeric",
});
const MODALITY_DISPLAY_ORDER = [
	"text",
	"image",
	"audio",
	"video",
	"rerank",
	"embedding",
	"moderation",
] as const;
const PROVIDER_STATUS_ORDER = [
	"active",
	"deranked_lvl1",
	"deranked_lvl2",
	"deranked_lvl3",
	"inactive",
	"disabled",
	"not_listed",
] as const;

const PROVIDER_STATUS_META: Record<
	string,
	{ label: string; badgeClassName: string; dotClassName: string }
> = {
	active: {
		label: "Active",
		badgeClassName: "bg-emerald-500/10 text-emerald-600",
		dotClassName: "bg-emerald-500",
	},
	deranked_lvl1: {
		label: "Deranked L1",
		badgeClassName: "bg-amber-500/10 text-amber-600",
		dotClassName: "bg-amber-500",
	},
	deranked_lvl2: {
		label: "Deranked L2",
		badgeClassName: "bg-amber-600/10 text-amber-700",
		dotClassName: "bg-amber-600",
	},
	deranked_lvl3: {
		label: "Deranked L3",
		badgeClassName: "bg-red-500/10 text-red-600",
		dotClassName: "bg-red-500",
	},
	disabled: {
		label: "Disabled",
		badgeClassName: "bg-red-600/10 text-red-700",
		dotClassName: "bg-red-600",
	},
	inactive: {
		label: "Inactive",
		badgeClassName: "bg-muted text-muted-foreground",
		dotClassName: "bg-muted-foreground/60",
	},
	not_listed: {
		label: "Not Listed",
		badgeClassName: "bg-muted text-muted-foreground",
		dotClassName: "bg-muted-foreground/60",
	},
};
const providerStatusOrderIndex = new Map<string, number>(
	PROVIDER_STATUS_ORDER.map((status, index) => [status, index]),
);

function toTitleLabel(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[._/-]+/g, " ")
		.trim()
		.split(/\s+/)
		.map((part) =>
			part.length > 0
				? `${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`
				: part,
		)
		.join(" ");
}

function normalizeModalityOrderKey(value: string): string {
	const normalized = value.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("embed")) return "embedding";
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return "rerank";
	}
	if (normalized.includes("moderat")) return "moderation";
	if (normalized.includes("image")) return "image";
	if (normalized.includes("video")) return "video";
	if (normalized.includes("audio")) return "audio";
	if (normalized.includes("text")) return "text";
	return normalized.trim();
}

function sortModalitiesForDisplay(values: string[]): string[] {
	const orderIndex = new Map<string, number>(
		MODALITY_DISPLAY_ORDER.map((value, index) => [value, index]),
	);
	return [...values].sort((a, b) => {
		const keyA = normalizeModalityOrderKey(a);
		const keyB = normalizeModalityOrderKey(b);
		const indexA = orderIndex.get(keyA);
		const indexB = orderIndex.get(keyB);
		if (indexA !== undefined || indexB !== undefined) {
			if (indexA === undefined) return 1;
			if (indexB === undefined) return -1;
			return indexA - indexB;
		}
		return a.localeCompare(b);
	});
}

function normalizeProviderStatus(value: unknown): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (!normalized) return "inactive";
	if (normalized === "not_active") return "inactive";
	if (normalized === "deranked" || normalized === "de_ranked") {
		return "deranked_lvl1";
	}
	if (normalized === "deranked_lvl_1") return "deranked_lvl1";
	if (normalized === "deranked_lvl_2") return "deranked_lvl2";
	if (normalized === "deranked_lvl_3") return "deranked_lvl3";
	return normalized;
}

function providerStatusPriority(status: string): number {
	return providerStatusOrderIndex.get(status) ?? providerStatusOrderIndex.size + 1;
}

function formatProviderStatusLabel(status: string): string {
	const normalized = normalizeProviderStatus(status);
	const mapped = PROVIDER_STATUS_META[normalized];
	if (mapped) return mapped.label;
	return normalized
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTokenCount(value: number): string {
	if (!Number.isFinite(value) || value < 0) return "-";
	if (value >= 1_000_000_000_000_000_000) {
		const scaled = value / 1_000_000_000_000_000_000;
		const text = scaled.toFixed(2).replace(/\.?0+$/, "");
		return `${text}Qi`;
	}
	if (value >= 1_000_000_000_000_000) {
		const scaled = value / 1_000_000_000_000_000;
		const text = scaled.toFixed(2).replace(/\.?0+$/, "");
		return `${text}Q`;
	}
	if (value >= 1_000_000_000_000) {
		const scaled = value / 1_000_000_000_000;
		const text = scaled.toFixed(2).replace(/\.?0+$/, "");
		return `${text}T`;
	}
	if (value >= 1_000_000_000) {
		const scaled = value / 1_000_000_000;
		const text = scaled.toFixed(2).replace(/\.?0+$/, "");
		return `${text}B`;
	}
	if (value >= 1_000_000) {
		const scaled = value / 1_000_000;
		const text = scaled.toFixed(2).replace(/\.?0+$/, "");
		return `${text}M`;
	}
	if (value >= 1_000) {
		return `${Math.round(value / 1_000)}K`;
	}
	return value.toLocaleString();
}

function formatPrice(value: number | null | undefined): string | null {
	if (
		!Number.isFinite(value) ||
		value === null ||
		value === undefined ||
		value <= 0
	) {
		return null;
	}
	if (value < 0.001) return `$${value.toFixed(4)}`;
	if (value < 0.01) return `$${value.toFixed(3)}`;
	if (value < 1) return `$${value.toFixed(2)}`;
	return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function normalizeFromPriceUnit(value: string | null | undefined): string | null {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!normalized) return null;
	if (normalized === "token" || normalized === "tokens") return "1M tokens";
	if (normalized === "sec" || normalized === "secs" || normalized === "seconds") {
		return "second";
	}
	if (normalized === "min" || normalized === "mins" || normalized === "minutes") {
		return "minute";
	}
	if (normalized === "hr" || normalized === "hrs" || normalized === "hours") {
		return "hour";
	}
	if (normalized === "images") return "image";
	if (normalized === "videos") return "video";
	if (normalized === "characters") return "character";
	return normalized;
}

function formatFromPrice(
	value: number | null | undefined,
	unit: string | null | undefined,
): string | null {
	const amount = formatPrice(value);
	if (!amount) return null;
	const normalizedUnit = normalizeFromPriceUnit(unit);
	return normalizedUnit ? `${amount} per ${normalizedUnit}` : amount;
}

function getModalityIcon(value: string): LucideIcon {
	const normalized = value.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("embed")) return Binary;
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return ArrowUpDown;
	}
	if (normalized.includes("moderat")) return Shield;
	if (normalized.includes("file")) return FileText;
	if (normalized.includes("image")) return ImageIcon;
	if (normalized.includes("video")) return Video;
	if (normalized.includes("audio")) return AudioLines;
	if (normalized.includes("text")) return Type;
	return CircleDot;
}

function formatPrimaryDate(model: ModelCardType): string {
	if (!model.primary_date) return "Date unknown";
	const parsed = new Date(model.primary_date);
	if (Number.isNaN(parsed.getTime())) return model.primary_date;
	return PRIMARY_DATE_FORMATTER.format(parsed);
}

function ModelCardImpl({ model }: { model: ModelCardType }) {
	const modelSlug = model.model_id;
	const modelHref = `/models/${modelSlug}`;
	const router = useRouter();
	const apiModelId = model.gateway_api_model_ids?.[0] ?? null;
	const displayModelId = apiModelId ?? "No API Model ID";
	const [copied, setCopied] = useState(false);
	const providerCount = model.gateway_provider_count ?? 0;
	const activeProviders = model.gateway_active_provider_count ?? 0;
	const providerDetails = (model.gateway_provider_details ?? [])
		.map((provider) => ({
			id: String(provider.id ?? "").trim(),
			name: String(provider.name ?? "").trim(),
			status: normalizeProviderStatus(
				provider.status ?? (provider.is_active ? "active" : "inactive"),
			),
			isActive: Boolean(provider.is_active),
		}))
		.filter((provider) => provider.name);
	const providerNames = Array.from(
		new Set(
			(model.gateway_provider_names ?? [])
				.map((value) => String(value ?? "").trim())
				.filter(Boolean),
		),
	).sort((a, b) => a.localeCompare(b));
	const activeProviderNameSet = new Set(
		(model.gateway_active_provider_names ?? [])
			.map((value) => String(value ?? "").trim())
			.filter(Boolean),
	);
	const providerStatusItems =
		providerDetails.length > 0
			? providerDetails.sort((a, b) => {
					const priorityDiff =
						providerStatusPriority(a.status) - providerStatusPriority(b.status);
					if (priorityDiff !== 0) return priorityDiff;
					return a.name.localeCompare(b.name);
				})
			: providerNames
					.map((name) => ({
						id: "",
						name,
						status: activeProviderNameSet.has(name) ? "active" : "inactive",
						isActive: activeProviderNameSet.has(name),
					}))
					.sort((a, b) => {
						const priorityDiff =
							providerStatusPriority(a.status) - providerStatusPriority(b.status);
						if (priorityDiff !== 0) return priorityDiff;
						return a.name.localeCompare(b.name);
					});
	const PROVIDER_ROW_HEIGHT = 28;
	const PROVIDER_ROW_GAP = 4;
	const providerListHeight = Math.min(
		224,
		providerStatusItems.length * PROVIDER_ROW_HEIGHT +
			Math.max(0, providerStatusItems.length - 1) * PROVIDER_ROW_GAP,
	);
	const inputModalities = model.gateway_input_modalities ?? [];
	const outputModalities = model.gateway_output_modalities ?? [];
	const contextLengths = (model.context_lengths ?? []).filter(
		(value) => Number.isFinite(value) && value > 0,
	);
	const maxContextLength =
		contextLengths.length > 0 ? Math.max(...contextLengths) : null;
	const modalitySet = new Set(
		[...inputModalities, ...outputModalities].map((value) =>
			normalizeModalityOrderKey(String(value ?? "")),
		),
	);
	const isTextModel = modalitySet.has("text");
	const inputPrice = formatPrice(model.lowest_input_price);
	const outputPrice = formatPrice(model.lowest_output_price);
	const ioPriceSummary =
		inputPrice && outputPrice
			? `${inputPrice} in / ${outputPrice} out`
			: inputPrice
				? `${inputPrice} in`
				: outputPrice
					? `${outputPrice} out`
					: null;
	const explicitFromPrice = formatFromPrice(
		model.lowest_from_price,
		model.lowest_from_price_unit,
	);
	const tokenPriceCandidates = [model.lowest_input_price, model.lowest_output_price]
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value) && value > 0);
	const fallbackFromPrice =
		tokenPriceCandidates.length > 0
			? formatFromPrice(Math.min(...tokenPriceCandidates), "1M tokens")
			: null;
	const fromPriceSummary = explicitFromPrice ?? fallbackFromPrice;
	const priceSummary = isTextModel && ioPriceSummary ? ioPriceSummary : fromPriceSummary;
	const priceLabel = isTextModel && ioPriceSummary ? "Lowest Price" : "From:";
	const formatModalities = (values: string[]) => {
		const unique = sortModalitiesForDisplay(Array.from(
			new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
		));
		const visible = unique.slice(0, 4);
		const hiddenCount = unique.length - visible.length;
		return {
			visible,
			hiddenCount,
		};
	};
	const inputModalityDisplay = formatModalities(inputModalities);
	const outputModalityDisplay = formatModalities(outputModalities);
	const weeklyTokens = Number.isFinite(Number(model.popularity_tokens_week))
		? Math.max(0, Number(model.popularity_tokens_week))
		: 0;

	const copyModelId = async () => {
		if (!apiModelId) return;
		try {
			await navigator.clipboard.writeText(apiModelId);
			setCopied(true);
			setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	};
	const rowStyle: CSSProperties & Record<string, string | undefined> = {
		"--provider-accent": model.organisation_colour ?? undefined,
	};
	const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			target.closest("a,button,[role='button'],[data-no-row-nav='true']")
		) {
			return;
		}
		router.push(modelHref);
	};

	return (
		<div
			className={cn(
				"group h-full cursor-pointer py-4 transition-colors hover:bg-muted/20 md:py-5",
			)}
			style={rowStyle}
			onClick={handleRowClick}
		>
			<div className="flex h-full flex-col gap-4">
				<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
					<Link
						href={`/organisations/${model.organisation_id}`}
						prefetch={false}
						className="shrink-0"
						scroll
					>
						<div className="w-10 h-10 relative flex items-center justify-center rounded-lg border bg-background ml-1 md:ml-0">
							<div className="w-6 h-6 relative">
								<Logo
									id={model.organisation_id}
									alt={model.organisation_name || "Provider Logo"}
									className="object-contain"
									fill
								/>
							</div>
						</div>
					</Link>

					<div className="min-w-0 space-y-0.5 self-center">
						<div className="flex items-center gap-1 min-w-0">
							<Link
								href={modelHref}
								prefetch={false}
								className="font-semibold text-sm leading-[1.1] text-foreground hover:underline underline-offset-4 transition-colors duration-200 line-clamp-1"
							>
								{model.name}
							</Link>
							{apiModelId ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											type="button"
											size="icon"
											variant="ghost"
											onClick={copyModelId}
											className="h-5 w-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
											aria-label={`Copy API model ID for ${model.name}`}
										>
											<span className="relative h-3 w-3">
												<Copy
													className={cn(
														"absolute inset-0 size-3 [stroke-width:1.75] transition-all duration-200 ease-out",
														copied
															? "translate-y-px scale-90 opacity-0"
															: "translate-y-0 scale-100 opacity-100",
													)}
												/>
												<Check
													className={cn(
														"absolute inset-0 size-3 [stroke-width:2.25] transition-all duration-200 ease-out",
														copied
															? "translate-y-0 scale-100 opacity-100"
															: "-translate-y-px scale-90 opacity-0",
													)}
												/>
											</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent side="top">
										{copied ? "Copied" : "Copy Model ID"}
									</TooltipContent>
								</Tooltip>
							) : null}
						</div>
						<div className="text-xs leading-[1.15] text-muted-foreground font-mono truncate">
							{displayModelId}
						</div>
					</div>

					<Button asChild size="icon" variant="ghost" className="h-8 w-8 shrink-0">
						<Link
							href={modelHref}
							prefetch={false}
							aria-label={`Open ${model.name}`}
							className="group/open"
						>
							<ArrowUpRight
								className={cn(
									"h-4 w-4 text-muted-foreground transition-colors",
									model.organisation_colour
										? "group-hover:text-[var(--provider-accent)]"
										: "group-hover:text-primary",
								)}
							/>
						</Link>
					</Button>
				</div>

				<div className="grid gap-2 text-xs md:grid-cols-3">
					<div className="flex flex-wrap items-center gap-1.5 text-[11px] md:col-span-3">
						{providerStatusItems.length > 0 ? (
							<HoverCard openDelay={120} closeDelay={100}>
								<HoverCardTrigger asChild>
									<button
										type="button"
										data-no-row-nav="true"
										className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-left transition-colors hover:bg-muted/45"
									>
										<span className="text-muted-foreground">Providers</span>
										<span className="font-medium text-foreground tabular-nums">
											{activeProviders.toLocaleString()}/{providerCount.toLocaleString()}
										</span>
									</button>
								</HoverCardTrigger>
								<HoverCardContent align="start" className="w-72 p-3">
									<div className="space-y-2">
										<div className="text-xs font-medium text-foreground">
											Provider Support
										</div>
										<ScrollArea className="pr-1" style={{ height: providerListHeight }}>
											<div className="space-y-1 pr-2">
												{providerStatusItems.map((provider) => (
													<div
														key={`${provider.id || "provider"}-${provider.name}`}
														className="flex items-center justify-between gap-3 rounded-sm px-1 py-1 text-xs"
													>
														{provider.id ? (
															<Link
																href={`/api-providers/${provider.id}`}
																prefetch={false}
																className="flex min-w-0 items-center gap-2 text-foreground hover:underline underline-offset-2"
															>
																<span className="relative h-4 w-4 shrink-0 rounded-[4px] border bg-background">
																	<Logo
																		id={provider.id}
																		alt={provider.name}
																		className="object-contain p-[1px]"
																		fill
																	/>
																</span>
																<span className="truncate">
																	{provider.name}
																</span>
															</Link>
														) : (
															<span className="flex min-w-0 items-center gap-2">
																<span className="truncate text-foreground">
																	{provider.name}
																</span>
															</span>
														)}
														<span
															className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px]", PROVIDER_STATUS_META[provider.status]?.badgeClassName ?? "bg-muted text-muted-foreground")}
														>
															<span
																className={cn("h-1.5 w-1.5 rounded-full", PROVIDER_STATUS_META[provider.status]?.dotClassName ?? "bg-muted-foreground/60")}
															/>
															{formatProviderStatusLabel(provider.status)}
														</span>
													</div>
												))}
											</div>
										</ScrollArea>
									</div>
								</HoverCardContent>
							</HoverCard>
						) : (
							<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
								<span className="text-muted-foreground">Providers</span>
								<span className="font-medium text-foreground tabular-nums">
									{activeProviders.toLocaleString()}/{providerCount.toLocaleString()}
								</span>
							</div>
						)}
						{maxContextLength ? (
							<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
								<span className="text-muted-foreground">Context</span>
								<span className="font-medium text-foreground tabular-nums">
									{`${formatTokenCount(maxContextLength)} tokens`}
								</span>
							</div>
						) : null}
						{priceSummary ? (
							<div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-2 py-1">
								<span className="text-muted-foreground">{priceLabel}</span>
								<span className="font-medium text-foreground">{priceSummary}</span>
							</div>
						) : null}
					</div>

					<div className="space-y-1 md:col-span-3">
						<div className="flex items-center gap-2 min-w-0">
							<span className="w-11 shrink-0 text-[11px] text-muted-foreground">
								Input
							</span>
							<div className="min-w-0 flex flex-wrap gap-1">
								{inputModalityDisplay.visible.length > 0 ? (
									<>
										{inputModalityDisplay.visible.map((modality) => {
											const Icon = getModalityIcon(modality);
											return (
												<span
													key={`input-${modality}`}
													className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[11px] text-foreground"
												>
													<Icon className="h-3 w-3 text-muted-foreground" />
													{toTitleLabel(modality)}
												</span>
											);
										})}
										{inputModalityDisplay.hiddenCount > 0 ? (
											<span className="inline-flex items-center rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
												+{inputModalityDisplay.hiddenCount} others
											</span>
										) : null}
									</>
								) : (
									<span className="text-[11px] text-muted-foreground">-</span>
								)}
							</div>
						</div>
						<div className="flex items-center gap-2 min-w-0">
							<span className="w-11 shrink-0 text-[11px] text-muted-foreground">
								Output
							</span>
							<div className="min-w-0 flex flex-wrap gap-1">
								{outputModalityDisplay.visible.length > 0 ? (
									<>
										{outputModalityDisplay.visible.map((modality) => {
											const Icon = getModalityIcon(modality);
											return (
												<span
													key={`output-${modality}`}
													className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[11px] text-foreground"
												>
													<Icon className="h-3 w-3 text-muted-foreground" />
													{toTitleLabel(modality)}
												</span>
											);
										})}
										{outputModalityDisplay.hiddenCount > 0 ? (
											<span className="inline-flex items-center rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
												+{outputModalityDisplay.hiddenCount} others
											</span>
										) : null}
									</>
								) : (
									<span className="text-[11px] text-muted-foreground">-</span>
								)}
							</div>
						</div>
					</div>
				</div>

				<div className="mt-auto flex items-center justify-between gap-3 text-xs text-muted-foreground">
					<span className="truncate">{formatPrimaryDate(model)}</span>
					<div className="shrink-0">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="hidden h-8 px-2 tabular-nums text-muted-foreground md:inline-flex"
									aria-label="Weekly tokens"
								>
									{formatTokenCount(weeklyTokens)}
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">Weekly tokens</TooltipContent>
						</Tooltip>

						<Popover>
							<PopoverTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="h-8 px-2 tabular-nums text-muted-foreground md:hidden"
									aria-label="Weekly tokens"
								>
									{formatTokenCount(weeklyTokens)}
								</Button>
							</PopoverTrigger>
							<PopoverContent
								side="top"
								align="end"
								className="w-auto px-2.5 py-1.5 text-xs"
							>
								Weekly tokens
							</PopoverContent>
						</Popover>
					</div>
				</div>
			</div>
		</div>
	);
}

export const ModelCard = memo(ModelCardImpl);
ModelCard.displayName = "ModelCard";
