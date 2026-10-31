import { notFound } from "@/lib/navigation";
import { useParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { OrganisationForm } from "@/components/(data)/OrganisationForm";
import { updateOrganisationAction, withTargetId } from "../../../actions";
import { adminCatalogRecordQuery } from "../../../catalog.functions";

export default function EditOrganisationPage() {
  const t = useTranslations("Product.internalTools.dataEditor");
  const { organisationId } = useParams({ from: "/{-$locale}/_dashboard/internal/data/organisations/$organisationId/edit/" });
  const { data: { row, links = [] } } = useSuspenseQuery(adminCatalogRecordQuery("organisation", organisationId));
  if (!row) return notFound();
  return <div className="container mx-auto space-y-8 py-8"><div><h1 className="text-2xl font-semibold">{row.name || organisationId}</h1><p className="mt-1 text-sm text-muted-foreground">{t("organisations")}</p></div><OrganisationForm key={organisationId} organisation={row} links={links} action={async (form) => { await updateOrganisationAction({ data: withTargetId(organisationId, form) }); }} /></div>;
}
