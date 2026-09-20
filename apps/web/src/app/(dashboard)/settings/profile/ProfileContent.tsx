"use client";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import { redirect } from "next/navigation"

import ProfileDashboard from "@/components/(gateway)/settings/profile/ProfileDashboard"
import { ProfileGames } from "@/components/(gateway)/settings/profile/ProfileGames"
export default withSettingsResource("profile", function ProfileSettingsPage({ initialData: { profile: profileIdentity, obfuscateInfo, usage, games, gamesEnabled } }) {

	if (!profileIdentity) {
		redirect("/sign-in")
	}
	const profile = usage ? { ...profileIdentity, ...usage } : profileIdentity

	return (
		<div
			className="space-y-6"
			data-obfuscate-pii={obfuscateInfo ? "true" : "false"}
			data-obfuscation-sync="true"
		>
			<ProfileDashboard profile={profile} />
			{gamesEnabled ? <ProfileGames summary={games} /> : null}
		</div>
	)
}, false);
