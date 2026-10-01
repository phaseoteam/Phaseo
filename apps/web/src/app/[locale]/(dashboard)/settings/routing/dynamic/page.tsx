import { Suspense } from "react";
import DynamicRoutesStudio from "@/components/(gateway)/settings/routing/DynamicRoutesStudio";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { fetchSettingsDynamicRoutesInitialData } from "@/lib/fetchers/internal/fetchSettingsDynamicRoutesInitialData";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI.settingsPageMetadata");
	return { title: t("dynamicRouting") };
}

export default async function DynamicRoutingSettingsPage() {
	const t = await getTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<header className="space-y-2">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h1 className="text-2xl font-bold">{t("headers.dynamicRouting")}</h1>
					<ProductFeedbackButton
						surface="settings_dynamic_routes"
						prompt={t("headers.feedbackDynamicRoutesPrompt")}
					/>
				</div>
				<p className="mt-2 text-sm text-muted-foreground">{t("headers.dynamicRoutingDescription")}</p>
			</header>
			<Suspense fallback={<SettingsSectionFallback />}>
				<DynamicRoutesContent />
			</Suspense>
		</div>
	);
}

async function DynamicRoutesContent() {
	const initialData = await fetchSettingsDynamicRoutesInitialData();
	return <DynamicRoutesStudio initialData={initialData} />;
}
