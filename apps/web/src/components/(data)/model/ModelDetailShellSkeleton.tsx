import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function ModelDetailShellSkeleton({
	children,
}: {
	children: ReactNode;
}) {
	return (
		<main className="flex flex-col">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-5 flex w-full flex-col items-center justify-between gap-2 md:flex-row md:items-start md:gap-0">
					<div className="flex flex-col items-center gap-4 md:flex-row">
						<div className="flex items-center justify-center">
							<div className="relative flex h-10 w-10 items-center justify-center rounded-xl border md:h-16 md:w-16">
								<Skeleton className="h-8 w-8 rounded-lg md:h-12 md:w-12" />
							</div>
						</div>
						<div className="flex flex-col items-center justify-center md:items-start">
							<div className="flex items-center gap-3">
								<Skeleton className="mb-1 h-9 w-56" />
							</div>
							<Skeleton className="mb-1 h-5 w-40" />
						</div>
					</div>

					<div className="mt-2 flex w-full flex-col gap-2 md:mt-0 md:ml-6 md:w-auto">
						<Skeleton className="h-9 w-full md:w-24" />
						<Skeleton className="h-9 w-full md:w-24" />
					</div>
				</div>
				<Skeleton className="mb-4 h-12 w-full rounded-md" />

				<div className="mt-6 min-h-full">{children}</div>
			</div>
		</main>
	);
}
