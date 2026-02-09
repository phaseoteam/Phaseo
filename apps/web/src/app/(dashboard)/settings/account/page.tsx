import { Suspense } from "react";
import AccountSettingsClient, {
	UserPayload,
} from "@/components/(gateway)/settings/account/AccountSettingsClient";
import { createClient } from "@/utils/supabase/server";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";

export default function AccountSettingsPage() {
	return (
		<div>
			<header>
				<h1 className="text-2xl font-bold">Account</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Manage your login credentials, security settings, or delete your
					account.
				</p>
			</header>
			<div className="mt-6">
				<Suspense fallback={<SettingsSectionFallback />}>
					<AccountSettingsContent />
				</Suspense>
			</div>
		</div>
	);
}

async function AccountSettingsContent() {
	const supabase = await createClient();

	// get the authenticated user from Supabase auth
	const { data: authData } = await supabase.auth.getUser();
	const authUser = authData.user;

	if (!authUser) {
		// If no user, render a simple message (you may redirect in your app)
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Not signed in.
			</div>
		);
	}

	// Fetch row from public.users by user_id (foreign key to auth.users.id)
	const { data: userRow } = await supabase
		.from("users")
		.select(
			"user_id, display_name, default_team_id, obfuscate_info, created_at"
		)
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

	// Check if user has MFA enabled
	const { data: mfaData } = await supabase.auth.mfa.listFactors();
	const mfaFactor = mfaData?.totp?.find((f) => f.status === "verified");
	const mfaEnabled = !!mfaFactor;
	const mfaFactorId = mfaFactor?.id ?? null;

	// Check if user has password (OAuth users don't)
	// OAuth providers: google, github, gitlab, etc.
	// Email/password users have provider "email" or undefined
	const provider = authUser.app_metadata?.provider;
	const isOAuthUser = provider && provider !== "email";
	const hasPassword = !isOAuthUser;

	// Fetch teams that the user is a member of via team_members -> teams
	const { data: teamMembersData } = await supabase
		.from("team_members")
		.select("team_id, teams(id, name)")
		.eq("user_id", authUser.id);

	// Map to team options expected by the client component
	const teams = (teamMembersData ?? [])
		.map((tm: any) => tm.teams)
		.filter((t: any) => t && t.id && t.name) as {
		id: string;
		name: string;
	}[];

	return (
		<AccountSettingsClient
			user={user}
			teams={teams}
			mfaEnabled={mfaEnabled}
			mfaFactorId={mfaFactorId}
			hasPassword={hasPassword}
		/>
	);
}
