import { getTranslations } from "next-intl/server";
import { OrganisationForm } from "@/components/(data)/OrganisationForm";
import { createOrganisationAction } from "../../actions";

export default async function NewOrganisationPage() {
  const t = await getTranslations("Product.internalTools.dataEditor");

  return <div className="container mx-auto space-y-8 py-8"><h1 className="text-2xl font-semibold">{t("organisationCreateTitle")}</h1><OrganisationForm action={createOrganisationAction} /></div>;
}
