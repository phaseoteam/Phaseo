import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Globe2, Plus } from "lucide-react";
import { Logo } from "@/components/Logo";
import { fetchAdminCatalogList } from "@/lib/fetchers/internal/fetchAdminCatalog";

const PAGE_SIZE = 100;

export default async function InternalAPIProvidersPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; page?: string }>;
}) {
	const params = await searchParams;
	const queryText = (params.q ?? "").trim().replace(/[(),]/g, " ");
	const currentPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
	const { rows, count } = await fetchAdminCatalogList("providers", { q: queryText, page: currentPage, pageSize: PAGE_SIZE });
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
					<h1 className="text-2xl font-semibold">API providers</h1>
					<p className="text-sm text-muted-foreground">Providers and their regional offers.</p>
				</div>
				<div className="flex flex-wrap gap-2"><Link href="/internal/data/api-providers/new?scope=regional" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40"><Globe2 className="size-4" />New regional provider</Link><Link href="/internal/data/api-providers/new" className="w-full rounded-md border px-3 py-1.5 text-center text-sm hover:bg-muted/40 lg:w-auto">
					<Plus className="mr-1 inline size-4" />New provider
				</Link></div>
			</div>
			<form className="flex flex-col gap-3 sm:flex-row" action="/internal/data/api-providers" method="get">
				<Input
					name="q"
					defaultValue={queryText}
					placeholder="Search providers by name or ID"
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
						key={row.api_provider_id}
						href={`/internal/data/api-providers/${row.api_provider_id}/edit`}
						className="block px-3 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
					>
						<div className="flex items-center gap-3"><Logo id={row.provider_family_slug || row.api_provider_id} alt="" width={24} height={24} className="size-6 shrink-0 object-contain" /><span className="truncate">{row.api_provider_name ?? row.api_provider_id}</span>{row.offer_label ? <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">{row.offer_scope === "regional" ? <Globe2 className="size-3.5" /> : null}{row.offer_label}</span> : null}</div>
						<div className="mt-1 break-all font-mono text-xs text-muted-foreground">{row.api_provider_id}</div>
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
