import { Skeleton } from "@/components/ui/skeleton";

export default function SubscriptionPlansLoading() {
	return (
		<div className="container mx-auto space-y-8 px-4 py-8">
			<div className="space-y-2">
				<Skeleton className="h-8 w-64 rounded-md" />
				<Skeleton className="h-4 w-full max-w-xl rounded-md" />
			</div>
			<Skeleton className="h-72 rounded-md" />
			<div className="space-y-3">
				<Skeleton className="h-9 w-full max-w-2xl rounded-md" />
				<div className="overflow-hidden rounded-md border border-border/70">
					{Array.from({ length: 10 }).map((_, index) => (
						<Skeleton key={index} className="h-14 rounded-none border-b border-border/40 last:border-b-0" />
					))}
				</div>
			</div>
		</div>
	);
}
