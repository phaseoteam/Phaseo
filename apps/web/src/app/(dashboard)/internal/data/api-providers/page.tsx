import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

const PAGE_SIZE = 100;

export default async function InternalAPIProvidersPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; page?: string }>;
}) {
	const supabase = await createClient();
	const params = await searchParams;
	const queryText = (params.q ?? "").trim().replace(/[(),]/g, " ");
	const currentPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
	const from = (currentPage - 1) * PAGE_SIZE;
	const to = from + PAGE_SIZE - 1;

	let query = supabase
		.from("data_api_providers")
		.select("api_provider_id, api_provider_name, created_at", { count: "exact" })
		.order("created_at", { ascending: false })
		.range(from, to);

	if (queryText) {
		query = query.or(`api_provider_id.ilike.%${queryText}%,api_provider_name.ilike.%${queryText}%`);
	}

	const { data: rows, count } = await query;
	const totalRows = count ?? 0;
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
					<p className="text-sm text-muted-foreground">Small list view for fast record navigation.</p>
				</div>
				<Link href="/internal/data/api-providers/new" className="w-full rounded-md border px-3 py-1.5 text-center text-sm hover:bg-muted/40 lg:w-auto">
					New provider
				</Link>
			</div>
			<form className="flex flex-col gap-3 sm:flex-row" action="/internal/data/api-providers" method="get">
				<input
					name="q"
					defaultValue={queryText}
					placeholder="Search providers by name or ID"
					className="w-full rounded-md border px-3 py-2 text-sm sm:max-w-md"
				/>
				<button type="submit" className="rounded-md border px-3 py-2 text-sm">
					Search
				</button>
			</form>
			<div className="grid gap-2 2xl:grid-cols-2">
				{(rows ?? []).map((row: any) => (
					<Link
						key={row.api_provider_id}
						href={`/internal/data/api-providers/${row.api_provider_id}/edit`}
						className="rounded-md border px-4 py-3 hover:bg-muted/40 transition-colors"
					>
						<div className="truncate">{row.api_provider_name ?? row.api_provider_id}</div>
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
