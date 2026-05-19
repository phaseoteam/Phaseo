import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import ProfileDashboard from "@/components/(gateway)/settings/profile/ProfileDashboard"
import { getPublicProfileSnapshot } from "@/lib/fetchers/profile/getProfileSnapshot"

type PageProps = {
	params: Promise<{ slug: string }>
}

export const metadata: Metadata = {
	title: "Profile",
	description: "Public AI Stats usage profile.",
	robots: {
		index: false,
		follow: false,
	},
}

function PublicProfileShell({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.08),transparent_28%),linear-gradient(180deg,#fcfcfd_0%,#f7f7fb_100%)] px-4 py-8 sm:px-6 lg:px-10">
			<div className="mx-auto max-w-7xl space-y-6">
				<div className="flex items-center justify-between gap-4">
					<div>
						<p className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-400">
							AI Stats
						</p>
						<h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
							Shared Profile
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
	params: Promise<{ slug: string }>
}) {
	await connection()
	const { slug } = await params
	const profile = await getPublicProfileSnapshot(slug)

	if (!profile || !profile.publicProfileEnabled) {
		notFound()
	}

	return (
		<PublicProfileShell>
			<ProfileDashboard profile={profile} publicView />
		</PublicProfileShell>
	)
}

function PublicProfileFallback() {
	return (
		<PublicProfileShell>
			<div className="rounded-[1.25rem] border border-zinc-200/90 bg-white px-6 py-10 text-sm text-zinc-500">
				Loading profile...
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
