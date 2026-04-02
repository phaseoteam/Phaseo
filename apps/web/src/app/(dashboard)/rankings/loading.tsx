import { ChartSkeleton, ListSkeleton } from "@/components/(rankings)/Skeletons";

export default function RankingsLoading() {
	return (
		<div className="container mx-auto space-y-8 px-4 py-8 sm:px-6 lg:px-8">
			<ChartSkeleton />
			<ListSkeleton />
			<ChartSkeleton />
		</div>
	);
}
