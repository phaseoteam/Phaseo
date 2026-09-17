"use client";

import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import UnifiedRequestsTable from "./UnifiedRequestsTable";
import ExportDropdown from "./ExportDropdown";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { runUsageViewRefresh } from "@/lib/gateway/usage/refreshBus";
import type {
	ProviderMetadataEntry,
	RequestRow,
} from "@/app/(dashboard)/gateway/usage/server-actions";
import { type ModelMetadataMap } from "./model-display";
import RequestColumnSettings, {
	useRequestColumns,
} from "./RequestColumnSettings";

interface RequestsSectionProps {
	apiKeys?: Array<{ id: string; name: string | null }>;
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
	initialHasMore: boolean;
	initialNextCursor: { createdAt: string; id: string } | null;
	initialPageSize: number;
	detailBasePath?: string;
	columnSettingsTargetId?: string;
}

export default function RequestsSection({
	apiKeys,
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
	initialHasMore,
	initialNextCursor,
	initialPageSize,
	detailBasePath,
	columnSettingsTargetId,
}: RequestsSectionProps) {
	const { columns, updateColumns, density, updateDensity } =
		useRequestColumns();
	const [columnSettingsTarget, setColumnSettingsTarget] =
		React.useState<HTMLElement | null>(null);
	React.useEffect(() => {
		setColumnSettingsTarget(
			columnSettingsTargetId
				? document.getElementById(columnSettingsTargetId)
				: null,
		);
	}, [columnSettingsTargetId]);
	const columnSettings = (
		<RequestColumnSettings
			columns={columns}
			onChange={updateColumns}
			density={density}
			onDensityChange={updateDensity}
		/>
	);
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
			await runUsageViewRefresh("logs");
			toast.success("Refresh Successful");
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
			{columnSettingsTarget ? (
				createPortal(columnSettings, columnSettingsTarget)
			) : !columnSettingsTargetId ? (
				<div className="flex justify-end">{columnSettings}</div>
			) : null}
			<UnifiedRequestsTable
				columns={columns}
				density={density}
				apiKeys={apiKeys}
				timeRange={timeRange}
				appNames={appNames}
				modelMetadata={modelMetadata}
				providerNames={providerNames}
				providerMetadata={providerMetadata}
				initialPage={initialPage}
				initialRows={initialRows}
				initialTotal={initialTotal}
				initialTotalPages={initialTotalPages}
				initialHasMore={initialHasMore}
				initialNextCursor={initialNextCursor}
				initialPageSize={initialPageSize}
				detailBasePath={detailBasePath}
				onExportRef={exportRef}
			/>
		</div>
	);
}
