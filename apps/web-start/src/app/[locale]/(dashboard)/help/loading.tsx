import { Skeleton } from "@/components/ui/skeleton";

export default function HelpLoading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="space-y-5">
				<Skeleton className="h-10 w-56" />
				<Skeleton className="h-6 w-full max-w-3xl" />
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{Array.from({ length: 6 }).map((_, index) => (
						<Skeleton key={index} className="h-36 w-full rounded-xl" />
					))}
				</div>
			</div>
		</div>
	);
}

