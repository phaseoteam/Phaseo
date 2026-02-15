import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import AccountSettingsClient, {
	UserPayload,
} from "@/components/(gateway)/settings/account/AccountSettingsClient";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";

export default function AccountDetailsPage() {
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Account"
				description="Profile and login settings."
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AccountDetailsContent />
			</Suspense>
		</div>
	);
}

async function AccountDetailsContent() {
	const supabase = await createClient();
	const { data: authData } = await supabase.auth.getUser();
	const authUser = authData.user;

	if (!authUser) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Not signed in.
			</div>
		);
	}

	const { data: userRow } = await supabase
		.from("users")
		.select("user_id, display_name, default_team_id, obfuscate_info, created_at")
		.eq("user_id", authUser.id)
		.maybeSingle();

	const user: UserPayload = {
		id: authUser.id,
		displayName: userRow?.display_name,
		email: authUser.email ?? null,
		defaultTeamId: userRow?.default_team_id ?? null,
		obfuscateInfo: userRow?.obfuscate_info ?? false,
		createdAt: userRow?.created_at,
	};

	const provider = authUser.app_metadata?.provider;
	const isOAuthUser = provider && provider !== "email";
	const hasPassword = !isOAuthUser;

	const { data: teamMembersData } = await supabase
		.from("team_members")
		.select("team_id, teams(id, name)")
		.eq("user_id", authUser.id);

	const teams = (teamMembersData ?? [])
		.map((tm: any) => tm.teams)
		.filter((t: any) => t && t.id && t.name) as { id: string; name: string }[];

	return <AccountSettingsClient user={user} teams={teams} hasPassword={hasPassword} />;
}

