"use client";

import AppsPanel from "@/components/(gateway)/settings/apps/AppsPanel";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsAppsInitialData } from "@/lib/fetchers/internal/settingsTypes";

export default withSettingsResource("apps", function AppsSettingsContent({ initialData }: { initialData: SettingsAppsInitialData }) {
	return <AppsPanel apps={initialData.apps} />;
});
