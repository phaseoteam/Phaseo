import { Skeleton } from "@/components/ui/skeleton";

export default function ContributeLoading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="space-y-5">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-6 w-full max-w-2xl" />
				<div className="grid gap-4 md:grid-cols-2">
					<Skeleton className="h-40 w-full" />
					<Skeleton className="h-40 w-full" />
				</div>
				<Skeleton className="h-72 w-full" />
			</div>
		</div>
	);
}

