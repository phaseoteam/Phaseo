import { Skeleton } from "@/components/ui/skeleton";

function ProviderCardSkeleton() {
	return (
		<div className="py-4 md:py-5">
			<div className="flex h-full flex-col gap-4 px-4 md:px-3">
				<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
					<Skeleton className="ml-1 h-10 w-10 rounded-lg md:ml-0" />
					<div className="min-w-0 space-y-1 self-center">
						<Skeleton className="h-4 w-40 max-w-[75%]" />
						<Skeleton className="h-3 w-52 max-w-[95%]" />
					</div>
					<Skeleton className="h-8 w-8 rounded-md" />
				</div>

				<div className="flex flex-wrap items-center gap-1.5">
					<Skeleton className="h-7 w-20 rounded-md" />
					<Skeleton className="h-7 w-16 rounded-md" />
				</div>

				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<Skeleton className="h-3 w-11" />
						<Skeleton className="h-5 w-28 rounded-md" />
						<Skeleton className="h-5 w-20 rounded-md" />
					</div>
					<div className="flex items-center gap-2">
						<Skeleton className="h-3 w-11" />
						<Skeleton className="h-5 w-24 rounded-md" />
					</div>
				</div>

				<div className="mt-auto grid grid-cols-2 gap-3">
					<div className="space-y-1">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-4 w-14" />
					</div>
					<div className="space-y-1">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-4 w-16" />
					</div>
				</div>
			</div>
		</div>
	);
}

function ProviderCardsSkeletonGrid() {
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
				{Array.from({ length: 9 }).map((_, index) => (
					<div key={index} className={getSkeletonCellClass(index)}>
						<ProviderCardSkeleton />
					</div>
				))}
			</div>
		</div>
	);
}

function SidebarSkeleton() {
	return (
		<div className="space-y-4 px-4 py-2 pb-6">
			{Array.from({ length: 3 }).map((_, index) => (
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

export function APIProvidersPageSkeleton({ title }: { title: string }) {
	return (
		<div className="flex w-full flex-1">
			<aside className="hidden w-[20rem] shrink-0 border-r border-border/70 bg-background/95 lg:block">
				<div className="sticky top-16 flex h-[calc(100dvh-4rem)] min-h-0 flex-col">
					<div className="min-h-0 flex-1 overflow-hidden">
						<SidebarSkeleton />
					</div>
				</div>
			</aside>

			<section className="min-w-0 flex flex-1 flex-col">
				<div className="shrink-0 border-b border-border/70 bg-background/95 px-4 pb-1 pt-2.5 backdrop-blur lg:px-8">
					<div className="flex h-8 items-center justify-between gap-3">
						<h1 className="text-xl font-bold leading-8">{title}</h1>
						<div className="flex w-full items-center gap-2 md:w-auto">
							<Skeleton className="h-8 w-full rounded-md md:w-[15rem]" />
							<Skeleton className="hidden h-8 w-40 rounded-md md:block" />
							<Skeleton className="hidden h-8 w-20 rounded-md lg:block" />
						</div>
					</div>
					<Skeleton className="mt-1.5 h-3 w-32" />
				</div>

				<div className="w-full px-4 pt-1 pb-5 lg:px-8 lg:pt-1 lg:pb-6">
					<div className="mb-5 rounded-2xl border border-muted/70 bg-card p-4 lg:hidden">
						<Skeleton className="h-4 w-24" />
						<div className="mt-3 space-y-2">
							<Skeleton className="h-8 w-full rounded-md" />
							<Skeleton className="h-8 w-full rounded-md" />
							<Skeleton className="h-8 w-full rounded-md" />
						</div>
					</div>

					<ProviderCardsSkeletonGrid />
				</div>
			</section>
		</div>
	);
}
