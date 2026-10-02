import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PresetFeedbackClient from "./PresetFeedbackClient";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.presetFeedback")} - ${t("headers.settings")}` };
}

export default function Page() { return <PresetFeedbackClient />; }
