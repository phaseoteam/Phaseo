import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import BroadcastSettingsContent from "./BroadcastContent";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("broadcast") };
}

export default async function BroadcastSettingsPage() {
	const t = await getTranslations("SettingsUI");
	return (
		<main className="space-y-6">
			<section className="space-y-2">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
						{t("headers.broadcast")}
					</h1>
					<ProductFeedbackButton
						surface="settings_broadcast"
						prompt={t("headers.feedbackBroadcastPrompt")}
					/>
				</div>
			</section>
			<Suspense fallback={<SettingsSectionFallback />}>
				<BroadcastSettingsContent />
			</Suspense>
		</main>
	);
}
