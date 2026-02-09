import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import CreateOAuthAppDialog from "@/components/(gateway)/settings/oauth-apps/CreateOAuthAppDialog";
import OAuthAppsPanel from "@/components/(gateway)/settings/oauth-apps/OAuthAppsPanel";
import { Button } from "@/components/ui/button";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export const metadata = {
	title: "OAuth Apps - Settings",
	description: "Manage your OAuth applications for third-party integrations",
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

			<div className="flex items-center justify-between">
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-2xl font-bold">OAuth Apps</h1>
						<span className="inline-flex items-center rounded-md bg-yellow-100 dark:bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-800 dark:text-yellow-200">
							ALPHA
						</span>
					</div>
					<p className="text-sm text-muted-foreground mt-1">
						Create OAuth applications to enable third-party integrations with
						your AI Stats account
					</p>
				</div>
				<Link
					href="https://docs.ai-stats.phaseo.app/v1/guides/oauth-quickstart"
					target="_blank"
					rel="noopener noreferrer"
				>
					<Button variant="outline" size="sm">
						View Docs
					</Button>
				</Link>
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
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Please sign in to manage OAuth apps.
			</div>
		);
	}

	const initialTeamId = (await getTeamIdFromCookie()) ?? null;

	const { data: oauthApps } = await supabase
		.from("oauth_apps_with_stats")
		.select("*")
		.eq("team_id", initialTeamId)
		.order("created_at", { ascending: false });

	const { data: teamUsers } = await supabase
		.from("team_members")
		.select("team_id, teams(id, name)")
		.eq("user_id", user.id);

	const teams: any[] = [];
	if (teamUsers) {
		for (const tu of teamUsers) {
			if (tu?.teams) {
				const team = Array.isArray(tu.teams) ? tu.teams[0] : tu.teams;
				if (team?.id && team?.name) {
					teams.push({ id: team.id, name: team.name });
				}
			}
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex justify-end">
				<CreateOAuthAppDialog
					currentUserId={user.id}
					currentTeamId={initialTeamId}
					teams={teams}
				/>
			</div>
			<OAuthAppsPanel
				oauthApps={oauthApps ?? []}
				initialTeamId={initialTeamId}
				currentUserId={user.id}
			/>
		</div>
	);
}
