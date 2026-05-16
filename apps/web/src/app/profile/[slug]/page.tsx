import type { Metadata } from "next"
import { notFound } from "next/navigation"

import ProfileDashboard from "@/components/(gateway)/settings/profile/ProfileDashboard"
import { getPublicProfileSnapshot } from "@/lib/fetchers/profile/getProfileSnapshot"

export const dynamic = "force-dynamic"

type PageProps = {
	params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
	const { slug } = await params
	const profile = await getPublicProfileSnapshot(slug)

	if (!profile) {
		return {
			title: "Profile",
			robots: {
				index: false,
				follow: false,
			},
		}
	}

	return {
		title: `${profile.displayName} - Profile`,
		description: `${profile.displayName}'s AI Stats usage profile.`,
		robots: {
			index: false,
			follow: false,
		},
	}
}

export default async function PublicProfilePage({ params }: PageProps) {
	const { slug } = await params
	const profile = await getPublicProfileSnapshot(slug)

	if (!profile || !profile.publicProfileEnabled) {
		notFound()
	}

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

				<ProfileDashboard profile={profile} publicView />
			</div>
		</div>
	)
}
