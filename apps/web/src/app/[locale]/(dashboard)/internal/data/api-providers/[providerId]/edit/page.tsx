import { notFound } from "next/navigation";
import Link from "next/link";
import { use } from "react";
import { useSuspenseQueries } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Globe2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ProviderForm } from "@/components/(data)/providers/edit/ProviderForm";
import { adminCatalogRecordQuery, adminProviderFormOptionsQuery } from "../../../catalog.functions";

export default function EditAPIProviderPage({ params }: { params: Promise<{ providerId: string }> }) {
  const t = useTranslations("Product.internalTools.dataEditor");
  const { providerId } = use(params);
  const [{ data: { row } }, { data: options }] = useSuspenseQueries({ queries: [adminCatalogRecordQuery("provider", providerId), adminProviderFormOptionsQuery()] });
  if (!row) return notFound();
  return <div className="container mx-auto space-y-6 py-8"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><Logo id={row.provider_family_slug || providerId} alt="" width={32} height={32} /><h1 className="text-2xl font-semibold">{[row.api_provider_name, row.offer_label].filter(Boolean).join(" · ")}</h1></div>{row.offer_scope !== "regional" ? <Link className="inline-flex items-center gap-2 text-sm text-primary hover:underline" href={`/internal/data/api-providers/new?scope=regional&parent=${encodeURIComponent(providerId)}`}><Globe2 className="size-4" />{t("addRegionalProvider")}</Link> : null}</div><ProviderForm key={providerId} provider={row} options={options} /></div>;
}
