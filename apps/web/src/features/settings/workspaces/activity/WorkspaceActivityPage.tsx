import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import ActivityContent from "./ActivityContent";

export async function getWorkspaceActivityMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI.workspaceActivity");
	return {
		title: t("metadataTitle"),
		robots: { index: false, follow: false },
	};
}

export default function WorkspaceActivityPage() {
	return <ActivityContent />;
}
