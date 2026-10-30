import { Skeleton } from "@/components/ui/skeleton";

export default function LegalLoading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mx-auto max-w-3xl space-y-4">
				<Skeleton className="h-10 w-2/3" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-[94%]" />
				<Skeleton className="h-4 w-[88%]" />
				<Skeleton className="h-4 w-[92%]" />
			</div>
		</div>
	);
}
