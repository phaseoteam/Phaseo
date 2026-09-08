import { Skeleton } from "@/components/ui/skeleton";

export default function BenchmarkLoading() {
	return <div className="container mx-auto space-y-6 px-4 py-8" role="status" aria-label="Loading benchmark results">
		<Skeleton className="h-14 w-full max-w-xl" />
		<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
			{[0, 1, 2, 3].map((index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
		</div>
		<Skeleton className="h-80 w-full rounded-xl" />
	</div>;
}
