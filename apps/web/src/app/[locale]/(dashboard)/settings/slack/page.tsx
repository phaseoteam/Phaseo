import { getTranslations } from "next-intl/server";
import SlackContent from "./SlackContent";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("slack.title")} - ${t("headers.settings")}` };
}

export default function SlackSettingsPage() { return <SlackContent />; }
