"use client";

import { useState } from "react";
import { ChartNoAxesColumnIncreasing, Link2 } from "lucide-react";
import { CatalogForm } from "./CatalogForm";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

type Benchmark = { id: string; name?: string | null; category?: string | null; ascending_order?: boolean | null; link?: string | null };

export function BenchmarkForm({ benchmark, action }: { benchmark?: Benchmark; action: (form: FormData) => Promise<void> }) {
  const [order, setOrder] = useState(benchmark?.ascending_order === true ? "higher" : benchmark?.ascending_order === false ? "lower" : "");
  return <CatalogForm action={action} className="max-w-3xl space-y-8" submitLabel={benchmark ? "Save benchmark" : "Create benchmark"} backHref="/internal/data/benchmarks">
    <section className="space-y-5">
      <h2 className="flex items-center gap-2 font-medium"><ChartNoAxesColumnIncreasing className="size-4 text-muted-foreground" />Benchmark details</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">Name<Input className="min-h-11" name="name" defaultValue={benchmark?.name ?? ""} required /></label>
        <label className="space-y-2 text-sm font-medium">Benchmark ID<Input className="min-h-11" name="id" defaultValue={benchmark?.id ?? ""} required readOnly={Boolean(benchmark)} /></label>
        <label className="space-y-2 text-sm font-medium">Category<Input className="min-h-11" name="category" defaultValue={benchmark?.category ?? ""} /></label>
        <div className="space-y-2"><label htmlFor="benchmark-order" className="text-sm font-medium">Scoring order</label><SearchableSelect id="benchmark-order" label="Scoring order" value={order} options={[{ value: "", label: "Default" }, { value: "higher", label: "Higher is better" }, { value: "lower", label: "Lower is better" }]} onValueChange={setOrder} /><input type="hidden" name="ascending_order" value={order} /></div>
      </div>
    </section>
    <section className="space-y-5 border-t pt-6"><h2 className="flex items-center gap-2 font-medium"><Link2 className="size-4 text-muted-foreground" />Source</h2><label className="block space-y-2 text-sm font-medium">Website<Input className="min-h-11" name="link" type="url" defaultValue={benchmark?.link ?? ""} placeholder="https://…" /></label></section>
  </CatalogForm>;
}
