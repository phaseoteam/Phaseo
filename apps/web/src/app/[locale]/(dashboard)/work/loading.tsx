import { Skeleton } from "@/components/ui/skeleton";

export default function WorkLoading() {
	return (
		<div className="space-y-3">
			<Skeleton className="h-8 w-64 rounded-md" />
			<div className="divide-y rounded-md border">
				{Array.from({ length: 8 }).map((_, index) => (
					<div key={index} className="flex items-center gap-3 px-3 py-2.5">
						<Skeleton className="h-4 w-10 rounded-md" />
						<Skeleton className="h-4 flex-1 rounded-md" />
						<Skeleton className="h-4 w-16 rounded-md" />
					</div>
				))}
			</div>
		</div>
	);
}
