"use client";
import { useTranslations } from "next-intl";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import RateLimitsSettingsClient from "@/components/(gateway)/settings/rate-limits/RateLimitsSettingsClient";
import type { SettingsRateLimitsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { Badge } from "@/components/ui/badge";
import { ProductFeedbackButton } from "@/components/feedback/ProductFeedbackButton";

export default withSettingsResource("rate-limits", function RateLimitsContent({ initialData }: { initialData: SettingsRateLimitsInitialData }) {
	const t = useTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("rateLimitPolicies.title")}
				description={t("rateLimitPolicies.description")}
				meta={<Badge variant="outline">{t("settingsPageCopy.beta")}</Badge>}
				actions={<ProductFeedbackButton surface="settings_rate_limits" prompt={t("rateLimitPolicies.feedback")} />}
			/>
			<RateLimitsSettingsClient data={initialData} />
		</div>
	);
});
