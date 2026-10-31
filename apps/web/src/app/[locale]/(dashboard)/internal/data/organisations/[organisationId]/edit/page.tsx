import { notFound } from "@/lib/navigation";
import { use } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { OrganisationForm } from "@/components/(data)/OrganisationForm";
import { updateOrganisationAction } from "../../../actions";
import { adminCatalogRecordQuery } from "../../../catalog.functions";

export default function EditOrganisationPage({ params }: { params: Promise<{ organisationId: string }> }) {
  const t = useTranslations("Product.internalTools.dataEditor");
  const { organisationId } = use(params);
  const { data: { row, links = [] } } = useSuspenseQuery(adminCatalogRecordQuery("organisation", organisationId));
  if (!row) return notFound();
  return <div className="container mx-auto space-y-8 py-8"><div><h1 className="text-2xl font-semibold">{row.name || organisationId}</h1><p className="mt-1 text-sm text-muted-foreground">{t("organisations")}</p></div><OrganisationForm key={organisationId} organisation={row} links={links} action={updateOrganisationAction.bind(null, organisationId)} /></div>;
}
