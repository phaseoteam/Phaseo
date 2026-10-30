import {
	ModelCreatorModelsSkeleton,
	ModelOverviewSectionsSkeleton,
} from "@/components/(data)/model/overview/ModelOverviewSections";
import { ModelDetailShellSkeleton } from "@/components/(data)/model/ModelDetailShell";

export default function ModelDetailLoading() {
	return (
		<ModelDetailShellSkeleton>
			<ModelOverviewSectionsSkeleton />
			<div className="mt-10">
				<ModelCreatorModelsSkeleton />
			</div>
		</ModelDetailShellSkeleton>
	);
}
