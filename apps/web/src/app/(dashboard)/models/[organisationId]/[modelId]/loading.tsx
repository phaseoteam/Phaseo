import {
	ModelCreatorModelsSkeleton,
	ModelOverviewSectionsSkeleton,
} from "@/components/(data)/model/overview/ModelOverviewSections";
import { Skeleton } from "@/components/ui/skeleton";

export default function ModelDetailLoading() {
	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8 flex w-full flex-col items-center justify-between gap-2 md:flex-row md:items-start md:gap-0">
					<div className="flex flex-col items-center gap-4 md:flex-row">
						<Skeleton className="h-10 w-10 rounded-xl md:h-16 md:w-16" />
						<div className="flex flex-col items-center gap-2 md:items-start">
							<Skeleton className="h-9 w-56" />
							<Skeleton className="h-5 w-40" />
						</div>
					</div>
					<div className="mt-2 flex w-full flex-col gap-2 md:mt-0 md:ml-6 md:w-auto">
						<Skeleton className="h-9 w-full md:w-24" />
						<Skeleton className="h-9 w-full md:w-24" />
					</div>
				</div>

				<div className="flex flex-wrap gap-2 border-b border-border/70 pb-2">
					{Array.from({ length: 6 }).map((_, index) => (
						<Skeleton key={index} className="h-8 w-24 rounded-full" />
					))}
				</div>

				<div className="mt-6 min-h-full">
					<ModelOverviewSectionsSkeleton />
					<div className="mt-10">
						<ModelCreatorModelsSkeleton />
					</div>
				</div>
			</div>
		</main>
	);
}
