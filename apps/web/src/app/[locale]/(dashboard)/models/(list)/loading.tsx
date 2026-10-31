import { useTranslations } from "@/i18n/react";
import { ModelsPageSkeleton } from "@/components/(data)/models/Models/ModelsPageSkeleton";

export default function ModelsLoading() {
	const t = useTranslations("Catalogue.models");
	return <ModelsPageSkeleton title={t("title")} />;
}
