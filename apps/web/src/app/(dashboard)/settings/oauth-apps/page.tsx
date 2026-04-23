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

const PAGE_SIZE = 5000;

async function loadOAuthAppsWithStats(
	supabase: Awaited<ReturnType<typeof createClient>>,
	workspaceId: string,
): Promise<any[]> {
	const { data: appMetadataRows, error: appError } = await supabase
		.from("oauth_app_metadata")
		.select("*")
		.eq("workspace_id", workspaceId)
		.eq("status", "active")
		.order("created_at", { ascending: false });

	if (appError || !appMetadataRows) return [];
	if (appMetadataRows.length === 0) return [];

	const clientIds = appMetadataRows
		.map((row: any) => String(row?.client_id ?? "").trim())
		.filter(Boolean);
	if (clientIds.length === 0) return appMetadataRows;

	const statsByClientId = new Map<
		string,
		{
			active_authorizations: number;
			total_authorizations: number;
			last_used_at: string | null;
			requests_last_30d: number;
		}
	>();
	for (const clientId of clientIds) {
		statsByClientId.set(clientId, {
			active_authorizations: 0,
			total_authorizations: 0,
			last_used_at: null,
			requests_last_30d: 0,
		});
	}

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("oauth_authorizations")
			.select("client_id, revoked_at, last_used_at")
			.in("client_id", clientIds)
			.order("created_at", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) break;
		if (!Array.isArray(data) || data.length === 0) break;

		for (const row of data) {
			const clientId = String((row as any)?.client_id ?? "").trim();
			if (!clientId) continue;
			const stats = statsByClientId.get(clientId);
			if (!stats) continue;

			stats.total_authorizations += 1;
			if ((row as any)?.revoked_at == null) stats.active_authorizations += 1;
			const lastUsedAt = String((row as any)?.last_used_at ?? "").trim();
			if (lastUsedAt && (!stats.last_used_at || lastUsedAt > stats.last_used_at)) {
				stats.last_used_at = lastUsedAt;
			}
		}

		if (data.length < PAGE_SIZE) break;
	}

	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
	const fromIso = thirtyDaysAgo.toISOString();
	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await supabase
			.from("gateway_requests")
			.select("oauth_client_id")
			.in("oauth_client_id", clientIds)
			.gte("created_at", fromIso)
			.order("created_at", { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) break;
		if (!Array.isArray(data) || data.length === 0) break;

		for (const row of data) {
			const clientId = String((row as any)?.oauth_client_id ?? "").trim();
			if (!clientId) continue;
			const stats = statsByClientId.get(clientId);
			if (!stats) continue;
			stats.requests_last_30d += 1;
		}

		if (data.length < PAGE_SIZE) break;
	}

	return appMetadataRows.map((appRow: any) => {
		const stats = statsByClientId.get(String(appRow?.client_id ?? "").trim());
		return {
			...appRow,
			active_authorizations: stats?.active_authorizations ?? 0,
			total_authorizations: stats?.total_authorizations ?? 0,
			last_used_at: stats?.last_used_at ?? null,
			requests_last_30d: stats?.requests_last_30d ?? 0,
		};
	});
}

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

	const initialWorkspaceId = (await getWorkspaceIdFromCookie()) ?? null;
	const oauthApps = initialWorkspaceId
		? await loadOAuthAppsWithStats(supabase, initialWorkspaceId)
		: [];

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
							currentWorkspaceId={initialWorkspaceId}
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
