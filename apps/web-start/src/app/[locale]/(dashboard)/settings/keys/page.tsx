import KeysContent from "./KeysContent";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.apiKeys")} - ${t("headers.settings")}` };
}
export default function KeysPage() { return <KeysContent />; }
