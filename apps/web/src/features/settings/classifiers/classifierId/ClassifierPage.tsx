import { useParams } from "@tanstack/react-router";
import { getTranslations } from "@/i18n/server";
import ClassifierEditorPage from "@/components/(gateway)/settings/classifiers/ClassifierEditorPage";

export async function getClassifierMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("classifier") };
}

export default function ClassifierDetailPage() {
	const { classifierId } = useParams({ from: "/{-$locale}/_dashboard/settings/classifiers/$classifierId/" });
	return <ClassifierEditorPage mode="edit" classifierId={classifierId} />;
}
