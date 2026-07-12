"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import UpdateCard from "@/components/updates/UpdateCard";
import type { UpdateCardProps } from "@/lib/fetchers/updates/getLatestModelUpdates";

type LatestModelsCarouselProps = {
	cards: UpdateCardProps[];
};

const AUTO_ADVANCE_MS = 6000;

export function LatestModelsCarousel({ cards }: LatestModelsCarouselProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const pausedRef = useRef(false);

	function move(direction: 1 | -1) {
		const track = trackRef.current;
		const card = track?.firstElementChild as HTMLElement | null;
		if (!track || !card) return;

		const gap = Number.parseFloat(getComputedStyle(track).gap) || 0;
		const step = card.getBoundingClientRect().width + gap;
		const nextLeft = track.scrollLeft + direction * step;
		const atStart = nextLeft <= 0;
		const atEnd = nextLeft >= track.scrollWidth - track.clientWidth - 1;

		track.scrollTo({
			left: direction === 1 && atEnd ? 0 : direction === -1 && atStart ? track.scrollWidth : nextLeft,
			behavior: "smooth",
		});
	}

	useEffect(() => {
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (reducedMotion.matches || cards.length < 2) return;

		const interval = window.setInterval(() => {
			if (!pausedRef.current) move(1);
		}, AUTO_ADVANCE_MS);

		return () => window.clearInterval(interval);
	}, [cards.length]);

	return (
		<div
			className="space-y-3"
			onMouseEnter={() => {
				pausedRef.current = true;
			}}
			onMouseLeave={() => {
				pausedRef.current = false;
			}}
			onFocusCapture={() => {
				pausedRef.current = true;
			}}
			onBlurCapture={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) {
					pausedRef.current = false;
				}
			}}
		>
			<div
				ref={trackRef}
				className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				aria-label="Latest models"
			>
				{cards.map((card) => (
					<div
						key={String(card.id)}
						className="w-[82%] shrink-0 snap-start sm:w-[calc(50%-0.375rem)] lg:w-[calc((100%-1.5rem)/3)]"
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
					</div>
				))}
			</div>
			<div className="flex justify-end gap-2">
				<button
					type="button"
					onClick={() => move(-1)}
					className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
					aria-label="Previous models"
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={() => move(1)}
					className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
					aria-label="Next models"
				>
					<ChevronRight className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
