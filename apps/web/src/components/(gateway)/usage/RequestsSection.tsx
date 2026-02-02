"use client";

import React, { useRef } from "react";
import UsageTableFilters from "./UsageTableFilters";
import UnifiedRequestsTable from "./UnifiedRequestsTable";
import ExportDropdown from "./ExportDropdown";

interface RequestsSectionProps {
	timeRange: { from: string; to: string };
	appNames: Map<string, string>;
	models: string[];
	providers: string[];
	apiKeys: { id: string; name: string | null; prefix: string | null }[];
	modelMetadata: Map<string, { organisationId: string; organisationName: string }>;
}

export default function RequestsSection({
	timeRange,
	appNames,
	models,
	providers,
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
				apiKeys={apiKeys}
				modelMetadata={modelMetadata}
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
				onExportRef={exportRef}
			/>
		</div>
	);
}
