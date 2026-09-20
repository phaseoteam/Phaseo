"use client";

import Link from "next/link";
import CreateOAuthAppDialog from "@/components/(gateway)/settings/oauth-apps/CreateOAuthAppDialog";
import OAuthAppsPanel from "@/components/(gateway)/settings/oauth-apps/OAuthAppsPanel";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { UserRoundX } from "lucide-react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsOAuthAppsInitialData } from "@/lib/fetchers/internal/settingsTypes";

export default withSettingsResource("oauth-apps", OAuthAppsView);

function OAuthAppsView({ initialData }: { initialData: SettingsOAuthAppsInitialData }) {
	if (!initialData.signedIn) {
		return (
			<Empty className="rounded-xl border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<UserRoundX className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>Please sign in</EmptyTitle>
					<EmptyDescription>
						Sign in to create and manage OAuth apps.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="OAuth Apps"
				meta={
					<span className="inline-flex items-center rounded-md bg-yellow-100 dark:bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-800 dark:text-yellow-200">
						ALPHA
					</span>
				}
				description="Create OAuth applications to enable third-party integrations with your Phaseo account."
				actions={
					<>
						<Link
							href="https://phaseo.app/docs/v1/guides/oauth-quickstart"
							target="_blank"
							rel="noopener noreferrer"
						>
							<Button variant="outline" size="sm">
								View Docs
							</Button>
						</Link>
						<CreateOAuthAppDialog
							currentTeamId={initialData.initialTeamId}
						/>
					</>
				}
			/>
			<OAuthAppsPanel
				oauthApps={initialData.oauthApps}
			/>
		</div>
	);
}
