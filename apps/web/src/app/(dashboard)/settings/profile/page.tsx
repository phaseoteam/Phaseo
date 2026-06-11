import { redirect } from "next/navigation"

import ProfileDashboard from "@/components/(gateway)/settings/profile/ProfileDashboard"
import ProfileShareControls from "@/components/(gateway)/settings/profile/ProfileShareControls"
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader"
import { fetchSettingsProfileInitialData } from "@/lib/fetchers/internal/fetchSettingsProfileInitialData"
import { buildProfileShareCardPayload } from "@/lib/profileShare"

export const metadata = {
	title: "Profile - Settings",
}

export default async function ProfileSettingsPage() {
	const initialData = await fetchSettingsProfileInitialData()
	const profile = initialData.profile

	if (!profile) {
		redirect("/sign-in")
	}

	const sharePayload = buildProfileShareCardPayload(profile)

	return (
		<div
			className="space-y-6"
			data-obfuscate-pii={initialData.obfuscateInfo ? "true" : "false"}
			data-obfuscation-sync="true"
		>
			<SettingsPageHeader
				title="Profile"
				description="Create a share card from your personal workspace activity."
				actions={
					<ProfileShareControls payload={sharePayload} />
				}
			/>
			<ProfileDashboard profile={profile} />
		</div>
	)
}
