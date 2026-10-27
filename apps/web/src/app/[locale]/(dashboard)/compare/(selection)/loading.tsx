/** Mirrors the compare layout: title, model bar, then the grouped table. */
export default function Loading() {
	return (
		<main className="flex min-h-screen flex-col">
			<div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6 sm:py-8">
				<div className="space-y-3">
					<div className="h-3 w-40 animate-pulse rounded-md bg-muted/60" />
					<div className="h-9 w-full max-w-lg animate-pulse rounded-md bg-muted/70" />
					<div className="h-4 w-full max-w-xl animate-pulse rounded-md bg-muted/50" />
				</div>
				<div className="flex gap-2 border-b border-border pb-2">
					{Array.from({ length: 3 }, (_, index) => (
						<div key={index} className="h-8 w-40 animate-pulse rounded-md border border-border/60 bg-muted/40" />
					))}
				</div>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{Array.from({ length: 3 }, (_, index) => (
						<div key={index} className="h-28 animate-pulse rounded-md border border-border/60 bg-muted/30" />
					))}
				</div>
				<div className="space-y-2">
					{Array.from({ length: 10 }, (_, index) => (
						<div key={index} className="h-9 animate-pulse rounded-md bg-muted/40" />
					))}
				</div>
			</div>
		</main>
	);
}
