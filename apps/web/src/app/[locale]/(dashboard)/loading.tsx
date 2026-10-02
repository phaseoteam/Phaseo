import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="space-y-5">
				<Skeleton className="h-10 w-64" />
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<Skeleton className="h-36 w-full" />
					<Skeleton className="h-36 w-full" />
					<Skeleton className="h-36 w-full" />
				</div>
				<Skeleton className="h-80 w-full" />
			</div>
		</div>
	);
}
