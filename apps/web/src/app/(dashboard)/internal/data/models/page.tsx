import Link from "next/link";
import { fetchAdminCatalogList } from "@/lib/fetchers/internal/fetchAdminCatalog";

const PAGE_SIZE = 100;

export default async function InternalModelsPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; page?: string; attention?: string }>;
}) {
	const params = await searchParams;
	const queryText = (params.q ?? "").trim().replace(/[(),]/g, " ");
	const currentPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
	const attention = ["hidden", "missing-organisation"].includes(params.attention ?? "") ? params.attention : undefined;
	const { rows, count } = await fetchAdminCatalogList("models", { q: queryText, page: currentPage, pageSize: PAGE_SIZE, attention });
	const totalRows = count;
	const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
	const hasPrev = currentPage > 1;
	const hasNext = currentPage < totalPages;

	const pageHref = (page: number) => {
		const qp = new URLSearchParams();
		if (queryText) qp.set("q", queryText);
		if (attention) qp.set("attention", attention);
		if (page > 1) qp.set("page", String(page));
		const queryString = qp.toString();
		return queryString ? `?${queryString}` : "?";
	};

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-start">
				<div>
					<h1 className="text-2xl font-semibold">Models</h1>
					<p className="text-sm text-muted-foreground">{totalRows.toLocaleString()} records{attention === "hidden" ? " · Hidden models" : attention === "missing-organisation" ? " · Missing organisation" : ""}</p>
				</div>
				<Link href="/internal/data/models/new" className="w-full rounded-md border px-3 py-1.5 text-center text-sm hover:bg-muted/40 lg:w-auto">
					New model
				</Link>
			</div>
			<form className="flex flex-col gap-3 sm:flex-row" action="/internal/data/models" method="get">
				{attention ? <input type="hidden" name="attention" value={attention} /> : null}
				<input
					name="q"
					aria-label="Search models by name or ID"
					defaultValue={queryText}
					placeholder="Search models by name or ID"
					className="w-full rounded-md border px-3 py-2 text-sm sm:max-w-md"
				/>
				<button type="submit" className="rounded-md border px-3 py-2 text-sm">
					Search
				</button>
			</form>
			<nav aria-label="Model filters" className="flex flex-wrap gap-2 text-sm">
				{[{ value: "", label: "All models" }, { value: "hidden", label: "Hidden" }, { value: "missing-organisation", label: "Missing organisation" }].map((filter) => {
					const query = new URLSearchParams();
					if (queryText) query.set("q", queryText);
					if (filter.value) query.set("attention", filter.value);
					return <Link key={filter.value} href={`?${query}`} aria-current={(attention ?? "") === filter.value ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-md border px-3 ${(attention ?? "") === filter.value ? "bg-muted font-medium" : "hover:bg-muted/40"}`}>{filter.label}</Link>;
				})}
			</nav>
			{!rows.length ? <div className="rounded-lg border border-dashed px-4 py-12 text-center"><p className="font-medium">No models found</p><p className="mt-1 text-sm text-muted-foreground">Try a different name or clear your filters.</p><Link href="/internal/data/models" className="mt-4 inline-flex min-h-11 items-center text-sm underline">Clear search and filters</Link></div> : null}
			<div className="grid gap-2 2xl:grid-cols-2">
				{rows.map((row: any) => (
					<Link
						key={row.model_id}
						href={`/internal/data/models/edit/${row.model_id}`}
						className="rounded-md border px-4 py-3 hover:bg-muted/40 transition-colors"
					>
						<div className="truncate">{row.name ?? row.model_id}</div>
						<div className="mt-1 break-all font-mono text-xs text-muted-foreground">{row.model_id}</div>
					</Link>
				))}
			</div>
			<div className="flex flex-col gap-3 border-t pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
				<div>
					Page {currentPage} of {totalPages} • {totalRows} total
				</div>
				<div className="flex gap-2">
					{hasPrev ? (
						<Link href={pageHref(currentPage - 1)} className="rounded-md border px-3 py-1.5 hover:bg-muted/40">
							Previous
						</Link>
					) : (
						<span className="rounded-md border px-3 py-1.5 opacity-50">Previous</span>
					)}
					{hasNext ? (
						<Link href={pageHref(currentPage + 1)} className="rounded-md border px-3 py-1.5 hover:bg-muted/40">
							Next
						</Link>
					) : (
						<span className="rounded-md border px-3 py-1.5 opacity-50">Next</span>
					)}
				</div>
			</div>
		</div>
	);
}
