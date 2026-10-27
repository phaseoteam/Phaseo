import { getTranslations } from "next-intl/server";
import ClassifiersContent from "./ClassifiersContent";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageMetadata.classifiers")} - ${t("headers.settings")}` };
}

export default function ClassifiersPage() { return <ClassifiersContent />; }
