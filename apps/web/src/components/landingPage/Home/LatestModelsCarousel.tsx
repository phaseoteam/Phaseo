"use client";

import { useState } from "react";
import { useReducedMotion } from "motion/react";
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
				play={!prefersReducedMotion && !isFocusPaused}
				speed={18}
			>
				{cards.map((card) => (
					<MarqueeItem
						key={String(card.id)}
						className="w-[17.5rem] sm:w-[19rem]"
					>
						<UpdateCard
							{...card}
							compact
							hideBadges
							hideFooterLink
							metaPlacement="header"
							providerDateInline
							className="h-full rounded-[20px] border-zinc-200 bg-white/90 py-0 shadow-sm ring-1 ring-inset ring-zinc-200/60 dark:border-zinc-800 dark:bg-zinc-950/80 dark:ring-zinc-800/60"
						/>
					</MarqueeItem>
				))}
			</MarqueeContent>
		</Marquee>
	);
}
