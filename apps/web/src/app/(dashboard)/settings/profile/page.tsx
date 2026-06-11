import { redirect } from "next/navigation"

import ProfileDashboard from "@/components/(gateway)/settings/profile/ProfileDashboard"
import ProfileShareControls from "@/components/(gateway)/settings/profile/ProfileShareControls"
import { getUserObfuscationPreference } from "@/lib/fetchers/account/getUserObfuscationPreference"
import { getOwnProfileSnapshot } from "@/lib/fetchers/profile/getProfileSnapshot"
import { buildProfileShareCardPayload } from "@/lib/profileShare"

export const metadata = {
	title: "Profile - Settings",
}

export default async function ProfileSettingsPage() {
	const profile = await getOwnProfileSnapshot()

	if (!profile) {
		redirect("/sign-in")
	}

	const obfuscateInfo = await getUserObfuscationPreference(profile.userId)
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
