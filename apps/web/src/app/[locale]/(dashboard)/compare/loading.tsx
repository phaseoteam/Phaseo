export default function CompareLoading() {
	const modelColumns = ["first", "second", "third", "fourth"];

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="space-y-10">
				<section className="space-y-3 text-center">
					<div className="mx-auto h-9 w-full max-w-2xl animate-pulse rounded bg-muted" />
					<div className="mx-auto h-4 w-80 max-w-full animate-pulse rounded bg-muted/80" />
				</section>

				<section className="space-y-3">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
						<div className="space-y-2">
							<div className="h-5 w-40 animate-pulse rounded bg-muted" />
							<div className="h-4 w-72 max-w-full animate-pulse rounded bg-muted/80" />
						</div>
						<div className="h-6 w-48 animate-pulse rounded-full bg-muted/80" />
					</div>
					<div className="overflow-hidden rounded-xl border border-border/60">
						<div className="grid grid-cols-[180px_repeat(4,minmax(160px,1fr))] border-b border-border/60 bg-muted/50">
							<div className="h-16 border-r border-border/60" />
							{modelColumns.map((column) => (
								<div key={`header-${column}`} className="space-y-2 p-3">
									<div className="h-4 w-28 animate-pulse rounded bg-muted" />
									<div className="h-3 w-20 animate-pulse rounded bg-muted/80" />
								</div>
							))}
						</div>
						{["lifecycle", "capability", "context", "routing", "pricing"].map(
							(row) => (
								<div
									key={row}
									className="grid grid-cols-[180px_repeat(4,minmax(160px,1fr))] border-b border-border/50 last:border-b-0"
								>
									<div className="h-14 border-r border-border/60 p-3">
										<div className="h-4 w-24 animate-pulse rounded bg-muted" />
									</div>
									{modelColumns.map((column) => (
										<div key={`${row}-${column}`} className="space-y-2 p-3">
											<div className="h-3 w-28 animate-pulse rounded bg-muted/80" />
											<div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
										</div>
									))}
								</div>
							)
						)}
					</div>
				</section>

				<section className="space-y-3">
					<div className="h-5 w-28 animate-pulse rounded bg-muted" />
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
						{modelColumns.map((column) => (
							<div
								key={`overview-${column}`}
								className="space-y-4 rounded-xl border border-border/60 p-4"
							>
								<div className="flex items-center gap-2">
									<div className="h-6 w-6 animate-pulse rounded bg-muted" />
									<div className="space-y-2">
										<div className="h-4 w-32 animate-pulse rounded bg-muted" />
										<div className="h-3 w-24 animate-pulse rounded bg-muted/80" />
									</div>
								</div>
								<div className="flex flex-wrap gap-1.5">
									<div className="h-5 w-16 animate-pulse rounded-full bg-muted/80" />
									<div className="h-5 w-24 animate-pulse rounded-full bg-muted/80" />
								</div>
								<div className="space-y-2">
									<div className="h-3 w-full animate-pulse rounded bg-muted/70" />
									<div className="h-3 w-4/5 animate-pulse rounded bg-muted/70" />
									<div className="h-3 w-3/5 animate-pulse rounded bg-muted/70" />
								</div>
							</div>
						))}
					</div>
				</section>

				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<div className="h-80 animate-pulse rounded-xl border border-border/60 bg-muted/70" />
					<div className="h-80 animate-pulse rounded-xl border border-border/60 bg-muted/70" />
				</div>
			</div>
		</div>
	);
}
