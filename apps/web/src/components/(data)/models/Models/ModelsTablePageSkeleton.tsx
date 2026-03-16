"use client";

import { MonitorDataTable } from "@/components/monitor/MonitorDataTable";
import { Skeleton } from "@/components/ui/skeleton";

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

export function ModelsTablePageSkeleton() {
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
				<div className="shrink-0 border-b border-border/70 bg-background/95 px-4 py-2.5 backdrop-blur lg:px-8">
					<div className="sm:hidden space-y-2">
						<div className="flex items-center justify-between gap-2">
							<Skeleton className="h-8 w-28" />
							<div className="flex items-center gap-2">
								<Skeleton className="h-5 w-20" />
								<Skeleton className="h-8 w-24 rounded-md" />
							</div>
						</div>
						<Skeleton className="h-8 w-full rounded-md" />
						<Skeleton className="h-8 w-full rounded-md" />
					</div>

					<div className="hidden sm:block">
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_minmax(260px,460px)_auto] sm:items-center sm:gap-3">
							<div className="min-w-0 sm:flex sm:h-8 sm:items-center">
								<Skeleton className="h-8 w-28" />
							</div>
							<div className="relative w-full sm:justify-self-center">
								<Skeleton className="h-8 w-full rounded-md" />
							</div>
							<div className="flex items-center justify-end gap-2 sm:justify-self-end">
								<Skeleton className="h-8 w-32 rounded-md" />
							</div>
						</div>
						<div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
							<Skeleton className="h-5 w-36" />
							<Skeleton className="h-4 w-32" />
						</div>
					</div>
				</div>

				<div className="w-full px-4 pt-2 pb-5 lg:px-8 lg:pt-2 lg:pb-6">
					<MonitorDataTable data={[]} loading />
				</div>
			</section>
		</div>
	);
}
