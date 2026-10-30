import { ModelsPageSkeleton } from "@/components/(data)/models/Models/ModelsPageSkeleton";
import { getTranslations } from "next-intl/server";

export default async function ModelsLoading() {
	const t = await getTranslations("Catalogue.models");
	return <ModelsPageSkeleton title={t("title")} />;
}
