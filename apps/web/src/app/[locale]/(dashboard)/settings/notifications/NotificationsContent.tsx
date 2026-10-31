"use client";
import { useTranslations } from "@/i18n/react";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";

import LowBalanceEmailAlertsClient from "@/components/(gateway)/credits/LowBalanceEmailAlertsClient";
import NotificationDestinationsClient from "@/components/(gateway)/settings/notifications/NotificationDestinationsClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SpendAlertsSection from "@/components/(gateway)/settings/spend-rules/SpendAlertsSection";
export default withSettingsResource("notifications", function NotificationsContent({ initialData: data }) {
	const t = useTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<SettingsPageHeader title={t("headers.notifications")} description={t("headers.notificationsDescription")} />
			<LowBalanceEmailAlertsClient
				autoTopUpFailureEmailEnabled={data.autoTopUpFailureEmailEnabled}
				enabled={data.lowBalanceEmailEnabled}
				paymentMethodExpiringEmailEnabled={data.paymentMethodExpiringEmailEnabled}
				thresholdUsd={data.lowBalanceEmailThresholdUsd}
				destinations={data.notificationDestinations}
				notificationRoutes={data.notificationRoutes}
			/>
			<SpendAlertsSection
				destinations={data.notificationDestinations}
				departmentSpendAttribution={data.departmentSpendAttribution === "primary" ? "primary" : "all"}
			/>
			<NotificationDestinationsClient
				initialDestinations={data.notificationDestinations}
				initialModelDeprecationEnabled={data.modelDeprecationAlertsEnabled}
				initialModelDeprecationIncludeAdmins={data.modelDeprecationAlertsIncludeAdmins}
				initialNotificationRoutes={data.notificationRoutes}
			/>
		</div>
	);
});
