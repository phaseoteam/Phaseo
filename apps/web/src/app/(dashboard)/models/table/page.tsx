import { Suspense } from "react";
import ModelsTableHeader from "@/components/(data)/models/Models/ModelsTableHeader";
import { MonitorTableClient } from "@/components/monitor/MonitorTableClient";
import { getMonitorModels } from "@/lib/fetchers/models/table-view/getMonitorModels";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

export const metadata = {
	title: "Models table view",
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
