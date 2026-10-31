import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";
import { Suspense } from "react";
import AutoRoutingContent from "./AutoRoutingContent";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.autoRouting")} - ${t("headers.settings")}` };
}

// The autoRouting flag gate (notFound) runs in the route's beforeLoad.
export default function AutoRoutingSettingsPage() {
	const t = useTranslations("SettingsUI");

	return (
		<div className="space-y-6">
		<SettingsPageHeader
			title="Auto routing"
			titleKey="headers.autoRouting"
			description="Control how phaseo/auto balances model quality, cost, and speed for this workspace."
			descriptionKey="headers.autoRoutingDescription"
				meta={<Badge variant="outline">{t("alphaBadge")}</Badge>}
				actions={
					<ProductFeedbackButton
						surface="settings_auto_routing"
						prompt={t("settingsPageCopy.autoRoutingFeedback")}
					/>
				}
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AutoRoutingContent />
			</Suspense>
		</div>
	);
}
