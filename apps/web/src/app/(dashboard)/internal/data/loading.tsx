import { getTranslations } from "next-intl/server";
export default async function CatalogLoading() {
	const t = await getTranslations("SettingsUI.newMainSettingsCopy");
	return <div role="status" className="space-y-4 py-8" aria-label={t("loadingCatalogRecords")}>
		<div className="h-8 w-48 animate-pulse rounded bg-muted" />
		<div className="h-11 animate-pulse rounded bg-muted" />
		<div className="h-48 animate-pulse rounded-lg bg-muted" />
		<span className="sr-only">{t("loadingCatalogRecords")}</span>
	</div>;
}
