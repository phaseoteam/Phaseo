import { Suspense } from "react";
import AuthorizedAppsContent from "./AuthorizedAppsContent";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

export const metadata = {
	title: "OAuth Integrations - Settings",
	description:
		"Manage third-party applications you have authorized to access your Phaseo account, review granted scopes, and revoke access when it is no longer needed.",
};

export default function AuthorizedAppsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="OAuth Integrations"
				meta={
					<span className="inline-flex items-center rounded-md bg-yellow-100 dark:bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-800 dark:text-yellow-200">
						ALPHA
					</span>
				}
				description="Manage third-party applications that have access to your Phaseo account. You can revoke access at any time."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AuthorizedAppsContent />
			</Suspense>
		</div>
	);
}
