import { getTranslations } from "next-intl/server";
import ClassifierEditorPage from "@/components/(gateway)/settings/classifiers/ClassifierEditorPage";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("classifier") };
}

export default async function ClassifierDetailPage({ params }: { params: Promise<{ classifierId: string }> }) {
	const { classifierId } = await params;
	return <ClassifierEditorPage mode="edit" classifierId={classifierId} />;
}
