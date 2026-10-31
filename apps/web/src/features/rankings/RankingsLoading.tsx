import {
	ChartSkeleton,
	ListSkeleton,
} from "@/components/(rankings)/Skeletons";

export default function RankingsLoading() {
	return (
		<div className="container mx-auto space-y-12 px-4 py-8 sm:px-6 lg:px-8">
			<section className="space-y-5">
				<div className="space-y-2">
					<div className="h-9 w-full max-w-md animate-pulse rounded-md bg-muted" />
					<div className="h-4 w-full max-w-3xl animate-pulse rounded-md bg-muted" />
				</div>
				<ChartSkeleton />
				<ListSkeleton />
			</section>
			<ChartSkeleton />
		</div>
	);
}
