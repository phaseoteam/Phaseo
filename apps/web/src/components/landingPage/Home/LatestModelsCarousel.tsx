"use client";

import { useState } from "react";
import { useReducedMotion } from "motion/react";
import { Pause, Play } from "lucide-react";
import UpdateCard from "@/components/updates/UpdateCard";
import {
	Marquee,
	MarqueeContent,
	MarqueeFade,
	MarqueeItem,
} from "@/components/ui/marquee";
import type { UpdateCardProps } from "@/lib/fetchers/updates/getLatestModelUpdates";

type LatestModelsCarouselProps = {
	cards: UpdateCardProps[];
};

export function LatestModelsCarousel({ cards }: LatestModelsCarouselProps) {
	const prefersReducedMotion = useReducedMotion();
	const [isFocusPaused, setIsFocusPaused] = useState(false);
	const [isUserPaused, setIsUserPaused] = useState(false);
	const canAutoScroll = cards.length > 1 && !prefersReducedMotion;

	return (
		<Marquee
			className="py-1"
			onFocusCapture={() => setIsFocusPaused(true)}
			onBlurCapture={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) {
					setIsFocusPaused(false);
				}
			}}
		>
			<MarqueeFade side="left" className="w-10 sm:w-20" />
			<MarqueeFade side="right" className="w-10 sm:w-20" />
			<MarqueeContent
				autoFill
				pauseOnHover
				pauseOnClick={false}
				play={canAutoScroll && !isFocusPaused && !isUserPaused}
				speed={18}
			>
				{cards.map((card, index) => (
					<MarqueeItem
						key={card.id ? String(card.id) : `card-${index}`}
						className="w-[17.5rem] sm:w-[19rem]"
					>
						<UpdateCard
							{...card}
							compact
							hideBadges
							hideFooterLink
							metaPlacement="header"
							providerDateInline
							className="h-full rounded-[20px] border-zinc-200 bg-white/90 py-0 shadow-sm ring-1 ring-inset ring-zinc-200/60 hover:translate-y-0 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80 dark:ring-zinc-800/60"
						/>
					</MarqueeItem>
				))}
			</MarqueeContent>
			{cards.length > 1 && !prefersReducedMotion ? (
				<button
					type="button"
					aria-pressed={isUserPaused}
					aria-label={isUserPaused ? "Play latest model updates" : "Pause latest model updates"}
					onClick={() => setIsUserPaused((paused) => !paused)}
					className="absolute top-1 right-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200/80 bg-white/90 text-zinc-500 shadow-sm transition-colors hover:bg-white hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/70 dark:border-zinc-800/80 dark:bg-zinc-950/90 dark:text-zinc-400 dark:hover:bg-zinc-950 dark:hover:text-zinc-50"
				>
					{isUserPaused ? (
						<Play className="h-3.5 w-3.5" aria-hidden="true" />
					) : (
						<Pause className="h-3.5 w-3.5" aria-hidden="true" />
					)}
				</button>
			) : null}
		</Marquee>
	);
}
