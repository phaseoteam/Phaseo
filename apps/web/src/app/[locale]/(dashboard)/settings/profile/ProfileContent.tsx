"use client";
import { withSettingsResource } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import { redirect } from "next/navigation"
import { useLocale } from "next-intl";
import { getProfileMessages } from "@/i18n/profile";
import type { PublicLocale } from "@/i18n/routing";
import { localizeAuthPath } from "@/lib/auth/localized-paths";

import ProfileDashboard from "@/components/(gateway)/settings/profile/ProfileDashboard"
import { ProfileGames } from "@/components/(gateway)/settings/profile/ProfileGames"
export default withSettingsResource("profile", function ProfileSettingsPage({ initialData: { profile: profileIdentity, obfuscateInfo, usage, games, gamesEnabled } }) {
	const locale = useLocale() as PublicLocale;
	const labels = getProfileMessages(locale);

	if (!profileIdentity) {
		redirect(localizeAuthPath(locale, "/sign-in"))
	}
	const profile = usage ? { ...profileIdentity, ...usage } : profileIdentity

	return (
		<div
			className="space-y-6"
			data-obfuscate-pii={obfuscateInfo ? "true" : "false"}
			data-obfuscation-sync="true"
		>
			<ProfileDashboard profile={profile} locale={locale} labels={labels} />
			{gamesEnabled ? <ProfileGames summary={games} /> : null}
		</div>
	)
}, false);
