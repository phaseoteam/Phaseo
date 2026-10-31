import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("settings") };
}

// The route's beforeLoad redirects to the account's first settings page; this
// only renders when the account could not be loaded.
export default function SettingsIndexPage(_props: { params: Promise<{ locale: string }> }) {
	const t = useTranslations("SettingsUI.settingsAvailability");
 return <main className="container mx-auto max-w-xl px-4 py-16"><h1 className="text-xl font-semibold">{t("title")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("description")}</p><Link className="mt-5 inline-flex text-sm font-medium underline underline-offset-4" href="/settings">{t("retry")}</Link></main>;
}
