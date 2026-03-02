import { Suspense } from "react";
import type { Metadata } from "next";
import ModelsTableHeader from "@/components/(data)/models/Models/ModelsTableHeader";
import { MonitorTableClient } from "@/components/monitor/MonitorTableClient";
import { getMonitorModels } from "@/lib/fetchers/models/table-view/getMonitorModels";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

export const metadata: Metadata = {
	title: "Models table view",
	description:
		"Internal table layout for browsing AI Stats model records in bulk with dense columns, sortable metadata, and quick cross-provider comparisons.",
	robots: {
		index: false,
		follow: true,
	},
};

export default async function ModelsTablePage() {
	const includeHidden = await resolveIncludeHidden();
	const {
		models: modelData,
		allTiers,
		allEndpoints,
		allModalities,
		allFeatures,
		allStatuses,
	} = await getMonitorModels({}, includeHidden);

	return (
		<div className="mx-8 py-8">
			<div className="mb-8">
				<ModelsTableHeader
					allEndpoints={allEndpoints}
					allModalities={allModalities}
					allFeatures={allFeatures}
					allTiers={allTiers}
					allStatuses={allStatuses}
				/>
			</div>

			<Suspense
				fallback={
					<div className="flex items-center justify-center py-8">
						Loading table...
					</div>
				}
			>
				<MonitorTableClient initialModelData={modelData} />
			</Suspense>
		</div>
	);
}

