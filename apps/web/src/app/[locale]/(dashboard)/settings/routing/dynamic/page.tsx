import { useTranslations } from "@/i18n/react";
import { Suspense } from "react";
import DynamicRoutesContent from "./DynamicRoutesContent";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { getTranslations } from "@/i18n/server";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("dynamicRouting") };
}

export default function DynamicRoutingSettingsPage() {
	const t = useTranslations("SettingsUI");
	return (
		<div className="flex flex-col gap-3 lg:h-[calc(100dvh-var(--site-header-height,3.75rem)-var(--site-notice-height,0px)-2.5rem)] lg:min-h-[420px]">
			<SettingsPageHeader
				title={t("headers.dynamicRouting")}
				actions={
					<ProductFeedbackButton
						surface="settings_dynamic_routes"
						prompt={t("headers.feedbackDynamicRoutesPrompt")}
					/>
				}
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<DynamicRoutesContent />
			</Suspense>
		</div>
	);
}
