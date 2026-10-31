import { getTranslations } from "@/i18n/server";
import ClassifierEditorPage from "@/components/(gateway)/settings/classifiers/ClassifierEditorPage";

export async function getNewClassifierMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("newClassifier") };
}

export default function NewClassifierPage() {
	return <ClassifierEditorPage mode="create" />;
}
