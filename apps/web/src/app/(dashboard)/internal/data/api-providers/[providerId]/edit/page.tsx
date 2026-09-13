import { notFound } from "next/navigation";
import Link from "next/link";
import { Globe2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ProviderForm } from "@/components/(data)/providers/edit/ProviderForm";
import { fetchAdminCatalogRecord, fetchAdminProviderFormOptions } from "@/lib/fetchers/internal/fetchAdminCatalog";

export default async function EditAPIProviderPage({ params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  const [{ row }, options] = await Promise.all([fetchAdminCatalogRecord("provider", providerId), fetchAdminProviderFormOptions()]);
  if (!row) return notFound();
  return <div className="container mx-auto space-y-6 py-8"><div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><Logo id={row.provider_family_slug || providerId} alt="" width={32} height={32} /><h1 className="text-2xl font-semibold">{[row.api_provider_name, row.offer_label].filter(Boolean).join(" · ")}</h1></div>{row.offer_scope !== "regional" ? <Link className="inline-flex items-center gap-2 text-sm text-primary hover:underline" href={`/internal/data/api-providers/new?scope=regional&parent=${encodeURIComponent(providerId)}`}><Globe2 className="size-4" />Add regional provider</Link> : null}</div><ProviderForm key={providerId} provider={row} options={options} /></div>;
}
