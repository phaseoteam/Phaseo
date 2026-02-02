"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	ChevronLeft,
	ChevronRight,
	Edit,
	ExternalLink,
	MoreHorizontal,
	Check,
	X as XIcon,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Logo } from "@/components/Logo";
import Link from "next/link";
import { useQueryState } from "nuqs";
import type { AuditModelData } from "@/lib/fetchers/models/table-view/getAuditModels";
import { ComprehensiveModelEditor } from "./ComprehensiveModelEditor";

interface AuditDataTableProps {
	data: AuditModelData[];
	loading?: boolean;
}

export function AuditDataTable({
	data,
	loading = false,
}: AuditDataTableProps) {
	// Edit dialog state
	const [editingModel, setEditingModel] = useState<AuditModelData | null>(
		null
	);
	const [editDialogOpen, setEditDialogOpen] = useState(false);

	const [searchQuery] = useQueryState("search", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	// Advanced filters
	const [filterGatewayStatus] = useQueryState("gatewayStatus", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [filterHasBenchmarks] = useQueryState("hasBenchmarks", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [filterReleaseDateOp] = useQueryState("releaseDateOp", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [filterReleaseDateValue] = useQueryState("releaseDateValue", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [filterProvidersOp] = useQueryState("providersOp", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [filterProvidersValue] = useQueryState("providersValue", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [filterBenchmarksOp] = useQueryState("benchmarksOp", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [filterBenchmarksValue] = useQueryState("benchmarksValue", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [filterHidden] = useQueryState("hidden", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	const [filterHasPricing] = useQueryState("hasPricing", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

	// Sorting via URL params
	const [sortField, setSortField] = useQueryState("sort", {
		defaultValue: "releaseDate",
		parse: (value) => value || "releaseDate",
		serialize: (value) => value,
	});
	const [sortDirection, setSortDirection] = useQueryState("dir", {
		defaultValue: "desc",
		parse: (value) => (value === "asc" ? "asc" : "desc"),
		serialize: (value) => value,
	});

	const [page, setPage] = useQueryState("page", {
		defaultValue: 1,
		parse: (value) => {
			const parsed = Number.parseInt(value || "1", 10);
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
		},
		serialize: (value) => String(value),
	});

	const handleSort = (field: string) => {
		if (sortField === field) {
			const nextDirection = sortDirection === "desc" ? "asc" : "desc";
			setSortDirection(nextDirection);
		} else {
			setSortField(field);
			setSortDirection("desc");
		}
	};

	const getSortIcon = (field: string) => {
		if (sortField !== field) return <ArrowUpDown className="h-4 w-4" />;
		return sortDirection === "asc" ? (
			<ArrowUp className="h-4 w-4" />
		) : (
			<ArrowDown className="h-4 w-4" />
		);
	};

	const filteredSortedData = useMemo(() => {
		const filtered = data.filter((item) => {
			// Search filter
			if (searchQuery) {
				const searchLower = searchQuery.toLowerCase();
				const matchesSearch =
					item.modelName.toLowerCase().includes(searchLower) ||
					item.modelId.toLowerCase().includes(searchLower) ||
					(item.organisationName &&
						item.organisationName.toLowerCase().includes(searchLower)) ||
					item.providers.some(
						(p) =>
							p.providerName.toLowerCase().includes(searchLower) ||
							p.providerId.toLowerCase().includes(searchLower)
					);
				if (!matchesSearch) return false;
			}

			// Gateway status filter
			if (filterGatewayStatus) {
				if (filterGatewayStatus === "active" && !item.isActiveOnGateway) {
					return false;
				}
				if (filterGatewayStatus === "inactive" && item.isActiveOnGateway) {
					return false;
				}
			}

			// Has benchmarks filter
			if (filterHasBenchmarks) {
				if (filterHasBenchmarks === "true" && item.benchmarkCount === 0) {
					return false;
				}
				if (filterHasBenchmarks === "false" && item.benchmarkCount > 0) {
					return false;
				}
			}

			// Hidden filter
			if (filterHidden) {
				if (filterHidden === "true" && !item.hidden) {
					return false;
				}
				if (filterHidden === "false" && item.hidden) {
					return false;
				}
			}

			// Has pricing filter
			if (filterHasPricing) {
				if (filterHasPricing === "true" && item.pricingRulesCount === 0) {
					return false;
				}
				if (filterHasPricing === "false" && item.pricingRulesCount > 0) {
					return false;
				}
			}

			// Release date filter
			if (filterReleaseDateOp && filterReleaseDateValue && item.releaseDate) {
				const releaseDate = new Date(item.releaseDate);
				const filterDate = new Date(filterReleaseDateValue);

				if (filterReleaseDateOp === "gt" && releaseDate <= filterDate) {
					return false;
				}
				if (filterReleaseDateOp === "lt" && releaseDate >= filterDate) {
					return false;
				}
				if (
					filterReleaseDateOp === "eq" &&
					releaseDate.toDateString() !== filterDate.toDateString()
				) {
					return false;
				}
			}

			// Provider count filter
			if (filterProvidersOp && filterProvidersValue) {
				const providerCount = item.totalProviders;
				const filterValue = parseInt(filterProvidersValue, 10);

				if (filterProvidersOp === "gt" && providerCount <= filterValue) {
					return false;
				}
				if (filterProvidersOp === "gte" && providerCount < filterValue) {
					return false;
				}
				if (filterProvidersOp === "lt" && providerCount >= filterValue) {
					return false;
				}
				if (filterProvidersOp === "lte" && providerCount > filterValue) {
					return false;
				}
				if (filterProvidersOp === "eq" && providerCount !== filterValue) {
					return false;
				}
			}

			// Benchmark count filter
			if (filterBenchmarksOp && filterBenchmarksValue) {
				const benchmarkCount = item.benchmarkCount;
				const filterValue = parseInt(filterBenchmarksValue, 10);

				if (filterBenchmarksOp === "gt" && benchmarkCount <= filterValue) {
					return false;
				}
				if (filterBenchmarksOp === "gte" && benchmarkCount < filterValue) {
					return false;
				}
				if (filterBenchmarksOp === "lt" && benchmarkCount >= filterValue) {
					return false;
				}
				if (filterBenchmarksOp === "lte" && benchmarkCount > filterValue) {
					return false;
				}
				if (filterBenchmarksOp === "eq" && benchmarkCount !== filterValue) {
					return false;
				}
			}

			return true;
		});

		if (!sortField) return filtered;

		return [...filtered].sort((a, b) => {
			let aValue: any;
			let bValue: any;

			if (sortField === "releaseDate" || sortField === "retirementDate") {
				const field = sortField as "releaseDate" | "retirementDate";
				const aHasDate = !!a[field];
				const bHasDate = !!b[field];

				if (aHasDate && bHasDate) {
					const aDate = new Date(a[field]!).getTime();
					const bDate = new Date(b[field]!).getTime();
					return sortDirection === "asc"
						? aDate - bDate
						: bDate - aDate;
				}
				if (aHasDate && !bHasDate) return -1;
				if (!aHasDate && bHasDate) return 1;
				return 0;
			}

			switch (sortField) {
				case "modelName":
					aValue = a.modelName;
					bValue = b.modelName;
					break;
				case "organisationName":
					aValue = a.organisationName || "";
					bValue = b.organisationName || "";
					break;
				case "totalProviders":
					aValue = a.totalProviders;
					bValue = b.totalProviders;
					break;
				case "benchmarkCount":
					aValue = a.benchmarkCount;
					bValue = b.benchmarkCount;
					break;
				case "minInputPrice":
					aValue = a.minInputPrice;
					bValue = b.minInputPrice;
					break;
				case "minOutputPrice":
					aValue = a.minOutputPrice;
					bValue = b.minOutputPrice;
					break;
				case "avgInputPrice":
					aValue = a.avgInputPrice;
					bValue = b.avgInputPrice;
					break;
				case "avgOutputPrice":
					aValue = a.avgOutputPrice;
					bValue = b.avgOutputPrice;
					break;
				case "activeGatewayProviders":
					aValue = a.activeGatewayProviders;
					bValue = b.activeGatewayProviders;
					break;
				case "isActiveOnGateway":
					aValue = a.isActiveOnGateway ? 1 : 0;
					bValue = b.isActiveOnGateway ? 1 : 0;
					break;
				case "pricingRulesCount":
					aValue = a.pricingRulesCount;
					bValue = b.pricingRulesCount;
					break;
				default:
					aValue = "";
					bValue = "";
			}

			if (typeof aValue === "number" && typeof bValue === "number") {
				return sortDirection === "asc"
					? aValue - bValue
					: bValue - aValue;
			}

			const aStr = String(aValue).toLowerCase();
			const bStr = String(bValue).toLowerCase();
			return sortDirection === "asc"
				? aStr.localeCompare(bStr)
				: bStr.localeCompare(aStr);
		});
	}, [
		data,
		searchQuery,
		sortField,
		sortDirection,
		filterGatewayStatus,
		filterHasBenchmarks,
		filterHidden,
		filterHasPricing,
		filterReleaseDateOp,
		filterReleaseDateValue,
		filterProvidersOp,
		filterProvidersValue,
		filterBenchmarksOp,
		filterBenchmarksValue,
	]);

	const PAGE_SIZE = 100;
	const totalItems = filteredSortedData.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
	const safePage = Math.min(page, totalPages);

	const filterKey = [
		searchQuery,
		sortField,
		sortDirection,
		filterGatewayStatus,
		filterHasBenchmarks,
		filterHidden,
		filterHasPricing,
		filterReleaseDateOp,
		filterReleaseDateValue,
		filterProvidersOp,
		filterProvidersValue,
		filterBenchmarksOp,
		filterBenchmarksValue,
	].join("|");
	const prevFilterKey = useRef(filterKey);

	useEffect(() => {
		if (safePage !== page) {
			setPage(safePage);
		}
	}, [page, safePage, setPage]);

	useEffect(() => {
		if (prevFilterKey.current !== filterKey) {
			prevFilterKey.current = filterKey;
			if (page !== 1) {
				setPage(1);
			}
		}
	}, [filterKey, page, setPage]);

	const pageStart = (safePage - 1) * PAGE_SIZE;
	const pageData = filteredSortedData.slice(pageStart, pageStart + PAGE_SIZE);

	const formatDate = (dateStr: string | null) => {
		if (!dateStr) return "-";
		return new Date(dateStr).toLocaleDateString();
	};

	const getPaginationRange = (current: number, total: number, delta = 1) => {
		if (total <= 1) return [1];

		const range: Array<number | "ellipsis"> = [];
		const left = Math.max(2, current - delta);
		const right = Math.min(total - 1, current + delta);

		range.push(1);
		if (left > 2) range.push("ellipsis");
		for (let page = left; page <= right; page += 1) {
			range.push(page);
		}
		if (right < total - 1) range.push("ellipsis");
		range.push(total);

		return range;
	};

	const paginationRange = getPaginationRange(safePage, totalPages, 1);

	return (
		<TooltipProvider>
			<div className="space-y-4">
				{/* Comprehensive Model Editor */}
				<ComprehensiveModelEditor
					model={editingModel}
					open={editDialogOpen}
					onOpenChange={setEditDialogOpen}
				/>

				{/* Table */}
				<div className="border rounded-lg relative overflow-x-auto">
					<Table className="min-w-full w-max">
						<TableHeader>
							<TableRow className="bg-background">
								<TableHead className="bg-background w-20 border border-gray-200 shadow-sm sticky left-0 z-10">
									<div className="font-semibold">Actions</div>
								</TableHead>
								<TableHead className="bg-background min-w-16 border border-gray-200 shadow-sm">
									<div className="font-semibold">Model ID</div>
								</TableHead>
								<TableHead className="bg-background min-w-48 border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("modelName")}
										className="h-auto p-0 font-semibold"
									>
										Model Name {getSortIcon("modelName")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-32 border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() =>
											handleSort("organisationName")
										}
										className="h-auto p-0 font-semibold"
									>
										Organization{" "}
										{getSortIcon("organisationName")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("totalProviders")}
										className="h-auto p-0 font-semibold"
									>
										Providers {getSortIcon("totalProviders")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-40 border border-gray-200 shadow-sm">
									<div className="font-semibold">
										Provider Details
									</div>
								</TableHead>
								<TableHead className="bg-background min-w-24 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() =>
											handleSort("isActiveOnGateway")
										}
										className="h-auto p-0 font-semibold"
									>
										Gateway Status {getSortIcon("isActiveOnGateway")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-20 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() =>
											handleSort("benchmarkCount")
										}
										className="h-auto p-0 font-semibold"
									>
										Benchmarks {getSortIcon("benchmarkCount")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-24 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("pricingRulesCount")}
										className="h-auto p-0 font-semibold"
									>
										Pricing Rules {getSortIcon("pricingRulesCount")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-24 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() => handleSort("releaseDate")}
										className="h-auto p-0 font-semibold"
									>
										Release Date{" "}
										{getSortIcon("releaseDate")}
									</Button>
								</TableHead>
								<TableHead className="bg-background min-w-24 text-center border border-gray-200 shadow-sm">
									<Button
										variant="ghost"
										onClick={() =>
											handleSort("retirementDate")
										}
										className="h-auto p-0 font-semibold"
									>
										Retirement Date{" "}
										{getSortIcon("retirementDate")}
									</Button>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{loading ? (
								<TableRow>
									<TableCell
										colSpan={11}
										className="text-center py-8 border border-gray-200"
									>
										Loading...
									</TableCell>
								</TableRow>
							) : filteredSortedData.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={11}
										className="text-center py-8 border border-gray-200"
									>
										No models match the current search
									</TableCell>
								</TableRow>
							) : (
								pageData.map((item) => (
									<TableRow key={item.modelId}>
										<TableCell className="border border-gray-200 sticky left-0 bg-background z-10">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														className="h-8 w-8 p-0"
													>
														<span className="sr-only">
															Open menu
														</span>
														<MoreHorizontal className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="start">
													<DropdownMenuLabel>
														Actions
													</DropdownMenuLabel>
													<DropdownMenuItem
														onClick={() => {
															setEditingModel(item);
															setEditDialogOpen(true);
														}}
													>
														<Edit className="mr-2 h-4 w-4" />
														Edit Model
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem asChild>
														<Link
															href={`/models/${item.modelId}`}
															className="cursor-pointer"
														>
															<ExternalLink className="mr-2 h-4 w-4" />
															View Model
														</Link>
													</DropdownMenuItem>
													<DropdownMenuItem asChild>
														<Link
															href={`/models/${item.modelId}/pricing`}
															className="cursor-pointer"
														>
															<ExternalLink className="mr-2 h-4 w-4" />
															View Pricing
														</Link>
													</DropdownMenuItem>
													<DropdownMenuItem asChild>
														<Link
															href={`/models/${item.modelId}/benchmarks`}
															className="cursor-pointer"
														>
															<ExternalLink className="mr-2 h-4 w-4" />
															View Benchmarks
														</Link>
													</DropdownMenuItem>
													<DropdownMenuItem asChild>
														<Link
															href={`/models/${item.modelId}/availability`}
															className="cursor-pointer"
														>
															<ExternalLink className="mr-2 h-4 w-4" />
															View Availability
														</Link>
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
										<TableCell className="font-mono text-xs border border-gray-200">
											{item.modelId}
										</TableCell>
										<TableCell className="font-medium border border-gray-200">
											<div className="flex items-center gap-2">
												{item.organisationId && (
													<Link
														href={`/organisations/${item.organisationId}`}
													>
														<div className="w-8 h-8 relative flex items-center justify-center rounded-lg border cursor-pointer">
															<div className="w-6 h-6 relative">
																<Logo
																	id={
																		item.organisationId
																	}
																	alt="Organisation logo"
																	className="object-contain"
																	fill
																/>
															</div>
														</div>
													</Link>
												)}
												<Link
													href={`/models/${item.modelId}`}
												>
													<span className="text-sm font-medium cursor-pointer hover:underline">
														{item.modelName}
													</span>
												</Link>
											</div>
										</TableCell>
										<TableCell className="border border-gray-200">
											{item.organisationId ? (
												<Link
													href={`/organisations/${item.organisationId}`}
													className="text-sm hover:underline"
												>
													{item.organisationName}
												</Link>
											) : (
												<span className="text-sm text-muted-foreground">
													-
												</span>
											)}
										</TableCell>
										<TableCell className="text-center font-semibold border border-gray-200">
											{item.totalProviders}
										</TableCell>
										<TableCell className="border border-gray-200">
											<Tooltip>
												<TooltipTrigger asChild>
													<div className="flex flex-wrap gap-1">
														{item.providers
															.slice(0, 5)
															.map((provider) => (
																<Link
																	key={
																		provider.providerId
																	}
																	href={`/api-providers/${provider.providerId}`}
																>
																	<div className="w-6 h-6 relative flex items-center justify-center rounded border cursor-pointer hover:scale-110 transition-transform">
							<div className="w-5 h-5 relative">
								<Logo
									id={provider.providerId}
									alt={provider.providerName}
									className={`object-contain ${provider.supported === false ? "grayscale" : ""}`}
									fill
								/>
							</div>
																	</div>
																</Link>
															))}
														{item.providers.length >
															5 && (
																<div className="w-6 h-6 flex items-center justify-center rounded border bg-muted text-xs">
																	+
																	{item
																		.providers
																		.length -
																		5}
																</div>
															)}
													</div>
												</TooltipTrigger>
												<TooltipContent className="max-w-xs">
													<div className="space-y-1">
														{item.providers.map(
															(provider) => (
																<div
																	key={
																		provider.providerId
																	}
																	className="text-xs"
																>
																	<span className="font-medium">
																		{
																			provider.providerName
																		}
																	</span>
																	{" - "}
																	<span className="text-muted-foreground">
																		{provider
																			.capabilities
																			.length}{" "}
																		capabilities
																		{provider.isActiveGateway &&
																			" (Active)"}
																	</span>
																</div>
															)
														)}
													</div>
												</TooltipContent>
											</Tooltip>
										</TableCell>
										<TableCell className="text-center border border-gray-200">
											{item.isActiveOnGateway ? (
												<div className="flex items-center justify-center gap-2">
													<div className="w-2 h-2 rounded-full bg-green-500" />
													<span className="text-sm font-medium text-green-700">
														Active
													</span>
													<span className="text-xs text-muted-foreground">
														({item.activeGatewayProviders})
													</span>
												</div>
											) : (
												<div className="flex items-center justify-center gap-2">
													<div className="w-2 h-2 rounded-full bg-gray-400" />
													<span className="text-sm text-muted-foreground">
														Inactive
													</span>
												</div>
											)}
										</TableCell>
										<TableCell className="text-center font-semibold border border-gray-200">
											{item.benchmarkCount > 0 ? (
												<Link
													href={`/models/${item.modelId}/benchmarks`}
													className="text-blue-600 hover:underline"
												>
													{item.benchmarkCount}
												</Link>
											) : (
												<span className="text-muted-foreground">
													0
												</span>
											)}
										</TableCell>
										<TableCell className="text-center border border-gray-200">
											<Tooltip>
												<TooltipTrigger asChild>
													<div className="flex items-center justify-center gap-2">
														{item.pricingRulesCount > 0 ? (
															<>
																<Check className="h-4 w-4 text-green-600" />
																<span className="text-sm font-medium text-green-700">
																	{item.pricingRulesCount}
																</span>
															</>
														) : (
															<>
																<XIcon className="h-4 w-4 text-red-600" />
																<span className="text-sm text-red-700">
																	0
																</span>
															</>
														)}
													</div>
												</TooltipTrigger>
												<TooltipContent>
													<p>
														{item.pricingRulesCount > 0
															? `${item.pricingRulesCount} pricing rule${item.pricingRulesCount === 1 ? "" : "s"} configured`
															: "No pricing rules configured"}
													</p>
												</TooltipContent>
											</Tooltip>
										</TableCell>
										<TableCell className="text-sm text-center border border-gray-200">
											{formatDate(item.releaseDate)}
										</TableCell>
										<TableCell className="text-sm text-center border border-gray-200">
											{formatDate(item.retirementDate)}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>

				{/* Pagination */}
				<div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
					<div>
						Showing {totalItems === 0 ? 0 : pageStart + 1}-
						{Math.min(pageStart + PAGE_SIZE, totalItems)} of{" "}
						{totalItems}
					</div>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage(Math.max(1, safePage - 1))}
							disabled={safePage <= 1}
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<div className="flex items-center gap-1">
							{paginationRange.map((entry, index) => {
								if (entry === "ellipsis") {
									return (
										<span
											key={`ellipsis-${index}`}
											className="px-2 text-muted-foreground"
										>
											…
										</span>
									);
								}
								const pageNumber = entry;
								const isActive = pageNumber === safePage;
								return (
									<Button
										key={pageNumber}
										variant={
											isActive ? "default" : "outline"
										}
										size="sm"
										onClick={() => setPage(pageNumber)}
										disabled={isActive}
										className="h-8 w-8 px-0"
									>
										{pageNumber}
									</Button>
								);
							})}
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								setPage(Math.min(totalPages, safePage + 1))
							}
							disabled={safePage >= totalPages}
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}
