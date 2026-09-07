import { Suspense } from "react";
import DynamicRoutesStudio from "@/components/(gateway)/settings/routing/DynamicRoutesStudio";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { fetchSettingsDynamicRoutesInitialData } from "@/lib/fetchers/internal/fetchSettingsDynamicRoutesInitialData";

export const metadata = {
	title: "Dynamic Routing - Settings",
};

export default function DynamicRoutingSettingsPage() {
	return (
		<div className="flex flex-col gap-3 lg:h-[calc(100dvh-var(--site-header-height,3.75rem)-var(--site-notice-height,0px)-2.5rem)] lg:min-h-[420px]">
			<SettingsPageHeader
				title="Dynamic routing"
				actions={
					<ProductFeedbackButton
						surface="settings_dynamic_routes"
						prompt="Tell us what is missing or confusing about Dynamic Routes."
					/>
				}
			/>
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
