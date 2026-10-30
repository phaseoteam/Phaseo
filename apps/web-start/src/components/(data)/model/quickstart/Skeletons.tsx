// src/components/gateway/Skeletons.tsx
export function BlockSkeleton() {
	return (
		<div className="rounded-2xl border p-6">
			<div className="h-5 w-40 animate-pulse rounded bg-muted mb-4" />
			<div className="h-4 w-3/4 animate-pulse rounded bg-muted mb-2" />
			<div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
		</div>
	);
}
