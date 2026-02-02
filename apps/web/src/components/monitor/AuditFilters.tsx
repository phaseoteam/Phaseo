"use client";

import { useQueryState } from "nuqs";
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
}

export function AuditFilters({
	totalModels,
	filteredCount,
}: AuditFiltersProps) {
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

	const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

	// Quick filters
	const quickFilters: QuickFilter[] = [
		{
			id: "active-gateway",
			label: "Active on Gateway",
			icon: CheckCircle2,
			description: "Models active on at least one gateway provider",
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
			label: "Inactive on Gateway",
			icon: XCircle,
			description: "Models not active on any gateway provider",
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
			label: "No Benchmarks",
			icon: BarChart3,
			description: "Models with zero benchmark results",
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
			label: "Has Benchmarks",
			icon: BarChart3,
			description: "Models with at least one benchmark result",
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
			label: "Recently Released",
			icon: Calendar,
			description: "Models released in the last 6 months",
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
			label: "Multi-Provider",
			icon: Zap,
			description: "Models available on 3+ providers",
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
			label: "Active, No Pricing",
			icon: DollarSign,
			description: "Models active on gateway but with no pricing rules",
			apply: () => {
				if (
					filterGatewayStatus === "active" &&
					filterHasPricing === "false"
				) {
					// Clear both filters
					setFilterGatewayStatus("");
					setFilterHasPricing("");
				} else {
					// Apply both filters
					setFilterGatewayStatus("active");
					setFilterHasPricing("false");
				}
			},
			isActive: () =>
				filterGatewayStatus === "active" &&
				filterHasPricing === "false",
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
	};

	const hasActiveFilters =
		searchQuery ||
		filterGatewayStatus ||
		filterHasBenchmarks ||
		filterReleaseDateOp ||
		filterProvidersOp ||
		filterBenchmarksOp ||
		filterHidden ||
		filterHasPricing;

	const activeFilterCount = [
		searchQuery,
		filterGatewayStatus,
		filterHasBenchmarks,
		filterReleaseDateOp,
		filterProvidersOp,
		filterBenchmarksOp,
		filterHidden,
		filterHasPricing,
	].filter(Boolean).length;

	return (
		<div className="space-y-4">
			{/* Search and stats bar */}
			<div className="flex items-center gap-4 flex-wrap">
				<div className="flex-1 min-w-[300px]">
					<Input
						placeholder="Search models, organizations, providers..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full"
					/>
				</div>

				<div className="flex items-center gap-2">
					<Badge variant="outline" className="text-sm">
						{filteredCount} / {totalModels} models
					</Badge>

					{hasActiveFilters && (
						<Button
							variant="ghost"
							size="sm"
							onClick={clearAllFilters}
							className="h-8"
						>
							<X className="h-4 w-4 mr-1" />
							Clear all ({activeFilterCount})
						</Button>
					)}
				</div>
			</div>

			{/* Quick filters */}
			<div className="flex items-center gap-2 flex-wrap">
				<span className="text-sm text-muted-foreground font-medium">
					Quick Filters:
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
							Advanced Filters
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
									Advanced Filters
								</h4>
							</div>

							{/* Gateway Status */}
							<div className="space-y-2">
								<Label htmlFor="gateway-status">
									Gateway Status
								</Label>
								<Select
									value={filterGatewayStatus || "any"}
									onValueChange={(value) =>
										setFilterGatewayStatus(
											value === "any" ? "" : value
										)
									}
								>
									<SelectTrigger id="gateway-status">
										<SelectValue placeholder="Any" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">Any</SelectItem>
										<SelectItem value="active">
											Active
										</SelectItem>
										<SelectItem value="inactive">
											Inactive
										</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Has Benchmarks */}
							<div className="space-y-2">
								<Label htmlFor="has-benchmarks">
									Benchmarks
								</Label>
								<Select
									value={filterHasBenchmarks || "any"}
									onValueChange={(value) =>
										setFilterHasBenchmarks(
											value === "any" ? "" : value
										)
									}
								>
									<SelectTrigger id="has-benchmarks">
										<SelectValue placeholder="Any" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">Any</SelectItem>
										<SelectItem value="true">
											Has Benchmarks
										</SelectItem>
										<SelectItem value="false">
											No Benchmarks
										</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Hidden Models */}
							<div className="space-y-2">
								<Label htmlFor="hidden">Visibility</Label>
								<Select
									value={filterHidden || "any"}
									onValueChange={(value) =>
										setFilterHidden(value === "any" ? "" : value)
									}
								>
									<SelectTrigger id="hidden">
										<SelectValue placeholder="Any" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="any">Any</SelectItem>
										<SelectItem value="false">
											Visible Only
										</SelectItem>
										<SelectItem value="true">
											Hidden Only
										</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Release Date Filter */}
							<div className="space-y-2">
								<Label>Release Date</Label>
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
											<SelectValue placeholder="Op" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none">-</SelectItem>
											<SelectItem value="gt">
												After
											</SelectItem>
											<SelectItem value="lt">
												Before
											</SelectItem>
											<SelectItem value="eq">
												On
											</SelectItem>
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
								<Label>Provider Count</Label>
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
											<SelectValue placeholder="Op" />
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
										placeholder="Count"
									/>
								</div>
							</div>

							{/* Benchmark Count Filter */}
							<div className="space-y-2">
								<Label>Benchmark Count</Label>
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
											<SelectValue placeholder="Op" />
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
										placeholder="Count"
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
									Clear All
								</Button>
								<Button
									size="sm"
									onClick={() =>
										setShowAdvancedFilters(false)
									}
								>
									Apply Filters
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
						Active:
					</span>
					{searchQuery && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => setSearchQuery("")}
						>
							Search: {searchQuery}
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterGatewayStatus && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => setFilterGatewayStatus("")}
						>
							Gateway:{" "}
							{filterGatewayStatus === "active"
								? "Active"
								: "Inactive"}
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterHasBenchmarks && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => setFilterHasBenchmarks("")}
						>
							Benchmarks:{" "}
							{filterHasBenchmarks === "true" ? "Yes" : "No"}
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
							Release:{" "}
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
							Providers: {filterProvidersOp}{" "}
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
							Benchmarks: {filterBenchmarksOp}{" "}
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
							{filterHidden === "true" ? "Hidden" : "Visible"}{" "}
							Only
							<X className="h-3 w-3" />
						</Badge>
					)}
					{filterHasPricing && (
						<Badge
							variant="secondary"
							className="gap-1 cursor-pointer"
							onClick={() => setFilterHasPricing("")}
						>
							Pricing:{" "}
							{filterHasPricing === "true" ? "Yes" : "No"}
							<X className="h-3 w-3" />
						</Badge>
					)}
				</div>
			)}
		</div>
	);
}
