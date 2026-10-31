import { getTranslations } from "@/i18n/server";
import { permanentRedirect } from "@/lib/navigation";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("provisioningKeys") };
}

export default function ProvisioningKeysAliasPage() {
	permanentRedirect("/settings/management-api-keys");
}

