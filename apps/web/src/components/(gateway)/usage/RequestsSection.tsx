"use client";

import React, { useRef } from "react";
import UsageTableFilters from "./UsageTableFilters";
import UnifiedRequestsTable from "./UnifiedRequestsTable";
import ExportDropdown from "./ExportDropdown";
import InvestigateGeneration from "./UsageHeader/InvestigateGeneration";

interface RequestsSectionProps {
	title?: string;
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
	title,
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
		<div className="space-y-3">
			{title ? (
				<div className="flex items-center justify-between">
					<h2 className="text-2xl font-bold">{title}</h2>
					<div className="flex items-center gap-2">
						<InvestigateGeneration iconOnly />
						<ExportDropdown
							onExportCSV={() => handleExport("csv")}
							onExportPDF={() => handleExport("pdf")}
							iconOnly
						/>
					</div>
				</div>
			) : null}
			<UsageTableFilters
				models={models}
				providers={providers}
				modelProviders={modelProviders}
				providerNames={providerNames}
				apiKeys={apiKeys}
				modelMetadata={modelMetadata}
			/>
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
