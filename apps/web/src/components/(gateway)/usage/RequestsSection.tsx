"use client";

import React, { useRef } from "react";
import UsageTableFilters from "./UsageTableFilters";
import UnifiedRequestsTable from "./UnifiedRequestsTable";
import ExportDropdown from "./ExportDropdown";
import InvestigateGeneration from "./UsageHeader/InvestigateGeneration";

interface RequestsSectionProps {
	timeRange: { from: string; to: string };
	appNames: Map<string, string>;
	models: string[];
	providers: string[];
	modelProviders: Map<string, string[]>;
	providerNames: Map<string, string>;
	apiKeys: { id: string; name: string | null; prefix: string | null }[];
	modelMetadata: Map<string, { organisationId: string; organisationName: string }>;
}

export default function RequestsSection({
	timeRange,
	appNames,
	models,
	providers,
	modelProviders,
	providerNames,
	apiKeys,
	modelMetadata,
}: RequestsSectionProps) {
	const exportRef = useRef<((format: "csv" | "pdf") => void) | null>(null);

	const handleExport = (format: "csv" | "pdf") => {
		if (exportRef.current) {
			exportRef.current(format);
		}
	};

	return (
		<div className="space-y-4">
			<UsageTableFilters
				models={models}
				providers={providers}
				modelProviders={modelProviders}
				providerNames={providerNames}
				apiKeys={apiKeys}
				modelMetadata={modelMetadata}
				leftActions={<InvestigateGeneration iconOnly />}
			>
				<ExportDropdown
					onExportCSV={() => handleExport("csv")}
					onExportPDF={() => handleExport("pdf")}
				/>
			</UsageTableFilters>
			<UnifiedRequestsTable
				timeRange={timeRange}
				appNames={appNames}
				modelMetadata={modelMetadata}
				providerNames={providerNames}
				onExportRef={exportRef}
			/>
		</div>
	);
}
