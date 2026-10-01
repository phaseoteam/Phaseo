import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createBenchmarkAction } from "../../actions";

export default async function NewBenchmarkPage() {
	const t = await getTranslations("Product.internalTools.dataEditor");
	return (
		<div className="container mx-auto space-y-8 py-8">
			<div>
				<h1 className="text-2xl font-semibold">{t("benchmarkCreateTitle")}</h1>
			</div>
			<form action={createBenchmarkAction} className="space-y-4 rounded-lg border p-4">
				<div className="grid gap-4 lg:grid-cols-2">
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("benchmarkId")}</div>
						<input name="id" required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("name")}</div>
						<input name="name" required className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("category")}</div>
						<input name="category" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
					<label className="text-sm">
						<div className="mb-1 text-muted-foreground">{t("scoringOrder")}</div>
						<select name="ascending_order" className="w-full rounded-md border px-3 py-2 text-sm">
							<option value="">{t("default")}</option>
							<option value="higher">{t("higherIsBetter")}</option>
							<option value="lower">{t("lowerIsBetter")}</option>
						</select>
					</label>
					<label className="text-sm lg:col-span-2">
						<div className="mb-1 text-muted-foreground">{t("link")}</div>
						<input name="link" type="url" className="w-full rounded-md border px-3 py-2 text-sm" />
					</label>
				</div>
				<div className="flex gap-2">
					<button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
						{t("actionCreate")}
					</button>
					<Link href="/internal/data/benchmarks" className="rounded-md border px-3 py-2 text-sm">
						{t("actionCancel")}
					</Link>
				</div>
			</form>
		</div>
	);
}
