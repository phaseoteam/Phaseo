"use client";

import { useQueryState } from "nuqs";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
	Filter,
	X,
	CheckCircle2,
	XCircle,
	Calendar,
	Zap,
	BarChart3,
	DollarSign,
} from "lucide-react";
import { useState } from "react";

interface QuickFilter {
	id: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	description: string;
	apply: () => void;
	isActive: () => boolean;
}

interface AuditFiltersProps {
	totalModels: number;
	filteredCount: number;
	providerOptions: Array<{ providerId: string; providerName: string }>;
}

export function AuditFilters({
	totalModels,
	filteredCount,
	providerOptions,
}: AuditFiltersProps) {
	const tUi = useTranslations("Common.ui");
	const [searchQuery, setSearchQuery] = useQueryState("search", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	// Advanced filters
	const [filterGatewayStatus, setFilterGatewayStatus] = useQueryState(
		"gatewayStatus",
		{
			defaultValue: "",
			parse: (value) => value || "",
			serialize: (value) => value,
		}
	);

	const [filterHasBenchmarks, setFilterHasBenchmarks] = useQueryState(
		"hasBenchmarks",
		{
			defaultValue: "",
			parse: (value) => value || "",
			serialize: (value) => value,
		}
	);

	const [filterReleaseDateOp, setFilterReleaseDateOp] = useQueryState(
		"releaseDateOp",
		{
			defaultValue: "",
			parse: (value) => value || "",
			serialize: (value) => value,
		}
	);

	const [filterReleaseDateValue, setFilterReleaseDateValue] = useQueryState(
		"releaseDateValue",
		{
			defaultValue: "",
			parse: (value) => value || "",
			serialize: (value) => value,
		}
	);

	const [filterProvidersOp, setFilterProvidersOp] = useQueryState(
		"providersOp",
		{
			defaultValue: "",
			parse: (value) => value || "",
			serialize: (value) => value,
		}
	);

	const [filterProvidersValue, setFilterProvidersValue] = useQueryState(
		"providersValue",
		{
			defaultValue: "",
			parse: (value) => value || "",
			serialize: (value) => value,
		}
	);

	const [filterBenchmarksOp, setFilterBenchmarksOp] = useQueryState(
		"benchmarksOp",
		{
			defaultValue: "",
			parse: (value) => value || "",
			serialize: (value) => value,
		}
	);

	const [filterBenchmarksValue, setFilterBenchmarksValue] = useQueryState(
		"benchmarksValue",
		{
			defaultValue: "",
			parse: (value) => value || "",
			serialize: (value) => value,
		}
	);

	const [filterHidden, setFilterHidden] = useQueryState("hidden", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [filterHasPricing, setFilterHasPricing] = useQueryState(
		"hasPricing",
		{
			defaultValue: "",
			parse: (value) => value || "",
			serialize: (value) => value,
		}
	);
	const [filterPricingGap, setFilterPricingGap] = useQueryState(
		"pricingGap",
		{
			defaultValue: "",
			parse: (value) => value || "",
			serialize: (value) => value,
		}
	);
	const [filterProvider, setFilterProvider] = useQueryState("provider", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

	// Quick filters
	const quickFilters: QuickFilter[] = [
		{
			id: "active-gateway",
			label: tUi("filters.quickActiveGateway"),
			icon: CheckCircle2,
			description: tUi("filters.quickActiveGatewayDescription"),
			apply: () => {
				if (filterGatewayStatus === "active") {
					setFilterGatewayStatus("");
				} else {
					setFilterGatewayStatus("active");
				}
			},
			isActive: () => filterGatewayStatus === "active",
		},
		{
			id: "inactive-gateway",
			label: tUi("filters.quickInactiveGateway"),
			icon: XCircle,
			description: tUi("filters.quickInactiveGatewayDescription"),
			apply: () => {
				if (filterGatewayStatus === "inactive") {
					setFilterGatewayStatus("");
				} else {
					setFilterGatewayStatus("inactive");
				}
			},
			isActive: () => filterGatewayStatus === "inactive",
		},
		{
			id: "no-benchmarks",
			label: tUi("filters.noBenchmarks"),
			icon: BarChart3,
			description: tUi("filters.quickNoBenchmarksDescription"),
			apply: () => {
				if (filterHasBenchmarks === "false") {
					setFilterHasBenchmarks("");
				} else {
					setFilterHasBenchmarks("false");
				}
			},
			isActive: () => filterHasBenchmarks === "false",
		},
		{
			id: "has-benchmarks",
			label: tUi("filters.hasBenchmarks"),
			icon: BarChart3,
			description: tUi("filters.quickHasBenchmarksDescription"),
			apply: () => {
				if (filterHasBenchmarks === "true") {
					setFilterHasBenchmarks("");
				} else {
					setFilterHasBenchmarks("true");
				}
			},
			isActive: () => filterHasBenchmarks === "true",
		},
		{
			id: "recent",
			label: tUi("filters.quickRecentlyReleased"),
			icon: Calendar,
			description: tUi("filters.quickRecentlyReleasedDescription"),
			apply: () => {
				if (
					filterReleaseDateOp === "gt" &&
					filterReleaseDateValue !== ""
				) {
					setFilterReleaseDateOp("");
					setFilterReleaseDateValue("");
				} else {
					const sixMonthsAgo = new Date();
					sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
					setFilterReleaseDateOp("gt");
					setFilterReleaseDateValue(
						sixMonthsAgo.toISOString().split("T")[0]
					);
				}
			},
			isActive: () =>
				filterReleaseDateOp === "gt" &&
				filterReleaseDateValue !== "",
		},
		{
			id: "multi-provider",
			label: tUi("filters.quickMultiProvider"),
			icon: Zap,
			description: tUi("filters.quickMultiProviderDescription"),
			apply: () => {
				if (
					filterProvidersOp === "gte" &&
					filterProvidersValue === "3"
				) {
					setFilterProvidersOp("");
					setFilterProvidersValue("");
				} else {
					setFilterProvidersOp("gte");
					setFilterProvidersValue("3");
				}
			},
			isActive: () =>
				filterProvidersOp === "gte" && filterProvidersValue === "3",
		},
		{
			id: "active-no-pricing",
			label: tUi("filters.quickActivePricingGaps"),
			icon: DollarSign,
			description:
				tUi("filters.quickActivePricingGapsDescription"),
			apply: () => {
				if (
					filterGatewayStatus === "active" &&
					filterPricingGap === "activeMissing"
				) {
					// Clear both filters
					setFilterGatewayStatus("");
					setFilterPricingGap("");
				} else {
					// Apply both filters
					setFilterGatewayStatus("active");
					setFilterHasPricing("");
					setFilterPricingGap("activeMissing");
				}
			},
			isActive: () =>
				filterGatewayStatus === "active" &&
				filterPricingGap === "activeMissing",
		},
	];

	const clearAllFilters = () => {
		setSearchQuery("");
		setFilterGatewayStatus("");
		setFilterHasBenchmarks("");
		setFilterReleaseDateOp("");
		setFilterReleaseDateValue("");
		setFilterProvidersOp("");
		setFilterProvidersValue("");
		setFilterBenchmarksOp("");
		setFilterBenchmarksValue("");
		setFilterHidden("");
		setFilterHasPricing("");
		setFilterPricingGap("");
		setFilterProvider("");
	};

	const hasActiveFilters =
		searchQuery ||
		filterGatewayStatus ||
		filterHasBenchmarks ||
		filterReleaseDateOp ||
		filterProvidersOp ||
		filterBenchmarksOp ||
		filterHidden ||
		filterHasPricing ||
		filterPricingGap ||
		filterProvider;

	const activeFilterCount = [
		searchQuery,
		filterGatewayStatus,
		filterHasBenchmarks,
		filterReleaseDateOp,
		filterProvidersOp,
		filterBenchmarksOp,
		filterHidden,
		filterHasPricing,
		filterPricingGap,
		filterProvider,
	].filter(Boolean).length;

	return (
		<div className="space-y-4">
			{/* Search and stats bar */}
			<div className="flex items-center gap-4 flex-wrap">
				<div className="flex-1 min-w-[300px]">
					<Input
						placeholder={tUi("filters.modelSearchPlaceholder")}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full"
					/>
				</div>

				<div className="flex items-center gap-2">
					<Badge variant="outline" className="text-sm">
						{tUi("filters.modelsCount", { filtered: filteredCount, total: totalModels })}
					</Badge>

					{hasActiveFilters && (
						<Button
							variant="ghost"
							size="sm"
							onClick={clearAllFilters}
							className="h-8"
						>
							<X className="h-4 w-4 mr-1" />
							{tUi("filters.clearAllCount", { count: activeFilterCount })}
						</Button>
					)}
				</div>
			</div>

			{/* Quick filters */}
			<div className="flex items-center gap-2 flex-wrap">
				<span className="text-sm text-muted-foreground font-medium">
					{tUi("filters.quickFilters")}
				</span>
				{quickFilters.map((filter) => {
					const Icon = filter.icon;
					const isActive = filter.isActive();
					return (
						<Button
							key={filter.id}
							variant={isActive ? "default" : "outline"}
							size="sm"
							onClick={filter.apply}
							className="h-8"
							title={filter.description}
						>
							<Icon className="h-3 w-3 mr-1" />
							{filter.label}
						</Button>
					);
				})}

				<Popover
					open={showAdvancedFilters}
					onOpenChange={setShowAdvancedFilters}
				>
					<PopoverTrigger asChild>
						<Button variant="outline" size="sm" className="h-8">
							<Filter className="h-3 w-3 mr-1" />
											{tUi("filters.advancedFilters")}
							{activeFilterCount > 0 && (
								<Badge
									variant="secondary"
									className="ml-1 px-1 min-w-[20px] h-5"
								>
									{activeFilterCount}
								</Badge>
							)}
						</Button>
					</PopoverTrigger>
					<PopoverContent className="w-96" align="start">
						<div className="space-y-4">
							<div>
								<h4 className="font-semibold mb-3">
									{tUi("filters.advancedFilters")}
								</h4>
							</div>

							{/* Gateway Status */}
							<div className="space-y-2">
								<Label htmlFor="gateway-status">{tUi("filters.gatewayStatus")}</Label>
								<Select
									value={filterGatewayStatus || "any"}
									onValueChange={(value) =>
										setFilterGatewayStatus(
											value === "any" ? "" : value
										)
									}
								>
									<SelectTrigger id="gateway-status">
										<SelectValue placeholder={tUi("filters.any")} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">{tUi("filters.any")}</SelectItem>
										<SelectItem value="active">{tUi("filters.active")}</SelectItem>
										<SelectItem value="inactive">{tUi("filters.inactive")}</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Has Benchmarks */}
							<div className="space-y-2">
								<Label htmlFor="has-benchmarks">{tUi("filters.benchmarks")}</Label>
								<Select
									value={filterHasBenchmarks || "any"}
									onValueChange={(value) =>
										setFilterHasBenchmarks(
											value === "any" ? "" : value
										)
									}
								>
									<SelectTrigger id="has-benchmarks">
										<SelectValue placeholder={tUi("filters.any")} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">{tUi("filters.any")}</SelectItem>
										<SelectItem value="true">{tUi("filters.hasBenchmarks")}</SelectItem>
										<SelectItem value="false">{tUi("filters.noBenchmarks")}</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Hidden Models */}
							<div className="space-y-2">
								<Label htmlFor="hidden">{tUi("filters.visibility")}</Label>
								<Select
									value={filterHidden || "any"}
									onValueChange={(value) =>
										setFilterHidden(value === "any" ? "" : value)
									}
								>
									<SelectTrigger id="hidden">
										<SelectValue placeholder={tUi("filters.any")} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">{tUi("filters.any")}</SelectItem>
										<SelectItem value="false">{tUi("filters.visibleOnly")}</SelectItem>
										<SelectItem value="true">{tUi("filters.hiddenOnly")}</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Provider */}
							<div className="space-y-2">
								<Label htmlFor="provider">{tUi("filters.provider")}</Label>
								<Select
									value={filterProvider || "any"}
									onValueChange={(value) =>
										setFilterProvider(value === "any" ? "" : value)
									}
								>
									<SelectTrigger id="provider">
										<SelectValue placeholder={tUi("select.anyProvider")} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">{tUi("filters.any")}</SelectItem>
										{providerOptions.map((provider) => (
											<SelectItem
												key={provider.providerId}
												value={provider.providerId}
											>
												{provider.providerName}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							{/* Pricing */}
							<div className="space-y-2">
								<Label htmlFor="has-pricing">{tUi("filters.pricing")}</Label>
								<Select
									value={filterHasPricing || "any"}
									onValueChange={(value) =>
										setFilterHasPricing(value === "any" ? "" : value)
									}
								>
									<SelectTrigger id="has-pricing">
										<SelectValue placeholder={tUi("filters.any")} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">{tUi("filters.any")}</SelectItem>
										<SelectItem value="true">{tUi("filters.hasPricing")}</SelectItem>
										<SelectItem value="false">{tUi("filters.noPricing")}</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Release Date Filter */}
							<div className="space-y-2">
								<Label>{tUi("filters.releaseDate")}</Label>
								<div className="flex gap-2">
									<Select
										value={filterReleaseDateOp || "none"}
										onValueChange={(value) =>
											setFilterReleaseDateOp(
												value === "none" ? "" : value
											)
										}
									>
										<SelectTrigger className="w-[100px]">
											<SelectValue placeholder={tUi("filters.operator")} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">-</SelectItem>
											<SelectItem value="gt">{tUi("filters.after")}</SelectItem>
											<SelectItem value="lt">{tUi("filters.before")}</SelectItem>
											<SelectItem value="eq">{tUi("filters.on")}</SelectItem>
										</SelectContent>
									</Select>
									<Input
										type="date"
										value={filterReleaseDateValue}
										onChange={(e) =>
											setFilterReleaseDateValue(
												e.target.value
											)
										}
										disabled={!filterReleaseDateOp}
									/>
								</div>
							</div>

							{/* Provider Count Filter */}
							<div className="space-y-2">
								<Label>{tUi("filters.providerCount")}</Label>
								<div className="flex gap-2">
									<Select
										value={filterProvidersOp || "none"}
										onValueChange={(value) =>
											setFilterProvidersOp(
												value === "none" ? "" : value
											)
										}
									>
										<SelectTrigger className="w-[100px]">
											<SelectValue placeholder={tUi("filters.operator")} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">-</SelectItem>
											<SelectItem value="gt">&gt;</SelectItem>
											<SelectItem value="gte">
												≥
											</SelectItem>
											<SelectItem value="lt">&lt;</SelectItem>
											<SelectItem value="lte">
												≤
											</SelectItem>
											<SelectItem value="eq">=</SelectItem>
										</SelectContent>
									</Select>
									<Input
										type="number"
										min="0"
										value={filterProvidersValue}
										onChange={(e) =>
											setFilterProvidersValue(
												e.target.value
											)
										}
										disabled={!filterProvidersOp}
										placeholder={tUi("filters.count")}
									/>
								</div>
							</div>

							{/* Benchmark Count Filter */}
							<div className="space-y-2">
								<Label>{tUi("filters.benchmarkCount")}</Label>
								<div className="flex gap-2">
									<Select
										value={filterBenchmarksOp || "none"}
										onValueChange={(value) =>
											setFilterBenchmarksOp(
												value === "none" ? "" : value
											)
										}
									>
										<SelectTrigger className="w-[100px]">
											<SelectValue placeholder={tUi("filters.operator")} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">-</SelectItem>
											<SelectItem value="gt">&gt;</SelectItem>
											<SelectItem value="gte">
												≥
											</SelectItem>
											<SelectItem value="lt">&lt;</SelectItem>
											<SelectItem value="lte">
												≤
											</SelectItem>
											<SelectItem value="eq">=</SelectItem>
										</SelectContent>
									</Select>
									<Input
										type="number"
										min="0"
										value={filterBenchmarksValue}
										onChange={(e) =>
											setFilterBenchmarksValue(
												e.target.value
											)
										}
										disabled={!filterBenchmarksOp}
										placeholder={tUi("filters.count")}
									/>
								</div>
							</div>

							{/* Actions */}
							<div className="flex justify-between pt-2 border-t">
								<Button
									variant="ghost"
									size="sm"
									onClick={clearAllFilters}
								>
								{tUi("filters.clearAll")}
								</Button>
								<Button
									size="sm"
									onClick={() =>
										setShowAdvancedFilters(false)
									}
								>
						{tUi("filters.applyFilters")}
								</Button>
							</div>
						</div>
					</PopoverContent>
				</Popover>
			</div>

			{/* Active filter badges */}
			{hasActiveFilters && (
				<div className="flex items-center gap-2 flex-wrap">
					<span className="text-sm text-muted-foreground">
						{tUi("filters.activeTag")}
					</span>
					{searchQuery && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => setSearchQuery("")}
						>
							{tUi("filters.searchTag")}: {searchQuery}
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterGatewayStatus && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => setFilterGatewayStatus("")}
						>
							{tUi("filters.gatewayTag")}: {" "}
							{filterGatewayStatus === "active"
								? tUi("filters.active")
								: tUi("filters.inactive")}
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterHasBenchmarks && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => setFilterHasBenchmarks("")}
						>
							{tUi("filters.benchmarksTag")}: {" "}
							{filterHasBenchmarks === "true"
								? tUi("filters.hasBenchmarks")
								: tUi("filters.noBenchmarks")}
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterReleaseDateOp && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => {
								setFilterReleaseDateOp("");
								setFilterReleaseDateValue("");
							}}
						>
							{tUi("filters.releaseTag")}: {" "}
							{filterReleaseDateOp === "gt"
								? "After"
								: filterReleaseDateOp === "lt"
									? "Before"
									: "On"}{" "}
							{filterReleaseDateValue}
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterProvidersOp && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => {
								setFilterProvidersOp("");
								setFilterProvidersValue("");
							}}
						>
							{tUi("filters.providersTag")}: {" "}
							{filterProvidersOp === "gt" ? ">" : null}
							{filterProvidersOp === "gte" ? "≥" : null}
							{filterProvidersOp === "lt" ? "<" : null}
							{filterProvidersOp === "lte" ? "≤" : null}
							{filterProvidersOp === "eq" ? "=" : null}{" "}
							{filterProvidersValue}
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterBenchmarksOp && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => {
								setFilterBenchmarksOp("");
								setFilterBenchmarksValue("");
							}}
						>
							{tUi("filters.benchmarksTag")}: {" "}
							{filterBenchmarksOp === "gt" ? ">" : null}
							{filterBenchmarksOp === "gte" ? "≥" : null}
							{filterBenchmarksOp === "lt" ? "<" : null}
							{filterBenchmarksOp === "lte" ? "≤" : null}
							{filterBenchmarksOp === "eq" ? "=" : null}{" "}
							{filterBenchmarksValue}
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterHidden && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => setFilterHidden("")}
						>
							{filterHidden === "true"
								? tUi("filters.hiddenOnly")
								: tUi("filters.visibleOnly")}
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterHasPricing && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => setFilterHasPricing("")}
						>
							{tUi("filters.pricing")}{filterProvider ? ` (${tUi("filters.provider")})` : ""}:{" "}
							{filterHasPricing === "true"
								? tUi("filters.hasPricing")
								: tUi("filters.noPricing")}
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterPricingGap && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => setFilterPricingGap("")}
						>
							{tUi("filters.activePricingGapTag")}
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterProvider && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => setFilterProvider("")}
						>
							{tUi("filters.providerTag")}: {" "}
							{providerOptions.find(
								(provider) => provider.providerId === filterProvider
							)?.providerName ?? filterProvider}
							<X className="h-3 w-3" />
						</Badge>
					)}
				</div>
			)}
		</div>
	);
}
