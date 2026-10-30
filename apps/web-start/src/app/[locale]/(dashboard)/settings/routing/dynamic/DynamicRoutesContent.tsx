"use client";

import DynamicRoutesStudio from "@/components/(gateway)/settings/routing/DynamicRoutesStudio";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsDynamicRoutesInitialData } from "@/lib/fetchers/internal/settingsTypes";

export default withSettingsResource("dynamic-routes", function DynamicRoutesContent({ initialData }: { initialData: SettingsDynamicRoutesInitialData }) {
	return <DynamicRoutesStudio initialData={initialData} />;
});
