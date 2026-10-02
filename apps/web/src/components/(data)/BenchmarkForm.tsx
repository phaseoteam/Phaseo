"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChartNoAxesColumnIncreasing, Link2 } from "lucide-react";
import { CatalogForm } from "./CatalogForm";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

type Benchmark = { id: string; name?: string | null; category?: string | null; ascending_order?: boolean | null; link?: string | null };

export function BenchmarkForm({ benchmark, action }: { benchmark?: Benchmark; action: (form: FormData) => Promise<void> }) {
  const t = useTranslations("Product.internalTools.dataEditor");
  const [order, setOrder] = useState(benchmark?.ascending_order === true ? "higher" : benchmark?.ascending_order === false ? "lower" : "");
  return <CatalogForm action={action} className="max-w-3xl space-y-8" submitLabel={benchmark ? t("actionSave") : t("benchmarkCreateTitle")} backHref="/internal/data/benchmarks">
    <section className="space-y-5">
      <h2 className="flex items-center gap-2 font-medium"><ChartNoAxesColumnIncreasing className="size-4 text-muted-foreground" />{t("benchmarks")}</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">{t("name")}<Input className="min-h-11" name="name" defaultValue={benchmark?.name ?? ""} required /></label>
        <label className="space-y-2 text-sm font-medium">{t("benchmarkId")}<Input className="min-h-11" name="id" defaultValue={benchmark?.id ?? ""} required readOnly={Boolean(benchmark)} /></label>
        <label className="space-y-2 text-sm font-medium">{t("category")}<Input className="min-h-11" name="category" defaultValue={benchmark?.category ?? ""} /></label>
        <div className="space-y-2"><label htmlFor="benchmark-order" className="text-sm font-medium">{t("scoringOrder")}</label><SearchableSelect id="benchmark-order" label={t("scoringOrder")} value={order} options={[{ value: "", label: t("default") }, { value: "higher", label: t("higherIsBetter") }, { value: "lower", label: t("lowerIsBetter") }]} onValueChange={setOrder} /><input type="hidden" name="ascending_order" value={order} /></div>
      </div>
    </section>
    <section className="space-y-5 border-t pt-6"><h2 className="flex items-center gap-2 font-medium"><Link2 className="size-4 text-muted-foreground" />{t("link")}</h2><label className="block space-y-2 text-sm font-medium">{t("websiteLink")}<Input className="min-h-11" name="link" type="url" defaultValue={benchmark?.link ?? ""} placeholder="https://…" /></label></section>
  </CatalogForm>;
}
