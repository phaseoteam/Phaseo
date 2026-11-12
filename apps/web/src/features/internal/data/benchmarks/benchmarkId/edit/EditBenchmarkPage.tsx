import { notFound } from "@/lib/navigation";
import { useParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { BenchmarkForm } from "@/components/(data)/BenchmarkForm";
import { updateBenchmarkAction, withTargetId } from "../../../actions";
import { adminCatalogRecordQuery } from "../../../catalog.functions";

export default function EditBenchmarkPage() {
  const t = useTranslations("Product.internalTools.dataEditor");
  const { benchmarkId } = useParams({ from: "/{-$locale}/_dashboard/internal/data/benchmarks/$benchmarkId/edit/" });
  const { data: { row } } = useSuspenseQuery(adminCatalogRecordQuery("benchmark", benchmarkId));
  if (!row) return notFound();
  return <div className="container mx-auto space-y-8 py-8"><div><h1 className="text-2xl font-semibold">{row.name || benchmarkId}</h1><p className="mt-1 text-sm text-muted-foreground">{t("benchmarks")}</p></div><BenchmarkForm key={benchmarkId} benchmark={row} action={async (form) => { await updateBenchmarkAction({ data: withTargetId(benchmarkId, form) }); }} /></div>;
}
