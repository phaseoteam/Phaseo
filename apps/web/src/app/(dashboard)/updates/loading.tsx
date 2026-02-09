export default function UpdatesLoading() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="space-y-5">
				<div className="h-8 w-56 animate-pulse rounded bg-muted" />
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{Array.from({ length: 8 }).map((_, index) => (
						<div
							key={index}
							className="h-56 animate-pulse rounded-xl bg-muted"
						/>
					))}
				</div>
			</div>
		</div>
	);
}
