"use client";

import { AuditFilters } from "./AuditFilters";
import { AuditDataTable } from "./AuditDataTable";
import type { AuditModelData } from "@/lib/fetchers/models/table-view/getAuditModels";
import { useQueryState } from "nuqs";
import { useMemo } from "react";

interface AuditFiltersWrapperProps {
	data: AuditModelData[];
}

export function AuditFiltersWrapper({ data }: AuditFiltersWrapperProps) {
	// Read all filter states
	const [searchQuery] = useQueryState("search", {
		defaultValue: "",
		parse: (value) => value || "",
		serialize: (value) => value,
	});

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

	// Calculate filtered count
	const filteredCount = useMemo(() => {
		return data.filter((item) => {
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
		}).length;
	}, [
		data,
		searchQuery,
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

	return (
		<div className="space-y-6">
			<AuditFilters totalModels={data.length} filteredCount={filteredCount} />
			<AuditDataTable data={data} />
		</div>
	);
}
