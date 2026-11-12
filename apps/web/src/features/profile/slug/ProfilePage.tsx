import { Suspense } from "react"
import { useParams } from "@tanstack/react-router"
import type { PageMetadata } from "@/lib/seo/metadataTypes"
import { notFound } from "@/lib/navigation"
import { useSuspenseQuery } from "@tanstack/react-query"

import ProfileDashboard from "@/components/(gateway)/settings/profile/ProfileDashboard"
import { publicProfileQuery } from "./page.queries"
import { getProfileMessages } from "@/i18n/profile"
import { isPublicLocale, type PublicLocale } from "@/i18n/routing"
import { useLocale, useTranslations } from "@/i18n/react"
import { getTranslations } from "@/i18n/server"

export async function getProfileMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Site.profile")
	return {
		title: t("title"),
		robots: { index: false, follow: false },
	}
}

function PublicProfileShell({
	children,
}: {
	children: React.ReactNode
}) {
	const t = useTranslations("Site.profile");
	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.08),transparent_28%),linear-gradient(180deg,#fcfcfd_0%,#f7f7fb_100%)] px-4 py-8 sm:px-6 lg:px-10">
			<div className="mx-auto max-w-7xl space-y-6">
				<div className="flex items-center justify-between gap-4">
					<div>
						<p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-400">
							Phaseo
						</p>
						<h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
							{t("title")}
						</h1>
					</div>
				</div>

				{children}
			</div>
		</div>
	)
}

// Unknown or private profiles 404 in the route loader before rendering.
function PublicProfileContent() {
	const locale = useLocale()
	const { slug } = useParams({ from: "/{-$locale}/profile/$slug/" })
	const { data: profile } = useSuspenseQuery(publicProfileQuery(slug))

	if (!profile || !profile.publicProfileEnabled) {
		notFound()
	}
	const publicLocale = (isPublicLocale(locale) ? locale : "en-GB") as PublicLocale
	const profileMessages = getProfileMessages(publicLocale)

	return (
		<PublicProfileShell>
			<ProfileDashboard profile={profile} locale={publicLocale} labels={profileMessages} publicView />
		</PublicProfileShell>
	)
}

function PublicProfileFallback() {
	const t = useTranslations("Site.profile");
	return (
		<PublicProfileShell>
			<div className="rounded-[1.25rem] border border-zinc-200/90 bg-white px-6 py-10 text-sm text-zinc-500">
				{t("loading")}
			</div>
		</PublicProfileShell>
	)
}

export function ProfilePage() {
	return (
		<Suspense fallback={<PublicProfileFallback />}>
			<PublicProfileContent />
		</Suspense>
	)
}
