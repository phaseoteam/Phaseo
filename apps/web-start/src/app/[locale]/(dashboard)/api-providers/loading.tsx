import { APIProvidersPageSkeleton } from "@/components/(data)/api-providers/APIProvidersPageSkeleton";
import { getTranslations } from "next-intl/server";

export default async function ApiProvidersLoading() {
	const t = await getTranslations("Catalogue.providers");
	return <APIProvidersPageSkeleton title={t("title")} />;
}
