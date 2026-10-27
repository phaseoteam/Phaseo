"use client";
import { useTranslations } from "next-intl";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import TrustedWorkloadsSettingsClient from "@/components/(gateway)/settings/trusted-workloads/TrustedWorkloadsSettingsClient";
import type { SettingsWorkloadIdentityInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { Badge } from "@/components/ui/badge";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";

export default withSettingsResource("trusted-workloads", function TrustedWorkloadsContent({ initialData }: { initialData: SettingsWorkloadIdentityInitialData }) {
	const t = useTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("trustedWorkloads.title")}
				description={t("trustedWorkloads.description")}
				meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
				actions={<ProductFeedbackButton surface="settings_trusted_workloads" prompt={t("trustedWorkloads.feedback")} />}
			/>
			<TrustedWorkloadsSettingsClient data={initialData} />
		</div>
	);
});
