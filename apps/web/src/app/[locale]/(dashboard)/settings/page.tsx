import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";
import { redirect } from "next/navigation";
import { localizePublicPath } from "@/lib/auth/localized-paths";
import { isPublicLocale, type PublicLocale } from "@/i18n/routing";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("settings") };
}

export default async function SettingsIndexPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	const t = await getTranslations("SettingsUI.settingsAvailability");
 const account = await fetchInternalAuthHeaderData().catch(() => null);
 if (!account) return <main className="container mx-auto max-w-xl px-4 py-16"><h1 className="text-xl font-semibold">{t("title")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("description")}</p><Link className="mt-5 inline-flex text-sm font-medium underline underline-offset-4" href="/settings">{t("retry")}</Link></main>;
 redirect(localizePublicPath((isPublicLocale(locale) ? locale : "en-GB") as PublicLocale, account.providerMode ? "/settings/account/providers" : "/settings/credits"));
}
