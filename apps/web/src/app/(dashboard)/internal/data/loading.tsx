export default function CatalogLoading() {
	return <div role="status" className="space-y-4 py-8" aria-label="Loading catalog records">
		<div className="h-8 w-48 animate-pulse rounded bg-muted" />
		<div className="h-11 animate-pulse rounded bg-muted" />
		<div className="h-48 animate-pulse rounded-lg bg-muted" />
		<span className="sr-only">Loading catalog records…</span>
	</div>;
}
