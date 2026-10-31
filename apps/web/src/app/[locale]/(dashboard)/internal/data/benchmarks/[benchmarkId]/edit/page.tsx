import { notFound } from "@/lib/navigation";
import { use } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { BenchmarkForm } from "@/components/(data)/BenchmarkForm";
import { updateBenchmarkAction } from "../../../actions";
import { adminCatalogRecordQuery } from "../../../catalog.functions";

export default function EditBenchmarkPage({ params }: { params: Promise<{ benchmarkId: string }> }) {
  const t = useTranslations("Product.internalTools.dataEditor");
  const { benchmarkId } = use(params);
  const { data: { row } } = useSuspenseQuery(adminCatalogRecordQuery("benchmark", benchmarkId));
  if (!row) return notFound();
  return <div className="container mx-auto space-y-8 py-8"><div><h1 className="text-2xl font-semibold">{row.name || benchmarkId}</h1><p className="mt-1 text-sm text-muted-foreground">{t("benchmarks")}</p></div><BenchmarkForm key={benchmarkId} benchmark={row} action={updateBenchmarkAction.bind(null, benchmarkId)} /></div>;
}
