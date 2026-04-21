import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import CreateOAuthAppDialog from "@/components/(gateway)/settings/oauth-apps/CreateOAuthAppDialog";
import OAuthAppsPanel from "@/components/(gateway)/settings/oauth-apps/OAuthAppsPanel";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { UserRoundX } from "lucide-react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

export const metadata = {
	title: "OAuth Apps - Settings",
	description:
		"Manage your OAuth applications for third-party integrations, configure callback URLs and scopes, and control credentials used by external clients.",
};

export default function OAuthAppsPage() {
	return (
		<div className="space-y-6">
			<div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950 p-4">
				<div className="flex items-start gap-3">
					<div className="flex-shrink-0">
						<span className="inline-flex items-center rounded-md bg-yellow-100 dark:bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-800 dark:text-yellow-200">
							ALPHA
						</span>
					</div>
					<div className="flex-1">
						<h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
							OAuth 2.1 Integration (Alpha)
						</h3>
						<p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
							This feature is in alpha testing. Please report any issues or
							feedback{" "}
							<a
								href="https://github.com/AI-Stats/AI-Stats/issues/new/choose"
								target="_blank"
								rel="noopener noreferrer"
								className="underline hover:no-underline"
							>
								here
							</a>{" "}
							to help us improve.
						</p>
						<ul className="text-xs text-yellow-700 dark:text-yellow-300 mt-2 space-y-1 list-disc list-inside">
							<li>Test thoroughly before using in production</li>
							<li>API and UI may change without notice</li>
							<li>Not recommended for critical integrations yet</li>
						</ul>
					</div>
				</div>
			</div>

			<Suspense fallback={<SettingsSectionFallback />}>
				<OAuthAppsContent />
			</Suspense>
		</div>
	);
}

async function OAuthAppsContent() {
	const supabase = await createClient();

	// Get current user
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
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

	const initialTeamId = (await getWorkspaceIdFromCookie()) ?? null;

	const { data: oauthApps } = await supabase
		.from("oauth_apps_with_stats")
		.select("*")
		.eq("workspace_id", initialTeamId)
		.order("created_at", { ascending: false });

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="OAuth Apps"
				meta={
					<span className="inline-flex items-center rounded-md bg-yellow-100 dark:bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-800 dark:text-yellow-200">
						ALPHA
					</span>
				}
				description="Create OAuth applications to enable third-party integrations with your AI Stats account."
				actions={
					<>
						<Link
							href="https://docs.ai-stats.phaseo.app/v1/guides/oauth-quickstart"
							target="_blank"
							rel="noopener noreferrer"
						>
							<Button variant="outline" size="sm">
								View Docs
							</Button>
						</Link>
						<CreateOAuthAppDialog
							currentTeamId={initialTeamId}
						/>
					</>
				}
			/>
			<OAuthAppsPanel
				oauthApps={oauthApps ?? []}
			/>
		</div>
	);
}
