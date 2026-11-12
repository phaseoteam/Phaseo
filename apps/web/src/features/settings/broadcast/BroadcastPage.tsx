import { useTranslations } from "@/i18n/react";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import BroadcastSettingsContent from "./BroadcastContent";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { getTranslations } from "@/i18n/server";

export async function getBroadcastMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("broadcast") };
}

export default function BroadcastSettingsPage() {
	const t = useTranslations("SettingsUI");
	return (
		<main className="min-w-0 space-y-8">
			<SettingsPageHeader title={t("headers.broadcast")} actions={<ProductFeedbackButton
						surface="settings_broadcast"
						prompt={t("headers.feedbackBroadcastPrompt")}
						/>} />
			<Suspense fallback={<SettingsSectionFallback />}>
				<BroadcastSettingsContent />
			</Suspense>
		</main>
	);
}
