import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import AutoRoutingContent from "./AutoRoutingContent";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { Badge } from "@/components/ui/badge";
import { autoRoutingFlag } from "@/lib/flags";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.autoRouting")} - ${t("headers.settings")}` };
}

export default async function AutoRoutingSettingsPage() {
	const t = await getTranslations("SettingsUI");
	if (!(await autoRoutingFlag())) notFound();

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
