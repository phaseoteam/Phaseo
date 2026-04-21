import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import DeprecationWarnings from "@/components/(gateway)/usage/DeprecationWarnings/DeprecationWarnings";
import { getDeprecationWarningsForTeam } from "@/lib/fetchers/usage/deprecationWarnings";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

export const metadata: Metadata = {
	title: "Lifecycle Alerts - Settings",
};

export default function Page() {
	return (
		<Suspense fallback={<SettingsSectionFallback />}>
			<UsageAlertsContent />
		</Suspense>
	);
}

async function UsageAlertsContent() {
	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) redirect("/sign-in");

	const workspaceId = await getWorkspaceIdFromCookie();
	if (!workspaceId) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Alerts</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						You need to be signed in and have a team selected to view alerts.
					</p>
				</CardContent>
			</Card>
		);
	}

	const warnings = await getDeprecationWarningsForTeam(workspaceId);

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Lifecycle Alerts"
				description="Models you used recently that are deprecated or retired, and what to swap to."
			/>

			{warnings.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle>No lifecycle alerts</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							You have no upcoming deprecations or recent retirements for models used by this workspace.
						</p>
					</CardContent>
				</Card>
			) : (
				<DeprecationWarnings warnings={warnings} showHeader={false} />
			)}
		</div>
	);
}
