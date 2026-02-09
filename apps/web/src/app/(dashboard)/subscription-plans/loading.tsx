export default function SubscriptionPlansLoading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="space-y-4">
				<div className="h-8 w-64 animate-pulse rounded bg-muted" />
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
					{Array.from({ length: 9 }).map((_, index) => (
						<div
							key={index}
							className="h-44 animate-pulse rounded-xl bg-muted"
						/>
					))}
				</div>
			</div>
		</div>
	);
}
