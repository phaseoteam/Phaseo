export default function AppsLoading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="space-y-6">
				<div className="h-10 w-72 animate-pulse rounded bg-muted" />
				<div className="h-64 animate-pulse rounded-xl bg-muted" />
				<div className="h-80 animate-pulse rounded-xl bg-muted" />
			</div>
		</div>
	);
}
