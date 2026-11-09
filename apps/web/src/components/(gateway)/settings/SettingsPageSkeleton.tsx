import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsPageSkeleton() {
	return (
		<div className="min-w-0 w-full max-w-4xl space-y-8">
			<div className="space-y-2">
				<Skeleton className="h-8 w-40" />
				<Skeleton className="h-4 w-72 max-w-full" />
			</div>
			<div className="divide-y border-y">
				{[0, 1, 2].map((row) => <div key={row} className="grid gap-3 py-5 sm:grid-cols-[minmax(0,1fr)_16rem] sm:gap-8">
					<Skeleton className="h-5 w-40 max-w-full" />
					<Skeleton className="h-9 w-full" />
				</div>)}
			</div>
			<div className="space-y-3">
				<Skeleton className="h-6 w-32" />
				<Skeleton className="h-24 w-full" />
			</div>
		</div>
	);
}
