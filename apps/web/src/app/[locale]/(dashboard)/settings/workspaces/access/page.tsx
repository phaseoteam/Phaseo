import AccessContent from "./AccessContent";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("workspaceAccess") };
}
export default function Page() { return <AccessContent />; }
