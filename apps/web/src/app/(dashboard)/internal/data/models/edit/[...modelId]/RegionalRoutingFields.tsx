"use client";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Globe2, ArrowUpRight } from "lucide-react";
import { regionDisplayName } from "@/components/(data)/providers/edit/RegionSelection";
import type { AdminPricingEditorSource } from "@/lib/fetchers/internal/adminModelEditorClient";
export { RegionSelection } from "@/components/(data)/providers/edit/RegionSelection";

export function ProviderResidencySummary({ provider }: { provider: AdminPricingEditorSource["providers"][number] }) {
  const tx = useTranslations();
  const locale = useLocale();
  const regionLabels = { global: tx("Common.ui.status.global" as never), asiaPacific: tx("Common.ui.pricingEditorCopy.asiaPacific" as never) };
  const describe = (regions: string[] | null) => regions?.length ? regions.map((region) => regionDisplayName(region, locale, regionLabels)).join(", ") : tx("Common.ui.pricingEditorCopy.gatewayDefaults" as never);
  return <section className="space-y-3 border-b pb-5"><h3 className="flex items-center gap-2 font-medium"><Globe2 className="size-4" aria-hidden />{tx("Common.ui.pricingEditorCopy.providerRegions" as never)}</h3>
    <dl className="grid gap-2 text-sm"><div><dt className="text-muted-foreground">{tx("Common.ui.pricingEditorCopy.execution" as never)}</dt><dd>{describe(provider.default_execution_regions)}</dd></div><div><dt className="text-muted-foreground">{tx("Common.ui.pricingEditorCopy.dataResidency" as never)}</dt><dd>{describe(provider.default_data_regions)}</dd></div></dl>
    <Link href={`/internal/data/api-providers/${provider.provider_slug}/edit`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">{tx("Common.ui.pricingEditorCopy.editProviderRegions" as never)}<ArrowUpRight className="size-4" aria-hidden /></Link>
  </section>;
}
