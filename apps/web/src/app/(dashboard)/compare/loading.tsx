export default function CompareLoading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="space-y-4">
				<div className="h-8 w-64 animate-pulse rounded bg-muted" />
				<div className="h-24 animate-pulse rounded-xl bg-muted" />
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					<div className="h-80 animate-pulse rounded-xl bg-muted" />
					<div className="h-80 animate-pulse rounded-xl bg-muted" />
				</div>
			</div>
		</div>
	);
}
