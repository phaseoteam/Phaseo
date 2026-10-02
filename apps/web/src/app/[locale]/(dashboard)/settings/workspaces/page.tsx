import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { localizePublicPath } from "@/lib/auth/localized-paths";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("workspaces") };
}

export default async function WorkspacesPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	redirect(localizePublicPath((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale, "/settings/workspaces/settings"));
}
