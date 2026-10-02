import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { ArrowUpRight } from "lucide-react"
import { getTranslations } from "next-intl/server"

import { Button } from "@/components/ui/button"
import {
	buildProfileShareCardImageUrl,
	parseProfileShareCardToken,
	PROFILE_SHARE_CARD_VERSION,
} from "@/lib/profileShare"
import { buildMetadata } from "@/lib/seo"
import type { PublicLocale } from "@/i18n/routing"

type PageProps = {
	params: Promise<{ locale: string; card: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
	const { locale, card } = await params
	const payload = parseProfileShareCardToken(card)
	const t = await getTranslations({
		locale: locale as PublicLocale,
		namespace: "Site.profileShare",
	})

	return buildMetadata({
		title: `${payload.displayName} - ${t("titleSuffix")}`,
		description: t("description"),
		path: `/share/profile/${card}`,
		imagePath: `/og/profile-share/${card}?v=${PROFILE_SHARE_CARD_VERSION}`,
		robots: { index: false, follow: false },
	})
}

export default function ProfileSharePage(props: PageProps) {
	return (
		<Suspense fallback={<ShareCardPageFallback />}>
			<ProfileSharePageContent {...props} />
		</Suspense>
	)
}

async function ProfileSharePageContent({ params }: PageProps) {
	const { locale, card } = await params
	const payload = parseProfileShareCardToken(card)
	const imageUrl = buildProfileShareCardImageUrl(payload)
	const t = await getTranslations({
		locale: locale as PublicLocale,
		namespace: "Site.profileShare",
	})

	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.08),transparent_28%),linear-gradient(180deg,#fcfcfd_0%,#f7f7fb_100%)] px-4 py-8 sm:px-6 lg:px-10">
			<div className="mx-auto max-w-4xl space-y-6">
				<div className="space-y-2">
					<p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
						Phaseo
					</p>
					<h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
						{t("shareCard", { name: payload.displayName })}
					</h1>
					<p className="max-w-2xl text-sm text-zinc-500">
						{t("description")}
					</p>
				</div>

				<div className="overflow-hidden rounded-[1.5rem] border border-zinc-200 bg-white p-3 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
					<img
						src={imageUrl}
						alt={t("imageAlt", { name: payload.displayName })}
						className="block w-full rounded-[1.1rem]"
					/>
				</div>

				<div className="flex flex-wrap gap-3">
					<Button asChild>
						<a
							href={imageUrl}
							download="phaseo-profile-share.png"
							target="_blank"
							rel="noreferrer"
						>
						{t("downloadImage")}
						</a>
					</Button>
					<Button asChild variant="outline">
						<Link href="/">
							{t("openPhaseo")}
							<ArrowUpRight className="h-4 w-4" />
						</Link>
					</Button>
				</div>
			</div>
		</div>
	)
}

function ShareCardPageFallback() {
	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.08),transparent_28%),linear-gradient(180deg,#fcfcfd_0%,#f7f7fb_100%)] px-4 py-8 sm:px-6 lg:px-10">
			<div className="mx-auto max-w-4xl space-y-6">
				<div className="space-y-2">
					<div className="h-3 w-20 rounded-full bg-zinc-200" />
					<div className="h-10 w-72 rounded-full bg-zinc-200" />
					<div className="h-4 w-full max-w-xl rounded-full bg-zinc-100" />
				</div>

				<div className="h-[34rem] rounded-[1.5rem] border border-zinc-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]" />
			</div>
		</div>
	)
}
