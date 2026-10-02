import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import ProfileDashboard from "@/components/(gateway)/settings/profile/ProfileDashboard"
import { fetchFrontendPublicProfile } from "@/lib/fetchers/frontend/fetchPublicCatalog"
import { getProfileMessages } from "@/i18n/profile"
import { isPublicLocale, type PublicLocale } from "@/i18n/routing"
import { useTranslations } from "next-intl"
import { getTranslations } from "next-intl/server"

type PageProps = {
	params: Promise<{ locale: string; slug: string }>
}

export async function generateMetadata(): Promise<Metadata> {
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

async function PublicProfileContent({
	params,
}: {
	params: Promise<{ locale: string; slug: string }>
}) {
	await connection()
	const { locale, slug } = await params
	const profile = await fetchFrontendPublicProfile(slug)

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

export default function PublicProfilePage({ params }: PageProps) {
	return (
		<Suspense fallback={<PublicProfileFallback />}>
			<PublicProfileContent params={params} />
		</Suspense>
	)
}
