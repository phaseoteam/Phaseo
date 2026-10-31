import { useTranslations } from "@/i18n/react";
import { APIProvidersPageSkeleton } from "@/components/(data)/api-providers/APIProvidersPageSkeleton";

export default function ApiProvidersLoading() {
	const t = useTranslations("Catalogue.providers");
	return <APIProvidersPageSkeleton title={t("title")} />;
}
