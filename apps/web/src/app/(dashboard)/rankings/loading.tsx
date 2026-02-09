import { ChartSkeleton, ListSkeleton } from "@/components/(rankings)/Skeletons";

export default function RankingsLoading() {
	return (
		<div className="container mx-auto space-y-8 py-8">
			<ChartSkeleton />
			<ListSkeleton />
			<ChartSkeleton />
		</div>
	);
}
