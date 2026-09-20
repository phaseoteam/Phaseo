"use client";

import AuthorizedAppsPanel from "@/components/(gateway)/settings/authorized-apps/AuthorizedAppsPanel";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsAuthorizedAppsInitialData } from "@/lib/fetchers/internal/settingsTypes";

export default withSettingsResource("authorized-apps", function AuthorizedAppsContent({ initialData }: { initialData: SettingsAuthorizedAppsInitialData }) {
	return <AuthorizedAppsPanel authorizedApps={initialData.authorizedApps} userId={initialData.userId!} />;
}, false);
