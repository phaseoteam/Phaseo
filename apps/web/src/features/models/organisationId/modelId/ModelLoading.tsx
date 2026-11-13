import {
	ModelCreatorModelsSkeleton,
	ModelOverviewSectionsSkeleton,
} from "@/components/(data)/model/overview/ModelOverviewSectionsSkeleton";
import { ModelDetailShellSkeleton } from "@/components/(data)/model/ModelDetailShellSkeleton";

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
