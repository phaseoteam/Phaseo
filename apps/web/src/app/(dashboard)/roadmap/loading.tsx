export default function RoadmapLoading() {
	return (
		<main aria-busy="true" className="min-h-screen">
			<div className="mx-4 px-2 py-12 sm:mx-6 sm:px-0 sm:py-16 lg:mx-8 xl:mx-10 2xl:mx-auto 2xl:max-w-[1460px]">
				<div className="space-y-4">
					<div className="h-12 w-full max-w-3xl rounded-md bg-muted/40" />
					<div className="h-6 w-full max-w-2xl rounded-md bg-muted/30" />
				</div>
				<div className="mt-12 h-10 w-full rounded-md border-y border-border/70 bg-muted/10" />
				<div className="mt-16 space-y-5">
					<div className="h-8 w-64 rounded-md bg-muted/40" />
					<div className="h-24 w-full rounded-md bg-muted/20" />
					<div className="h-24 w-full rounded-md bg-muted/20" />
				</div>
			</div>
		</main>
	);
}
