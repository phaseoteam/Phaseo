import AccessContent from "./AccessContent";
import { getTranslations } from "@/i18n/server";
export async function getWorkspaceAccessMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("workspaceAccess") };
}
export default function Page() { return <AccessContent />; }
