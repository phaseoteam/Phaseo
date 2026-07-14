"use client"

import { Download, Share2 } from "lucide-react"

import type { ProfileShareCardPayload } from "@/lib/profileShare"
import {
	buildProfileShareCardImageUrl,
	buildProfileShareCardPageUrl,
} from "@/lib/profileShare"
import { LinkedInBrandIcon, XBrandIcon } from "@/components/icons/SocialBrandIcons"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/ui/copy-button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"

type Props = {
	payload: ProfileShareCardPayload
}

export default function ProfileShareControls({ payload }: Props) {
	const sharePageUrl = buildProfileShareCardPageUrl(payload)
	const shareImageUrl = buildProfileShareCardImageUrl(payload)
	const twitterIntentUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(
		sharePageUrl,
	)}`
	const linkedInIntentUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
		sharePageUrl,
	)}`

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline" className="rounded-full border-zinc-200 bg-white">
					<Share2 className="h-4 w-4" />
					Share
				</Button>
			</DialogTrigger>

			<DialogContent className="max-w-3xl gap-5 border-zinc-200 bg-white p-4 sm:p-5">
				<DialogHeader className="pr-8">
					<DialogTitle>Share card</DialogTitle>
					<DialogDescription>
						Preview the generated image, then share or download it.
					</DialogDescription>
				</DialogHeader>

				<div className="overflow-hidden rounded-[1.25rem] border border-zinc-200 bg-zinc-50 p-2">
					<img
						src={shareImageUrl}
						alt={`${payload.displayName} Phaseo share card`}
						className="block w-full rounded-[0.9rem]"
					/>
				</div>

				<div className="grid gap-2 sm:grid-cols-4">
					<Button asChild variant="outline" className="justify-center rounded-full border-zinc-200">
						<a
							href={shareImageUrl}
							download="phaseo-profile-share.png"
							target="_blank"
							rel="noreferrer"
						>
							<Download className="h-4 w-4" />
							PNG
						</a>
					</Button>

					<Button asChild variant="outline" className="justify-center rounded-full border-zinc-200">
						<a href={twitterIntentUrl} target="_blank" rel="noreferrer">
							<XBrandIcon className="h-4 w-4" />
							X
						</a>
					</Button>

					<Button asChild variant="outline" className="justify-center rounded-full border-zinc-200">
						<a href={linkedInIntentUrl} target="_blank" rel="noreferrer">
							<LinkedInBrandIcon className="h-4 w-4" />
							LinkedIn
						</a>
					</Button>

					<div className="flex justify-center">
						<CopyButton
							content={sharePageUrl}
							variant="outline"
							size="md"
							aria-label="Copy share card link"
							className="h-9 w-full rounded-full border border-zinc-200"
						/>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
