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
		<div className="space-y-5">
			<SettingsPageHeader
				title="Dynamic routing"
				description="Build request flows and attach them to specific API keys."
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
