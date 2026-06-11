"use client";

import React, { useRef } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import UnifiedRequestsTable from "./UnifiedRequestsTable";
import ExportDropdown from "./ExportDropdown";
import InvestigateGeneration from "./UsageHeader/InvestigateGeneration";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { revalidateUsage } from "@/app/(dashboard)/gateway/usage/actions";
import { runUsageViewRefresh } from "@/lib/gateway/usage/refreshBus";
import type {
	ProviderMetadataEntry,
	RequestRow,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import { type ModelMetadataMap } from "./model-display";

interface RequestsSectionProps {
	title?: string;
	timeRange: { from: string; to: string };
	appNames: Map<string, string>;
	providerNames: Map<string, string>;
	providerMetadata: Map<string, ProviderMetadataEntry>;
	modelMetadata: ModelMetadataMap;
	initialPage: number;
	initialRows: RequestRow[];
	initialTotal: number;
	initialTotalPages: number;
	detailBasePath?: string;
}

export default function RequestsSection({
	title,
	timeRange,
	appNames,
	providerNames,
	providerMetadata,
	modelMetadata,
	initialPage,
	initialRows,
	initialTotal,
	initialTotalPages,
	detailBasePath,
}: RequestsSectionProps) {
	const exportRef = useRef<((format: "csv" | "pdf") => void) | null>(null);
	const [refreshing, setRefreshing] = React.useState(false);

	const handleExport = (format: "csv" | "pdf") => {
		if (exportRef.current) {
			exportRef.current(format);
		}
	};

	async function onRefresh() {
		try {
			setRefreshing(true);
			const res = await revalidateUsage("logs");
			if (res?.ok) {
				await runUsageViewRefresh("logs");
			}
			if (res?.ok) toast.success("Refresh Successful");
			else toast.error("Refresh Failed");
		} catch {
			toast.error("Refresh Failed");
		} finally {
			setRefreshing(false);
		}
	}

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
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									onClick={onRefresh}
									aria-label="Refresh"
									disabled={refreshing}
								>
									{refreshing ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<RotateCcw className="h-4 w-4" />
									)}
								</Button>
							</TooltipTrigger>
							<TooltipContent sideOffset={6}>Refresh</TooltipContent>
						</Tooltip>
					</div>
				</div>
			) : null}
			<UnifiedRequestsTable
				timeRange={timeRange}
				appNames={appNames}
				modelMetadata={modelMetadata}
				providerNames={providerNames}
				providerMetadata={providerMetadata}
				initialPage={initialPage}
				initialRows={initialRows}
				initialTotal={initialTotal}
				initialTotalPages={initialTotalPages}
				detailBasePath={detailBasePath}
				onExportRef={exportRef}
			/>
		</div>
	);
}
