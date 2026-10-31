import { getTranslations } from "@/i18n/server";
import { redirect } from "@/lib/navigation";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("tiers") };
}

export default function TiersPage() {
	redirect("/settings/credits");
}
