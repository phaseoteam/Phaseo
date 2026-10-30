import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ActivityContent from "./ActivityContent";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.workspaceActivity");
	return {
		title: t("metadataTitle"),
		robots: { index: false, follow: false },
	};
}

export default function WorkspaceActivityPage() {
	return <ActivityContent />;
}
