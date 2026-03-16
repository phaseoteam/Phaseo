import { Skeleton } from "@/components/ui/skeleton";

function ModelCardSkeleton() {
	return (
		<div className="py-4 md:py-5">
			<div className="flex flex-col gap-4">
				<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
					<Skeleton className="ml-1 h-10 w-10 rounded-lg md:ml-0" />
					<div className="min-w-0 space-y-1 self-center">
						<Skeleton className="h-4 w-40 max-w-[75%]" />
						<Skeleton className="h-3 w-52 max-w-[95%]" />
					</div>
					<Skeleton className="h-8 w-8 rounded-md" />
				</div>

				<div className="grid gap-2 md:grid-cols-3">
					<div className="rounded-lg border bg-muted/35 px-2.5 py-2 space-y-1">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-3 w-16" />
					</div>
					<div className="rounded-lg border bg-muted/35 px-2.5 py-2 space-y-1">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-3 w-28" />
						<Skeleton className="h-3 w-24" />
					</div>
					<div className="rounded-lg border bg-muted/35 px-2.5 py-2 space-y-1">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-3 w-28" />
					</div>
				</div>

				<Skeleton className="h-3 w-40" />
			</div>
		</div>
	);
}

function ModelCardsSkeletonGrid() {
	const getSkeletonCellClass = (index: number) => {
		const isSecondColumn = index % 2 === 1;
		const isThirdColumnAt2xl = index % 3 === 2;
		const isMiddleColumnAt2xl = index % 3 === 1;

		return [
			"bg-background",
			isSecondColumn ? "md:pl-3" : "md:pr-3",
			isMiddleColumnAt2xl ? "2xl:px-3" : "",
			isThirdColumnAt2xl ? "2xl:pl-3" : "2xl:pr-3",
		]
			.filter(Boolean)
			.join(" ");
	};

	return (
		<div className="bg-border/70">
			<div className="grid grid-cols-1 gap-px md:grid-cols-2 2xl:grid-cols-3">
				{Array.from({ length: 8 }).map((_, index) => (
					<div key={index} className={getSkeletonCellClass(index)}>
						<ModelCardSkeleton />
					</div>
				))}
			</div>
		</div>
	);
}

function SidebarSkeleton() {
	return (
		<div className="space-y-4 px-4 py-2 pb-6">
			{Array.from({ length: 7 }).map((_, index) => (
				<div key={index} className="space-y-2">
					<Skeleton className="h-4 w-32" />
					<div className="space-y-1.5">
						<Skeleton className="h-8 w-full rounded-md" />
						<Skeleton className="h-8 w-full rounded-md" />
						<Skeleton className="h-8 w-full rounded-md" />
					</div>
				</div>
			))}
		</div>
	);
}

export function ModelsPageSkeleton() {
	return (
		<div className="flex w-full flex-1">
			<aside className="hidden lg:block w-[20rem] shrink-0 border-r border-border/70 bg-background/95">
				<div className="sticky top-16 flex h-[calc(100dvh-4rem)] min-h-0 flex-col">
					<div className="min-h-0 flex-1 overflow-hidden">
						<SidebarSkeleton />
					</div>
				</div>
			</aside>

			<section className="min-w-0 flex flex-1 flex-col">
				<div className="shrink-0 border-b border-border/70 bg-background/95 px-4 backdrop-blur lg:px-8">
					<div className="flex min-h-[72px] items-center justify-between gap-3 pt-3 pb-1">
						<div className="space-y-2">
							<Skeleton className="h-6 w-28" />
							<Skeleton className="h-4 w-40" />
						</div>
						<div className="flex w-full items-center gap-2 md:w-auto">
							<Skeleton className="h-8 w-full rounded-md md:w-[360px]" />
							<Skeleton className="hidden h-8 w-24 rounded-md md:block" />
						</div>
					</div>
				</div>

				<div className="w-full px-4 pt-2 pb-5 lg:px-8 lg:pt-2 lg:pb-6">
					<div className="mb-5 rounded-2xl border border-muted/70 bg-card p-4 lg:hidden">
						<Skeleton className="h-4 w-24" />
						<div className="mt-3 space-y-2">
							<Skeleton className="h-8 w-full rounded-md" />
							<Skeleton className="h-8 w-full rounded-md" />
							<Skeleton className="h-8 w-full rounded-md" />
						</div>
					</div>

					<ModelCardsSkeletonGrid />
				</div>
			</section>
		</div>
	);
}
