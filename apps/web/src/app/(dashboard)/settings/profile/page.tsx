import { redirect } from "next/navigation"

import ProfileDashboard from "@/components/(gateway)/settings/profile/ProfileDashboard"
import ProfileShareControls from "@/components/(gateway)/settings/profile/ProfileShareControls"
import { fetchSettingsProfileInitialData } from "@/lib/fetchers/internal/fetchSettingsProfileInitialData"
import { buildProfileShareCardPayload } from "@/lib/profileShare"

export const metadata = {
	title: "Profile - Settings",
}

export default async function ProfileSettingsPage() {
	const { profile, obfuscateInfo } = await fetchSettingsProfileInitialData()

	if (!profile) {
		redirect("/sign-in")
	}

	const sharePayload = buildProfileShareCardPayload(profile)

	return (
		<div
			className="space-y-6"
			data-obfuscate-pii={obfuscateInfo ? "true" : "false"}
			data-obfuscation-sync="true"
		>
			<ProfileDashboard
				profile={profile}
				actions={<ProfileShareControls payload={sharePayload} />}
			/>
		</div>
	)
}
