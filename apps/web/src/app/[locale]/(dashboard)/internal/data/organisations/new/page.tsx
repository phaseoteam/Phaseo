import { useTranslations } from "@/i18n/react";
import { OrganisationForm } from "@/components/(data)/OrganisationForm";
import { createOrganisationAction } from "../../actions";

export default function NewOrganisationPage() {
  const t = useTranslations("Product.internalTools.dataEditor");

  return <div className="container mx-auto space-y-8 py-8"><h1 className="text-2xl font-semibold">{t("organisationCreateTitle")}</h1><OrganisationForm action={async (form) => { await createOrganisationAction({ data: form }); }} /></div>;
}
