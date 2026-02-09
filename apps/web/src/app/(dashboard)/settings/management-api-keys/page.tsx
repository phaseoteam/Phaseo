import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import CreateProvisioningKeyDialog from "@/components/(gateway)/settings/provisioning-keys/CreateProvisioningKeyDialog";
import ProvisioningKeysPanel from "@/components/(gateway)/settings/provisioning-keys/ProvisioningKeysPanel";
import { getTeamIdFromCookie } from "@/utils/teamCookie";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export const metadata = {
	title: "Management API Keys - Settings",
};

export default function ManagementApiKeysPage() {
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

			<div>
				<div className="flex items-center gap-2">
					<h1 className="text-2xl font-bold">Management API Keys</h1>
					<Badge variant="outline">Beta</Badge>
				</div>
				<p className="text-sm text-muted-foreground mt-1">
					Manage elevated keys for automated team and key management
				</p>
			</div>
			<Suspense fallback={<SettingsSectionFallback />}>
				<ManagementApiKeysContent />
			</Suspense>
		</div>
	);
}

async function ManagementApiKeysContent() {
	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();

	const { data: provisioningKeys } = await supabase
		.from("provisioning_keys")
		.select("*");

	const { data: teamUsers } = await supabase
		.from("team_members")
		.select("team_id, teams(id, name)")
		.eq("user_id", user?.id);

	const initialTeamId = await getTeamIdFromCookie();

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

	const keysArray = (provisioningKeys ?? []).map((k: any) => ({ ...k }));

	const teamsWithKeys = teams.map((t) => ({
		...t,
		keys: keysArray.filter(
			(k: any) => (k.team_id ?? null) === (t.id ?? null)
		),
	}));

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-end">
				<CreateProvisioningKeyDialog
					currentUserId={user?.id}
					currentTeamId={initialTeamId}
					teams={teams}
				/>
			</div>
			<ProvisioningKeysPanel
				teamsWithKeys={teamsWithKeys}
				initialTeamId={initialTeamId}
				currentUserId={user?.id}
			/>
		</div>
	);
}
