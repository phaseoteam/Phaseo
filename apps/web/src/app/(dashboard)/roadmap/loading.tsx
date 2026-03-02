import { Skeleton } from "@/components/ui/skeleton";

export default function RoadmapLoading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="space-y-5">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-6 w-full max-w-2xl" />
				<div className="space-y-4">
					{Array.from({ length: 4 }).map((_, index) => (
						<Skeleton key={index} className="h-28 w-full rounded-xl" />
					))}
				</div>
			</div>
		</div>
	);
}

