"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { debounce, useQueryState } from "nuqs";
import { Input } from "@/components/ui/input";
import {
	Search,
	Grid as GridIcon,
	Table2 as TableIcon,
	Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { featureLabels } from "@/lib/config/featureLabels";
import { getTierFilterMeta } from "@/lib/models/tierFilterStyles";
import { parseCatalogueTierFilters } from "@/lib/models/catalogueTierFilters";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface ModelsTableHeaderProps {
	allEndpoints: string[];
	allModalities: string[];
	allFeatures: string[];
	allTiers: string[];
	allStatuses: string[];
}

function formatModalityLabel(
	value: string,
	labels: Record<string, string>,
): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	const localeKey = normalized.replace(/[./-]+/g, "_");
	if (labels[normalized] ?? labels[localeKey]) {
		return labels[normalized] ?? labels[localeKey];
	}
	return value
		.replace(/[_-]+/g, " ")
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ModelsTableHeader({
	allEndpoints,
	allModalities,
	allFeatures,
	allTiers,
	allStatuses,
}: ModelsTableHeaderProps) {
	const t = useTranslations("Catalogue.models");
	const tDetail = useTranslations("Catalogue.modelDetail");
	const pathname = usePathname();
	const isTable = pathname?.includes("/models/table");
	const modalityLabels: Record<string, string> = {
		realtime: t("filtersUi.modalityRealtime"),
		audio_realtime: t("filtersUi.modalityRealtime"),
		audio_stt: t("filtersUi.modalityTranscription"),
		audio_tts: t("filtersUi.modalitySpeech"),
		audio_music: t("filtersUi.modalityMusic"),
		text: tDetail("sections.text"),
		image: tDetail("sections.image"),
		audio: tDetail("sections.audio"),
		video: tDetail("sections.video"),
		embedding: tDetail("sections.embedding"),
		embeddings: tDetail("sections.embeddings"),
		file: t("filtersUi.modalityFile"),
		rerank: t("filtersUi.modalityRerank"),
	};
	const featureTranslationKeys: Record<string, string> = {
		reasoning: t("filtersUi.featureReasoning"),
		tools: t("filtersUi.featureTools"),
		structured_outputs: t("filtersUi.featureStructuredOutputs"),
		web_search: t("filtersUi.featureWebSearch"),
		free: t("filtersUi.featureFree"),
	};
	const tierTranslationKeys: Record<string, string> = {
		standard: t("filtersUi.tierStandard"),
		batch: t("filtersUi.tierBatch"),
		free: t("filtersUi.tierFree"),
		flex: t("filtersUi.tierFlex"),
		priority: t("filtersUi.tierPriority"),
		fast: t("filtersUi.tierPriority"),
	};
	const formatStatus = (value: string) => {
		const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
		const statusLabels: Record<string, string> = {
			active: t("filtersUi.activeGateway"),
			coming_soon: t("filtersUi.comingSoon"),
			inactive: t("filtersUi.notActive"),
			not_active: t("filtersUi.notActive"),
			deranked_lvl1: t("filtersUi.statusDeranked1"),
			deranked_lvl2: t("filtersUi.statusDeranked2"),
			deranked_lvl3: t("filtersUi.statusDeranked3"),
			disabled: t("filtersUi.statusDisabled"),
		};
		return statusLabels[normalized] ?? value;
	};

	const [search, setSearch] = useQueryState("search", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [selectedInputModalities, setSelectedInputModalities] = useQueryState(
		"inputModalities",
		{
			defaultValue: [],
			parse: (value) => (value ? value.split(",") : []),
			serialize: (value) => value.join(","),
		},
	);

	const [selectedOutputModalities, setSelectedOutputModalities] = useQueryState(
		"outputModalities",
		{
			defaultValue: [],
			parse: (value) => (value ? value.split(",") : []),
			serialize: (value) => value.join(","),
		},
	);

	const [selectedFeatures, setSelectedFeatures] = useQueryState("features", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedEndpoints, setSelectedEndpoints] = useQueryState("endpoints", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedStatuses, setSelectedStatuses] = useQueryState("statuses", {
		defaultValue: [],
		parse: (value) => (value ? value.split(",") : []),
		serialize: (value) => value.join(","),
	});

	const [selectedTiers, setSelectedTiers] = useQueryState("tiers", {
		defaultValue: ["standard"],
		parse: (value) => (value ? parseCatalogueTierFilters(value) : ["standard"]),
		serialize: (value) => value.join(","),
	});
	const isDefaultTiers =
		selectedTiers.length === 1 && selectedTiers[0] === "standard";

	return (
		<>
			<div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
				<div className="flex items-center w-full md:w-auto">
					<h1 className="font-bold text-xl mb-2 md:mb-0">{t("title")}</h1>

					{/* Mobile: tabs next to the title */}
					<div className="ml-2 md:hidden">
						<div className="inline-flex rounded-md overflow-hidden border bg-background">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={!isTable ? "default" : "outline"}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models"
											prefetch={false}
											aria-label={t("cardView")}
										>
											<GridIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">{t("cardView")}</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={isTable ? "default" : "outline"}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models/table"
											prefetch={false}
											aria-label={t("tableView")}
										>
											<TableIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">{t("tableView")}</TooltipContent>
							</Tooltip>
						</div>
					</div>
				</div>

				<div className="relative w-full md:w-1/5">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
					<Input
						placeholder={t("searchPlaceholder")}
						value={search}
						onChange={(e) =>
							setSearch(e.target.value || "", {
								limitUrlUpdates: debounce(250),
							})
						}
						className="pl-9 pr-2 py-1.5 text-sm rounded-full bg-background border focus:outline-hidden focus:ring-2 focus:ring-primary w-full"
						style={{ minWidth: 0 }}
					/>
				</div>
			</div>

			{/* Filters row (desktop: left) and view tabs (desktop: right) */}
			<div className="mb-4 -mx-1 overflow-x-auto">
				<div className="flex items-center justify-between px-1 pb-1 gap-2">
					<div className="flex gap-2 flex-wrap">
						{/* Endpoint Filter */}
						<Popover>
							<PopoverTrigger asChild>
								<Button variant="outline" size="sm" className="h-8">
									<Filter className="h-4 w-4 mr-2" />
									{t("filtersUi.endpoints")}
									{(selectedEndpoints.length > 0 ||
										selectedStatuses.length > 0) && (
										<Badge
											variant="secondary"
											className="ml-2 h-5 px-1.5 text-xs"
										>
											{selectedEndpoints.length + selectedStatuses.length}
										</Badge>
									)}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-56">
								<div className="space-y-4">
									<div className="space-y-2">
										<h4 className="font-medium">{t("filtersUi.endpoints")}</h4>
										{allEndpoints.map((endpoint) => (
											<div
												key={endpoint}
												className="flex items-center space-x-2"
											>
												<Checkbox
													id={`endpoint-${endpoint}`}
													checked={selectedEndpoints.includes(endpoint)}
													onCheckedChange={(checked) => {
														if (checked) {
															setSelectedEndpoints([
																...selectedEndpoints,
																endpoint,
															]);
														} else {
															setSelectedEndpoints(
																selectedEndpoints.filter((e) => e !== endpoint),
															);
														}
													}}
												/>
												<label
													htmlFor={`endpoint-${endpoint}`}
													className="text-sm"
												>
													{endpoint}
												</label>
											</div>
										))}
									</div>
									<div className="space-y-2">
										<h4 className="font-medium">{t("filtersUi.status")}</h4>
										{allStatuses.map((status) => (
											<div key={status} className="flex items-center space-x-2">
												<Checkbox
													id={`status-${status}`}
													checked={selectedStatuses.includes(status)}
													onCheckedChange={(checked) => {
														if (checked) {
															setSelectedStatuses([
																...selectedStatuses,
																status,
															]);
														} else {
															setSelectedStatuses(
																selectedStatuses.filter((s) => s !== status),
															);
														}
													}}
												/>
												<label
													htmlFor={`status-${status}`}
													className="text-sm capitalize"
												>
													{formatStatus(status)}
												</label>
											</div>
										))}
									</div>
								</div>
							</PopoverContent>
						</Popover>

						{/* Modalities Filter */}
						<Popover>
							<PopoverTrigger asChild>
								<Button variant="outline" size="sm" className="h-8">
									<Filter className="h-4 w-4 mr-2" />
									{t("filtersUi.modalities")}
									{(selectedInputModalities.length > 0 ||
										selectedOutputModalities.length > 0) && (
										<Badge
											variant="secondary"
											className="ml-2 h-5 px-1.5 text-xs"
										>
											{selectedInputModalities.length +
												selectedOutputModalities.length}
										</Badge>
									)}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-56">
								<div className="space-y-4">
									<div className="space-y-2">
										<h4 className="font-medium">{t("filtersUi.inputModalities")}</h4>
										{allModalities.map((modality) => (
											<div
												key={`input-${modality}`}
												className="flex items-center space-x-2"
											>
												<Checkbox
													id={`input-modality-${modality}`}
													checked={selectedInputModalities.includes(modality)}
													onCheckedChange={(checked) => {
														if (checked) {
															setSelectedInputModalities([
																...selectedInputModalities,
																modality,
															]);
														} else {
															setSelectedInputModalities(
																selectedInputModalities.filter(
																	(m) => m !== modality,
																),
															);
														}
													}}
												/>
												<label
													htmlFor={`input-modality-${modality}`}
													className="text-sm"
												>
													{formatModalityLabel(modality, modalityLabels)}
												</label>
											</div>
										))}
									</div>
									<div className="space-y-2">
										<h4 className="font-medium">{t("filtersUi.outputModalities")}</h4>
										{allModalities.map((modality) => (
											<div
												key={`output-${modality}`}
												className="flex items-center space-x-2"
											>
												<Checkbox
													id={`output-modality-${modality}`}
													checked={selectedOutputModalities.includes(modality)}
													onCheckedChange={(checked) => {
														if (checked) {
															setSelectedOutputModalities([
																...selectedOutputModalities,
																modality,
															]);
														} else {
															setSelectedOutputModalities(
																selectedOutputModalities.filter(
																	(m) => m !== modality,
																),
															);
														}
													}}
												/>
												<label
													htmlFor={`output-modality-${modality}`}
													className="text-sm"
												>
													{formatModalityLabel(modality, modalityLabels)}
												</label>
											</div>
										))}
									</div>
								</div>
							</PopoverContent>
						</Popover>

						{/* Features Filter */}
						<Popover>
							<PopoverTrigger asChild>
								<Button variant="outline" size="sm" className="h-8">
									<Filter className="h-4 w-4 mr-2" />
									{t("filtersUi.features")}
									{selectedFeatures.length > 0 && (
										<Badge
											variant="secondary"
											className="ml-2 h-5 px-1.5 text-xs"
										>
											{selectedFeatures.length}
										</Badge>
									)}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-56">
								<div className="space-y-2">
										<h4 className="font-medium">{t("filtersUi.features")}</h4>
									{allFeatures.map((feature) => (
										<div key={feature} className="flex items-center space-x-2">
											<Checkbox
												id={`feature-${feature}`}
												checked={selectedFeatures.includes(feature)}
												onCheckedChange={(checked) => {
													if (checked) {
														setSelectedFeatures([...selectedFeatures, feature]);
													} else {
														setSelectedFeatures(
															selectedFeatures.filter((f) => f !== feature),
														);
													}
												}}
											/>
											<label htmlFor={`feature-${feature}`} className="text-sm">
												{featureTranslationKeys[feature] ?? featureLabels[feature] ?? feature}
											</label>
										</div>
									))}
								</div>
							</PopoverContent>
						</Popover>

						{/* Tier Filter */}
						<Popover>
							<PopoverTrigger asChild>
								<Button variant="outline" size="sm" className="h-8">
									<Filter className="h-4 w-4 mr-2" />
									{t("filtersUi.tier")}
									{!isDefaultTiers && (
										<Badge
											variant="secondary"
											className="ml-2 h-5 px-1.5 text-xs"
										>
											{selectedTiers.length}
										</Badge>
									)}
								</Button>
							</PopoverTrigger>
							<PopoverContent className="w-56">
								<div className="space-y-2">
										<h4 className="font-medium">{t("filtersUi.pricingTiers")}</h4>
									{allTiers.map((tier) => {
										const tierMeta = getTierFilterMeta(tier);
										const TierIcon = tierMeta.icon;
										const checked = selectedTiers.includes(tier);
										return (
											<div key={tier} className="flex items-center space-x-2">
												<Checkbox
													id={`tier-${tier}`}
													checked={checked}
													onCheckedChange={(checked) => {
														if (checked) {
															setSelectedTiers([...selectedTiers, tier]);
														} else {
															setSelectedTiers(
																selectedTiers.filter((t) => t !== tier),
															);
														}
													}}
												/>
												<label
													htmlFor={`tier-${tier}`}
													className="group flex cursor-pointer items-center gap-1.5 text-sm capitalize"
												>
													<TierIcon
														className={cn(
															"h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors",
															tierMeta.filterIconHoverClassName,
															checked && tierMeta.iconClassName,
														)}
													/>
													{tierTranslationKeys[tier.toLowerCase()] ?? tier}
												</label>
											</div>
										);
									})}
								</div>
							</PopoverContent>
						</Popover>

						{/* Clear Filters */}
						{(search ||
							selectedInputModalities.length > 0 ||
							selectedOutputModalities.length > 0 ||
							selectedEndpoints.length > 0 ||
							selectedStatuses.length > 0 ||
							selectedFeatures.length > 0 ||
							!isDefaultTiers) && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setSearch("");
									setSelectedEndpoints([]);
									setSelectedStatuses([]);
									setSelectedInputModalities([]);
									setSelectedOutputModalities([]);
									setSelectedFeatures([]);
									setSelectedTiers(["standard"]);
								}}
								className="h-8"
							>
								{t("filtersUi.clearFilters")}
							</Button>
						)}
					</div>

					{/* Desktop tabs aligned to the right */}
					<div className="hidden md:flex items-center">
						<div className="inline-flex rounded-md overflow-hidden border bg-background">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={!isTable ? "default" : "outline"}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models"
											prefetch={false}
											aria-label={t("cardView")}
										>
											<GridIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">{t("cardView")}</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={isTable ? "default" : "outline"}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models/table"
											prefetch={false}
											aria-label={t("tableView")}
										>
											<TableIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">{t("tableView")}</TooltipContent>
							</Tooltip>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
