import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import CreateManagementKeyDialog from "@/components/(gateway)/settings/management-api-keys/CreateManagementKeyDialog";
import ManagementKeysPanel from "@/components/(gateway)/settings/management-api-keys/ManagementKeysPanel";
import {
	getActiveWorkspaceIdFromCookieRaw,
	getWorkspaceIdFromCookie,
} from "@/utils/workspaceCookie";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

export const metadata = {
	title: "Management API Keys - Settings",
};

export default function ManagementApiKeysPage(props: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	return (
		<div className="space-y-6">
			<Alert
				variant="destructive"
				className="border-amber-500 bg-amber-50 dark:bg-amber-950/30"
			>
				<ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
				<AlertTitle className="text-amber-800 dark:text-amber-300">
					Keep these keys extra secure
				</AlertTitle>
				<AlertDescription className="text-amber-700 dark:text-amber-400">
					Management API keys grant higher privileges to your account. They can
					create resources, manage teams, and access sensitive data. Never share
					these keys and rotate them immediately if compromised.
				</AlertDescription>
			</Alert>

			<Suspense fallback={<SettingsSectionFallback />}>
				<ManagementApiKeysContent searchParams={props.searchParams} />
			</Suspense>
		</div>
	);
}

async function ManagementApiKeysContent({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const supabase = await createClient();
	let adminClient: ReturnType<typeof createAdminClient> | null = null;
	try {
		adminClient = createAdminClient();
	} catch {
		adminClient = null;
	}
	const readClient: any = adminClient ?? supabase;

	const {
		data: { user },
	} = await supabase.auth.getUser();

	const { data: managementKeys } = await supabase
		.from("management_keys")
		.select("*");

	const { data: teamUsers } = await supabase
		.from("workspace_members")
		.select("workspace_id, teams:workspaces(id, name)")
		.eq("user_id", user?.id);

	let membershipWorkspaceIds: string[] = [];
	let ownedWorkspaceIds: string[] = [];
	if (user?.id) {
		const { data: membershipRows } = await readClient
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", user.id);
		membershipWorkspaceIds = Array.from(
			new Set(
				(membershipRows ?? [])
					.map((row: any) => String(row?.workspace_id ?? "").trim())
					.filter(Boolean),
			),
		);

		const { data: ownedRows } = await readClient
			.from("workspaces")
			.select("id")
			.eq("owner_user_id", user.id);
		ownedWorkspaceIds = Array.from(
			new Set(
				(ownedRows ?? [])
					.map((row: any) => String(row?.id ?? "").trim())
					.filter(Boolean),
			),
		);
	}
	const accessibleWorkspaceIds = Array.from(
		new Set([...membershipWorkspaceIds, ...ownedWorkspaceIds]),
	);

	const sp = await searchParams;
	const preferredWorkspaceId =
		typeof sp?.workspace_id === "string"
			? sp.workspace_id
			: Array.isArray(sp?.workspace_id)
				? sp?.workspace_id?.[0]
				: undefined;
	const rawCookieWorkspaceId = await getActiveWorkspaceIdFromCookieRaw();
	const resolvedWorkspaceId = await getWorkspaceIdFromCookie();

	const teams: Array<{ id: string; name: string }> = [];
	const seenTeamIds = new Set<string>();

	if (teamUsers) {
		for (const tu of teamUsers) {
			if (tu?.teams) {
				const team = Array.isArray(tu.teams) ? tu.teams[0] : tu.teams;
				const teamId = String(team?.id ?? "").trim();
				const teamName = String(team?.name ?? "").trim();
				if (!teamId || !teamName || seenTeamIds.has(teamId)) continue;
				seenTeamIds.add(teamId);
				teams.push({ id: teamId, name: teamName });
			}
		}
	}

	if (accessibleWorkspaceIds.length) {
		const { data: scopedTeams } = await readClient
			.from("workspaces")
			.select("id, name")
			.in("id", accessibleWorkspaceIds);
		for (const team of scopedTeams ?? []) {
			const teamId = String(team?.id ?? "").trim();
			const teamName = String(team?.name ?? "").trim();
			if (!teamId || !teamName || seenTeamIds.has(teamId)) continue;
			seenTeamIds.add(teamId);
			teams.push({ id: teamId, name: teamName });
		}
	}

	const initialTeamCandidate =
		String(preferredWorkspaceId ?? "").trim() ||
		String(rawCookieWorkspaceId ?? "").trim() ||
		String(resolvedWorkspaceId ?? "").trim() ||
		"";
	const initialTeamId =
		(initialTeamCandidate && teams.some((team) => team.id === initialTeamCandidate)
			? initialTeamCandidate
			: initialTeamCandidate || teams[0]?.id) ?? null;

	const keysArray = (managementKeys ?? []).map((k: any) => ({ ...k }));

	const teamsWithKeys = teams.map((t) => ({
		...t,
		keys: keysArray.filter(
			(k: any) => (k.workspace_id ?? null) === (t.id ?? null)
		),
	}));

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Management API Keys"
				meta={<Badge variant="outline">Beta</Badge>}
				description="Manage elevated keys for automated workspace and key management."
				actions={
					<CreateManagementKeyDialog
						currentUserId={user?.id}
						currentTeamId={initialTeamId}
						teams={teams}
					/>
				}
			/>
			<ManagementKeysPanel
				teamsWithKeys={teamsWithKeys}
				initialTeamId={initialTeamId}
				currentUserId={user?.id}
			/>
		</div>
	);
}

