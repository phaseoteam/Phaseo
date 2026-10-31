import { use } from "react";
import { getTranslations } from "@/i18n/server";
import { redirect } from "@/lib/navigation";
import { localizePublicPath } from "@/lib/auth/localized-paths";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("workspaces") };
}

export default function WorkspacesPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = use(params);
	redirect(localizePublicPath((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale, "/settings/workspaces/settings"));
}
