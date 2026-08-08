"use client"

import { useState } from "react"
import { Check, Copy, Download, Share2 } from "lucide-react"

import type { ProfileShareCardPayload } from "@/lib/profileShare"
import {
	buildProfileShareCardImageUrl,
	buildProfileShareCardPageUrl,
} from "@/lib/profileShare"
import { LinkedInBrandIcon, XBrandIcon } from "@/components/icons/SocialBrandIcons"
import { Button } from "@/components/ui/button"
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
	const [copied, setCopied] = useState(false)
	const sharePageUrl = buildProfileShareCardPageUrl(payload)
	const shareImageUrl = buildProfileShareCardImageUrl(payload)
	const twitterIntentUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(
		sharePageUrl,
	)}`
	const linkedInIntentUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
		sharePageUrl,
	)}`

	async function copyShareLink() {
		try {
			await navigator.clipboard.writeText(sharePageUrl)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 2000)
		} catch {
			setCopied(false)
		}
	}

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" aria-label="Share profile" className="h-8 rounded-lg px-2 sm:px-3">
					<Share2 className="h-4 w-4" />
					<span className="hidden sm:inline">Share</span>
				</Button>
			</DialogTrigger>

			<DialogContent className="gap-5 border border-border bg-popover p-4 text-popover-foreground sm:p-5 lg:max-w-lg">
				<DialogHeader className="pr-8">
					<DialogTitle>Share Card</DialogTitle>
					<DialogDescription>
						{payload.periodLabel} activity. Preview the image, then share or download it.
					</DialogDescription>
				</DialogHeader>

				<div className="overflow-hidden rounded-xl border border-border bg-muted/30 p-2">
					<img
						src={shareImageUrl}
						alt={`${payload.displayName} Phaseo share card`}
						className="block w-full rounded-lg"
					/>
				</div>

				<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
					<Button asChild variant="outline" className="h-9 justify-center rounded-lg">
						<a
							href={shareImageUrl}
							download="phaseo-profile-share.png"
							target="_blank"
							rel="noreferrer"
						>
							<Download className="h-4 w-4" />
							Download
						</a>
					</Button>

					<Button asChild variant="outline" className="h-9 justify-center rounded-lg">
						<a href={twitterIntentUrl} target="_blank" rel="noreferrer" aria-label="Post share card on X">
							<XBrandIcon className="h-4 w-4" />
							Post
						</a>
					</Button>

					<Button asChild variant="outline" className="h-9 justify-center rounded-lg">
						<a href={linkedInIntentUrl} target="_blank" rel="noreferrer" aria-label="Share card on LinkedIn">
							<LinkedInBrandIcon className="h-4 w-4" />
							Share
						</a>
					</Button>

					<Button
						type="button"
						variant="outline"
						className="h-9 justify-center rounded-lg"
						onClick={copyShareLink}
					>
						{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
						{copied ? "Copied" : "Copy Link"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
