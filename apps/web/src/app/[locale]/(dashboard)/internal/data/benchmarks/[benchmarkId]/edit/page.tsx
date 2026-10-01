import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { fetchAdminCatalogRecord } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { deleteBenchmarkAction, updateBenchmarkAction } from "../../../actions";

export default async function EditBenchmarkPage({
	params,
}: {
	params: Promise<{ benchmarkId: string }>;
}) {
	const t = await getTranslations("Product.internalTools.dataEditor");
	const { benchmarkId } = await params;
	const { row } = await fetchAdminCatalogRecord("benchmark", benchmarkId);
	if (!row) return notFound();

	const updateAction = updateBenchmarkAction.bind(null, benchmarkId);
	const deleteAction = deleteBenchmarkAction.bind(null, benchmarkId);

	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">{t("benchmarkEditTitle")}</h1>
				<p className="font-mono text-xs text-muted-foreground">{row.id}</p>
			</div>
			<form action={updateAction} className="space-y-4 rounded-lg border p-4">
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">{t("name")}</div>
						<input name="name" defaultValue={row.name ?? ""} required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("category")}</div>
						<input name="category" defaultValue={row.category ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("scoringOrder")}</div>
						<select
							name="ascending_order"
							defaultValue={row.ascending_order === true ? "higher" : row.ascending_order === false ? "lower" : ""}
							className="w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="">{t("default")}</option>
							<option value="higher">{t("higherIsBetter")}</option>
							<option value="lower">{t("lowerIsBetter")}</option>
						</select>
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">{t("link")}</div>
						<input name="link" type="url" defaultValue={row.link ?? ""} className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
				</div>
				<div className="flex gap-2">
					<button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
						{t("actionSave")}
					</button>
					<Link href="/internal/data/benchmarks" className="rounded-md border px-3 py-2 text-sm">
						{t("actionBack")}
					</Link>
				</div>
			</form>
			<form action={deleteAction} className="rounded-lg border border-red-300 p-4">
				<div className="mb-2 text-sm font-medium text-red-700">{t("dangerZone")}</div>
				<button type="submit" className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">
					{t("deleteBenchmark")}
				</button>
			</form>
		</div>
	);
}
