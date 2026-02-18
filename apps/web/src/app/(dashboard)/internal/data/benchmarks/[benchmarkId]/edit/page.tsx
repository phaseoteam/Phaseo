import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { deleteBenchmarkAction, updateBenchmarkAction } from "../../../actions";

export default async function EditBenchmarkPage({
	params,
}: {
	params: Promise<{ benchmarkId: string }>;
}) {
	const { benchmarkId } = await params;
	const supabase = await createClient();
	const { data: row } = await supabase
		.from("data_benchmarks")
		.select("id, name, category, link, ascending_order")
		.eq("id", benchmarkId)
		.maybeSingle();
	if (!row) return notFound();

	const updateAction = updateBenchmarkAction.bind(null, benchmarkId);
	const deleteAction = deleteBenchmarkAction.bind(null, benchmarkId);

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">Edit benchmark</h1>
				<p className="font-mono text-xs text-muted-foreground">{row.id}</p>
			</div>
			<form action={updateAction} className="space-y-4 rounded-lg border p-4">
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">Name</div>
						<input name="name" defaultValue={row.name ?? ""} required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Category</div>
						<input name="category" defaultValue={row.category ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">Scoring order</div>
						<select
							name="ascending_order"
							defaultValue={row.ascending_order === true ? "higher" : row.ascending_order === false ? "lower" : ""}
							className="w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="">Default</option>
							<option value="higher">Higher is better</option>
							<option value="lower">Lower is better</option>
						</select>
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">Link</div>
						<input name="link" type="url" defaultValue={row.link ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
				</div>
				<div className="flex gap-2">
					<button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
						Save
					</button>
					<Link href="/internal/data/benchmarks" className="rounded-md border px-3 py-2 text-sm">
						Back
					</Link>
				</div>
			</form>
			<form action={deleteAction} className="rounded-lg border border-red-300 p-4">
				<div className="mb-2 text-sm font-medium text-red-700">Danger zone</div>
				<button type="submit" className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">
					Delete benchmark
				</button>
			</form>
		</div>
	);
}

