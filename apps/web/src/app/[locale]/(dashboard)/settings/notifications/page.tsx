import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";

import LowBalanceEmailAlertsClient from "@/components/(gateway)/credits/LowBalanceEmailAlertsClient";
import NotificationDestinationsClient from "@/components/(gateway)/settings/notifications/NotificationDestinationsClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { fetchSettingsCreditsInitialData } from "@/lib/fetchers/internal/fetchSettingsCreditsInitialData";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.notifications")} - ${t("headers.settings")}` };
}

export default function NotificationsPage() {
	return <Suspense fallback={<SettingsSectionFallback />}><NotificationsContent /></Suspense>;
}

async function NotificationsContent() {
	await connection();
	const data = await fetchSettingsCreditsInitialData();
	return (
		<div className="space-y-6">
			<SettingsPageHeader title="Notifications" titleKey="headers.notifications" description="Choose what your workspace hears about and where alerts are delivered." descriptionKey="headers.notificationsDescription" />
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
}
