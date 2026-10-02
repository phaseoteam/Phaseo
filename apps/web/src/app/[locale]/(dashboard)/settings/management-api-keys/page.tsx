import ManagementApiKeysContent from "./ManagementApiKeysContent";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.managementApiKeys")} - ${t("headers.settings")}` };
}
export default function ManagementApiKeysPage() { return <ManagementApiKeysContent />; }
