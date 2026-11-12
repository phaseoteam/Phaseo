import { Skeleton } from "@/components/ui/skeleton";

export default function CountriesLoading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="space-y-4">
				<Skeleton className="h-8 w-56 rounded-md" />
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{Array.from({ length: 12 }).map((_, index) => (
						<Skeleton
							key={index}
							className="h-16 rounded-md"
						/>
					))}
				</div>
			</div>
		</div>
	);
}
