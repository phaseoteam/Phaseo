import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import PresetFeedbackClient from "./PresetFeedbackClient";

export async function getPresetExperimentsMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.presetFeedback")} - ${t("headers.settings")}` };
}

export default function Page() { return <PresetFeedbackClient />; }
