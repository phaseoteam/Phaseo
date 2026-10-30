import { Skeleton } from "@/components/ui/skeleton";

export default function ToolsLoading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="space-y-5">
				<Skeleton className="h-10 w-56" />
				<div className="grid gap-4 md:grid-cols-2">
					<Skeleton className="h-48 w-full rounded-xl" />
					<Skeleton className="h-48 w-full rounded-xl" />
				</div>
				<Skeleton className="h-80 w-full rounded-xl" />
			</div>
		</div>
	);
}

