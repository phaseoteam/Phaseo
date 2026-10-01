import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BenchmarkForm } from "@/components/(data)/BenchmarkForm";
import { fetchAdminCatalogRecord } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { updateBenchmarkAction } from "../../../actions";

export default async function EditBenchmarkPage({ params }: { params: Promise<{ benchmarkId: string }> }) {
  const t = await getTranslations("Product.internalTools.dataEditor");
  const { benchmarkId } = await params;
  const { row } = await fetchAdminCatalogRecord("benchmark", benchmarkId);
  if (!row) return notFound();
  return <div className="container mx-auto space-y-8 py-8"><div><h1 className="text-2xl font-semibold">{row.name || benchmarkId}</h1><p className="mt-1 text-sm text-muted-foreground">{t("benchmarks")}</p></div><BenchmarkForm key={benchmarkId} benchmark={row} action={updateBenchmarkAction.bind(null, benchmarkId)} /></div>;
}
