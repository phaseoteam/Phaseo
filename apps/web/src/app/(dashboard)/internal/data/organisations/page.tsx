import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchAdminCatalogList } from "@/lib/fetchers/internal/fetchAdminCatalog";

const PAGE_SIZE = 100;

export default async function InternalOrganisationsPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; page?: string }>;
}) {
	const params = await searchParams;
	const queryText = (params.q ?? "").trim().replace(/[(),]/g, " ");
	const currentPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
	const { rows, count } = await fetchAdminCatalogList("organisations", { q: queryText, page: currentPage, pageSize: PAGE_SIZE });
	const totalRows = count;
	const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
	const hasPrev = currentPage > 1;
	const hasNext = currentPage < totalPages;

	const pageHref = (page: number) => {
		const qp = new URLSearchParams();
		if (queryText) qp.set("q", queryText);
		if (page > 1) qp.set("page", String(page));
		const queryString = qp.toString();
		return queryString ? `?${queryString}` : "?";
	};

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-start">
				<div>
					<h1 className="text-2xl font-semibold">Organisations</h1>
					<p className="text-sm text-muted-foreground">{totalRows.toLocaleString()} records</p>
				</div>
				<Link href="/internal/data/organisations/new" className="w-full rounded-md border px-3 py-1.5 text-center text-sm hover:bg-muted/40 lg:w-auto">
					New organisation
				</Link>
			</div>
			<form className="flex flex-col gap-3 sm:flex-row" action="/internal/data/organisations" method="get">
				<Input
					name="q"
					defaultValue={queryText}
					placeholder="Search organisations by name or ID"
					aria-label="Search records" className="min-h-11 w-full sm:max-w-md"
				/>
				<Button type="submit" variant="outline" className="min-h-11">
					Search
				</Button>
			</form>
			<div className="divide-y border-y">
				{rows.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No records found.</p> : null}
				{rows.map((row: any) => (
					<Link
						key={row.organisation_id}
						href={`/internal/data/organisations/${row.organisation_id}/edit`}
						className="block px-3 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
					>
						<div className="truncate">{row.name ?? row.organisation_id}</div>
						<div className="mt-1 break-all font-mono text-xs text-muted-foreground">{row.organisation_id}</div>
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
