import { Suspense } from "react";
import { redirect } from "next/navigation";
import AuthorizedAppsPanel from "@/components/(gateway)/settings/authorized-apps/AuthorizedAppsPanel";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { fetchSettingsAuthorizedAppsInitialData } from "@/lib/fetchers/internal/fetchSettingsAuthorizedAppsInitialData";

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

async function AuthorizedAppsContent() {
	const initialData = await fetchSettingsAuthorizedAppsInitialData();

	if (!initialData.signedIn || !initialData.userId) {
		redirect("/sign-in");
	}

	return (
		<AuthorizedAppsPanel
			authorizedApps={initialData.authorizedApps}
			userId={initialData.userId}
		/>
	);
}
