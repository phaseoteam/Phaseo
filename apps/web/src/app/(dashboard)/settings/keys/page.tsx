import { Suspense } from "react";
import Link from "next/link";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import CreateKeyDialog from "@/components/(gateway)/settings/keys/CreateKeyDialog";
import KeysPanel from "@/components/(gateway)/settings/keys/KeysPanel";
import { getWorkspaceIdFromCookie } from "@/utils/workspaceCookie";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
import { VERCEL_SECURITY_NOTICE_HREF } from "@/lib/siteNotice";

const QUICKSTART_DOCS_HREF = "https://docs.ai-stats.phaseo.app/v1/quickstart";
const KEYS_SECURITY_NOTICE_STARTS_AT = "2026-04-21T00:00:00.000Z";
const KEYS_SECURITY_NOTICE_ENDS_AT = "2026-04-23T00:00:00.000Z";

export const metadata = {
	title: "API Keys - Settings",
};

function shouldShowSecurityNotice(now: Date = new Date()): boolean {
	const start = Date.parse(KEYS_SECURITY_NOTICE_STARTS_AT);
	const end = Date.parse(KEYS_SECURITY_NOTICE_ENDS_AT);
	const nowTs = now.getTime();
	if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
	return nowTs >= start && nowTs < end;
}

function SecurityNoticeBanner() {
	if (!shouldShowSecurityNotice()) return null;

	return (
		<Alert
			variant="destructive"
			className="border-amber-500 bg-amber-50 dark:bg-amber-950/30"
		>
			<ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
			<AlertTitle className="text-amber-800 dark:text-amber-300">
				Security notice: all API keys were removed
			</AlertTitle>
			<AlertDescription className="text-amber-700 dark:text-amber-400">
				Unfortunately, due to the security incident, we removed all keys. Please
				regenerate any keys you require, and we apologise for the inconvenience.
				This is a protective measure we are actively working to prevent from
				ever being required again, and it should be the only time we ever need
				to do this.{" "}
				<Link
					href={VERCEL_SECURITY_NOTICE_HREF}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1 font-medium underline underline-offset-4"
				>
					Read the full security update
					<ArrowUpRight className="h-3.5 w-3.5" />
				</Link>
			</AlertDescription>
		</Alert>
	);
}

export default function KeysPage() {
	return (
		<div className="space-y-6">
			<SecurityNoticeBanner />
			<Suspense fallback={<SettingsSectionFallback />}>
				<KeysContent />
			</Suspense>
		</div>
	);
}

async function KeysContent() {
	const supabase = await createClient();

	// get current user
	const {
		data: { user },
	} = await supabase.auth.getUser();

	const initialTeamId = await getWorkspaceIdFromCookie();

	// fetch API keys for the active team
	const { data: apiKeys } = await supabase
		.from("keys")
		.select("*")
		.eq("workspace_id", initialTeamId)
		.neq("status", "deleted")
		.neq("name", CHAT_MANAGED_KEY_NAME);

	const usageByKey = new Map<
		string,
		{ requests: number; costNanos: number; lastUsedAt: string | null }
	>();
	if (initialTeamId) {
		const dayStart = new Date();
		dayStart.setUTCHours(0, 0, 0, 0);
		const dayStartIso = dayStart.toISOString();

		const { data: usageRows, error: usageError } = await supabase.rpc(
			"get_workspace_key_usage",
			{
				p_workspace_id: initialTeamId,
				p_day_start: dayStartIso,
			},
		);

		if (usageError) {
			console.error("[settings/keys] failed to load key usage", usageError);
		}

		for (const row of usageRows ?? []) {
			const keyId = typeof row?.key_id === "string" ? row.key_id : null;
			if (!keyId) continue;
			usageByKey.set(keyId, {
				requests: Number(row?.daily_request_count ?? 0) || 0,
				costNanos: Number(row?.daily_cost_nanos ?? 0) || 0,
				lastUsedAt: typeof row?.last_used_at === "string" ? row.last_used_at : null,
			});
		}
	}

	// fetch teams the user belongs to (assumes a `team_users` join table)
	const { data: teamUsers } = await supabase
		.from("workspace_members")
		.select("workspace_id, teams:workspaces(id, name)")
		.eq("user_id", user?.id);

	// build a teams list including a personal/personal-like fallback
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

	const keysArray = (apiKeys ?? []).map((k: any) => {
		const usage = usageByKey.get(k.id) ?? {
			requests: 0,
			costNanos: 0,
			lastUsedAt: null,
		};
		return {
			...k,
			current_usage_daily: usage.requests,
			current_usage_daily_cost_nanos: usage.costNanos,
			last_used_at:
				typeof k?.last_used_at === "string" && k.last_used_at.length > 0
					? k.last_used_at
					: usage.lastUsedAt,
		};
	});

	// find the active team
	const activeTeam = teams.find((t) => t.id === initialTeamId);

	const teamsWithKeys = activeTeam ? [{ ...activeTeam, keys: keysArray }] : [];

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="API Keys"
				description="Create and manage gateway API keys for this workspace."
				actions={
					<div className="flex items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link
								href={QUICKSTART_DOCS_HREF}
								target="_blank"
								rel="noreferrer"
							>
								Quick start
								<ArrowUpRight className="ml-1 h-4 w-4" />
							</Link>
						</Button>
						<CreateKeyDialog
							currentUserId={user?.id}
							currentTeamId={initialTeamId}
							teams={teams}
						/>
					</div>
				}
			/>
			<KeysPanel
				teamsWithKeys={teamsWithKeys}
				initialTeamId={initialTeamId}
				currentUserId={user?.id}
			/>
		</div>
	);
}
