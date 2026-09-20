"use client";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";

import LowBalanceEmailAlertsClient from "@/components/(gateway)/credits/LowBalanceEmailAlertsClient";
import NotificationDestinationsClient from "@/components/(gateway)/settings/notifications/NotificationDestinationsClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
export default withSettingsResource("notifications", function NotificationsContent({ initialData: data }) {
	return (
		<div className="space-y-6">
			<SettingsPageHeader title="Notifications" description="Choose what your workspace hears about and where alerts are delivered." />
			<LowBalanceEmailAlertsClient
				autoTopUpFailureEmailEnabled={data.autoTopUpFailureEmailEnabled}
				enabled={data.lowBalanceEmailEnabled}
				paymentMethodExpiringEmailEnabled={data.paymentMethodExpiringEmailEnabled}
				thresholdUsd={data.lowBalanceEmailThresholdUsd}
				destinations={data.notificationDestinations}
				notificationRoutes={data.notificationRoutes}
			/>
			<NotificationDestinationsClient
				initialDestinations={data.notificationDestinations}
				initialModelDeprecationEnabled={data.modelDeprecationAlertsEnabled}
				initialNotificationRoutes={data.notificationRoutes}
			/>
		</div>
	);
});
