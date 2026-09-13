import { notFound } from "next/navigation";
import { OrganisationForm } from "@/components/(data)/OrganisationForm";
import { fetchAdminCatalogRecord } from "@/lib/fetchers/internal/fetchAdminCatalog";
import { updateOrganisationAction } from "../../../actions";

export default async function EditOrganisationPage({ params }: { params: Promise<{ organisationId: string }> }) {
  const { organisationId } = await params;
  const { row, links = [] } = await fetchAdminCatalogRecord("organisation", organisationId);
  if (!row) return notFound();
  return <div className="container mx-auto space-y-8 py-8"><div><h1 className="text-2xl font-semibold">{row.name || organisationId}</h1><p className="mt-1 text-sm text-muted-foreground">Organisation</p></div><OrganisationForm key={organisationId} organisation={row} links={links} action={updateOrganisationAction.bind(null, organisationId)} /></div>;
}
