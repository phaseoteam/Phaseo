import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsPageSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-72" />
			</div>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<Skeleton className="h-40 w-full" />
				<Skeleton className="h-40 w-full" />
			</div>
			<div className="space-y-3">
				<Skeleton className="h-6 w-32" />
				<Skeleton className="h-24 w-full" />
			</div>
		</div>
	);
}
