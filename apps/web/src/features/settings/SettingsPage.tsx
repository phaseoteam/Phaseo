import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";
import { Link } from "@/i18n/navigation";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

export async function getSettingsMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("settings") };
}

// The route's beforeLoad redirects to the account's first settings page; this
// only renders when the account could not be loaded.
export default function SettingsIndexPage() {
	const t = useTranslations("SettingsUI.settingsAvailability");
	return <main className="min-w-0 w-full max-w-4xl space-y-8"><SettingsPageHeader title={t("title")} description={t("description")} /><Link className="inline-flex text-sm font-medium underline underline-offset-4" href="/settings">{t("retry")}</Link></main>;
}
