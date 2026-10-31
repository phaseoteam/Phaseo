import { getTranslations } from "@/i18n/server";
import ClassifiersContent from "./ClassifiersContent";

export async function getClassifiersMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageMetadata.classifiers")} - ${t("headers.settings")}` };
}

export default function ClassifiersPage() { return <ClassifiersContent />; }
