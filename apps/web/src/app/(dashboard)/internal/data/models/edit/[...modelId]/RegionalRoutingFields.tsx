"use client";
import Link from "next/link";
import { Globe2, ArrowUpRight } from "lucide-react";
import { REGION_NAMES } from "@/components/(data)/providers/edit/RegionSelection";
import type { AdminPricingEditorSource } from "@/lib/fetchers/internal/adminModelEditorClient";
export { RegionSelection } from "@/components/(data)/providers/edit/RegionSelection";

export function ProviderResidencySummary({ provider }: { provider: AdminPricingEditorSource["providers"][number] }) {
  const describe = (regions: string[] | null) => regions?.length ? regions.map((region) => REGION_NAMES[region.toLowerCase()] || region).join(", ") : "Gateway defaults";
  return <section className="space-y-3 border-b pb-5"><h3 className="flex items-center gap-2 font-medium"><Globe2 className="size-4" aria-hidden />Provider regions</h3>
    <dl className="grid gap-2 text-sm"><div><dt className="text-muted-foreground">Execution</dt><dd>{describe(provider.default_execution_regions)}</dd></div><div><dt className="text-muted-foreground">Data residency</dt><dd>{describe(provider.default_data_regions)}</dd></div></dl>
    <Link href={`/internal/data/api-providers/${provider.provider_slug}/edit`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Edit provider regions<ArrowUpRight className="size-4" aria-hidden /></Link>
  </section>;
}
