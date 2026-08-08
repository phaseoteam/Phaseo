import { redirect } from "next/navigation"

import ProfileDashboard from "@/components/(gateway)/settings/profile/ProfileDashboard"
import { ProfileGames } from "@/components/(gateway)/settings/profile/ProfileGames"
import { fetchSettingsProfileGames } from "@/lib/fetchers/internal/fetchSettingsProfileGames"
import { fetchSettingsProfileInitialData } from "@/lib/fetchers/internal/fetchSettingsProfileInitialData"
import { fetchSettingsProfileUsageSummary } from "@/lib/fetchers/internal/fetchSettingsProfileUsageSummary"
import { catalogueGamesEnabled } from "@/lib/games/preview"

export const metadata = {
	title: "Profile - Settings",
}

export default async function ProfileSettingsPage() {
	const gamesEnabled = await catalogueGamesEnabled()
	const [{ profile: profileIdentity, obfuscateInfo }, { usage }, { games }] = await Promise.all([
		fetchSettingsProfileInitialData(),
		fetchSettingsProfileUsageSummary(),
		gamesEnabled ? fetchSettingsProfileGames() : Promise.resolve({ games: null }),
	])

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
}
