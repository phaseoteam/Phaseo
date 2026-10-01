import { getTranslations } from "next-intl/server";
import { permanentRedirect } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("provisioningKeys") };
}

export default async function ProvisioningKeysAliasPage() {
	permanentRedirect("/settings/management-api-keys");
}

