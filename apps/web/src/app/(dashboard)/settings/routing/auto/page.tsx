import { Suspense } from "react";
import { notFound } from "next/navigation";
import AutoRoutingContent from "./AutoRoutingContent";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";
import { Badge } from "@/components/ui/badge";
import { autoRoutingFlag } from "@/lib/flags";

export const metadata = {
	title: "Auto Routing - Settings",
};

export default async function AutoRoutingSettingsPage() {
	if (!(await autoRoutingFlag())) notFound();

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Auto routing"
				description="Control how phaseo/auto balances model quality, cost, and speed for this workspace."
				meta={<Badge variant="outline">Alpha</Badge>}
				actions={
					<ProductFeedbackButton
						surface="settings_auto_routing"
						prompt="Tell us what is missing or confusing about Auto Routing."
					/>
				}
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AutoRoutingContent />
			</Suspense>
		</div>
	);
}
