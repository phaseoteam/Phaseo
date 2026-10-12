"use client";

import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { startTransition, useEffect, useOptimistic, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	AUDIO_FAMILY_GROUPS,
	isAudioFamilyGroup,
	isAudioFamilyOpen,
	toggleOutputModality,
} from "@/lib/models/audioFamily";
import { getModalityTone } from "@/lib/models/modalityStyles";
import { cn } from "@/lib/utils";
import type { OptionCount } from "./modelsDisplay.types";

/**
 * The swap is quick on purpose: both rows move at once with no stagger, so the
 * filter feels like it responds the moment it is pressed.
 */
const MAIN_OUT_MS = 110;
const AUDIO_IN_MS = 160;
/** A row stops being visible once its chips have finished fading. */
const MAIN_HIDE_MS = MAIN_OUT_MS + 10;
const AUDIO_HIDE_MS = AUDIO_IN_MS + 10;

type ChipProps = {
	option: OptionCount;
	label: string;
	Icon: LucideIcon;
	checked: boolean;
	onClick: () => void;
	/** Slide distance in px while the chip is out of view. */
	hiddenShift: number;
	hidden: boolean;
	durationMs: number;
	reduceMotion: boolean;
	expanded?: boolean;
	leading?: ReactNode;
	trailing?: ReactNode;
};

function Chip({
	option,
	label,
	Icon,
	checked,
	onClick,
	hiddenShift,
	hidden,
	durationMs,
	reduceMotion,
	expanded,
	leading,
	trailing,
}: ChipProps) {
	const tone = getModalityTone(option.value);

	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			onClick={onClick}
			aria-pressed={checked}
			aria-expanded={expanded}
			tabIndex={hidden ? -1 : undefined}
			className={cn(
				"group h-9 shrink-0 rounded-md px-2 text-sm shadow-none",
				checked
					? cn(
							"bg-muted text-foreground hover:bg-muted",
							tone.badgeClassName,
							"border-0 hover:border-0",
						)
					: "text-muted-foreground hover:text-foreground",
			)}
			style={{
				opacity: hidden ? 0 : 1,
				transform: hidden ? `translateX(${hiddenShift}px)` : "none",
				transitionProperty: "background-color, color, opacity, transform",
				transitionDuration: reduceMotion
					? "0ms"
					: `150ms, 150ms, ${durationMs}ms, ${durationMs}ms`,
				transitionTimingFunction:
					"ease, ease, ease, cubic-bezier(0.2, 0.8, 0.2, 1)",
			}}
		>
			{leading}
			<span
				className={cn(
					"inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm",
					checked
						? tone.iconClassName
						: cn(
								"bg-transparent text-muted-foreground transition-colors",
								tone.ghostIconHoverClassName,
							),
				)}
			>
				<Icon className="h-3.5 w-3.5" />
			</span>
			<span>{label}</span>
			<span
				className={cn(
					"inline-flex min-w-5 items-center justify-center px-1 text-[11px] font-medium leading-none tabular-nums",
					checked ? "text-current" : "text-muted-foreground",
				)}
			>
				{option.count}
			</span>
			{trailing}
		</Button>
	);
}

/**
 * The output-modality chips above the models list. Audio opens its own row in
 * place: the main chips slide out, the audio sub-types (speech, transcription,
 * translation, realtime, music) slide in, and the Audio chip becomes the way back.
 *
 * Pressing a chip updates the row at once and applies the filter in a
 * transition, so re-filtering the whole catalogue does not hold the row back.
 */
export function OutputModalityChipRow({
	options,
	selected,
	onChange,
	labelForValue,
	iconForValue,
}: {
	options: OptionCount[];
	selected: string[];
	onChange: (next: string[]) => void;
	labelForValue: (value: string) => string;
	iconForValue: (value: string) => LucideIcon;
}) {
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const contentRef = useRef<HTMLDivElement | null>(null);
	const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
	const [mainSettledHidden, setMainSettledHidden] = useState(false);
	const [shownSelected, setShownSelected] = useOptimistic(selected);
	const reduceMotion = Boolean(useReducedMotion());

	const audioOption = options.find((option) => option.value === "audio");
	const subOptions = AUDIO_FAMILY_GROUPS.flatMap((value) => {
		const option = options.find((candidate) => candidate.value === value);
		return option ? [option] : [];
	});
	const mainOptions = options.filter((option) => !isAudioFamilyGroup(option.value));
	const hasFamily = Boolean(audioOption) && subOptions.length > 0;
	const open = hasFamily && isAudioFamilyOpen(shownSelected);
	const mainCollapsed = open && mainSettledHidden;
	const hiddenSelectionCount = shownSelected.filter(
		(value) => value !== "audio" && !isAudioFamilyGroup(value),
	).length;

	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;

		const updateOverflow = () => {
			setHasHorizontalOverflow(viewport.scrollWidth > viewport.clientWidth + 1);
		};

		updateOverflow();

		const resizeObserver = new ResizeObserver(updateOverflow);
		resizeObserver.observe(viewport);
		if (contentRef.current) resizeObserver.observe(contentRef.current);
		window.addEventListener("resize", updateOverflow);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener("resize", updateOverflow);
		};
	}, [options, mainCollapsed]);

	useEffect(() => {
		viewportRef.current?.scrollTo({ left: 0 });
		if (!open) return;
		const timer = window.setTimeout(
			() => setMainSettledHidden(true),
			reduceMotion ? 0 : MAIN_HIDE_MS + 10,
		);
		return () => {
			window.clearTimeout(timer);
			setMainSettledHidden(false);
		};
	}, [open, reduceMotion]);

	if (options.length === 0) return null;

	const toggle = (value: string) => {
		const next = toggleOutputModality(shownSelected, value);
		startTransition(() => {
			setShownSelected(next);
			onChange(next);
		});
	};
	const mainHideDelay = reduceMotion ? 0 : MAIN_HIDE_MS;
	const audioHideDelay = reduceMotion ? 0 : AUDIO_HIDE_MS;

	return (
		<ScrollArea
			className="w-full [&>[data-orientation=horizontal]]:opacity-100 [&>[data-orientation=horizontal]]:transition-none"
			scrollBarOrientation="horizontal"
			// The audio row has no bar of its own: it is scrolled by wheel, trackpad,
			// touch or keyboard if it is wider than the window. The scroll area only
			// re-measures when its viewport resizes, so it can keep a bar left over
			// from the wider main row.
			scrollBarClassName={open ? "hidden" : undefined}
			viewportClassName={cn(
				"transition-[padding-bottom] duration-150 motion-reduce:transition-none",
				hasHorizontalOverflow && !open ? "pb-2" : "pb-0",
			)}
			viewportRef={viewportRef}
		>
			<div ref={contentRef} className="grid pr-4">
				<div
					className={cn(
						"col-start-1 row-start-1 flex items-center gap-1.5",
						mainCollapsed ? "max-w-0 min-w-0 overflow-hidden" : "min-w-max",
					)}
					style={{
						visibility: open ? "hidden" : "visible",
						pointerEvents: open ? "none" : undefined,
						transitionProperty: "visibility",
						transitionDuration: "0ms",
						transitionDelay: open ? `${mainHideDelay}ms` : "0ms",
					}}
					aria-hidden={open}
				>
					{mainOptions.map((option) => {
						const isAudio = option.value === "audio";
						return (
							<Chip
								key={option.value}
								option={option}
								label={labelForValue(option.value)}
								Icon={iconForValue(option.value)}
								checked={
									isAudio
										? !hasFamily && shownSelected.includes("audio")
										: shownSelected.includes(option.value)
								}
								onClick={() => toggle(option.value)}
								hidden={open}
								hiddenShift={-14}
								durationMs={MAIN_OUT_MS}
								reduceMotion={reduceMotion}
								expanded={isAudio && hasFamily ? false : undefined}
								trailing={
									isAudio && hasFamily ? (
										<ChevronRight className="-mr-0.5 h-3 w-3 shrink-0" aria-hidden />
									) : null
								}
							/>
						);
					})}
				</div>

				{audioOption && hasFamily ? (
					<div
						className="col-start-1 row-start-1 flex min-w-max items-center gap-1.5"
						style={{
							visibility: open ? "visible" : "hidden",
							pointerEvents: open ? undefined : "none",
							transitionProperty: "visibility",
							transitionDuration: "0ms",
							transitionDelay: open ? "0ms" : `${audioHideDelay}ms`,
						}}
						aria-hidden={!open}
					>
						<Chip
							option={audioOption}
							label={labelForValue("audio")}
							Icon={iconForValue("audio")}
							checked
							onClick={() => toggle("audio")}
							hidden={!open}
							hiddenShift={14}
							durationMs={AUDIO_IN_MS}
							reduceMotion={reduceMotion}
							expanded
							trailing={
								<>
									<ChevronRight
										className="-mr-0.5 h-3 w-3 shrink-0 rotate-180"
										aria-hidden
									/>
									{hiddenSelectionCount > 0 ? (
										<span
											className="rounded-sm bg-background/60 px-1 text-[10px] font-medium leading-4 tabular-nums"
											title={`${hiddenSelectionCount} other filter${hiddenSelectionCount === 1 ? "" : "s"} selected`}
										>
											+{hiddenSelectionCount}
										</span>
									) : null}
								</>
							}
						/>
						<span
							aria-hidden
							className="mx-1 h-4 w-px shrink-0 bg-border"
							style={{
								opacity: open ? 1 : 0,
								transition: reduceMotion ? "none" : `opacity ${AUDIO_IN_MS}ms ease`,
							}}
						/>
						{subOptions.map((option) => (
							<Chip
								key={option.value}
								option={option}
								label={labelForValue(option.value)}
								Icon={iconForValue(option.value)}
								checked={shownSelected.includes(option.value)}
								onClick={() => toggle(option.value)}
								hidden={!open}
								hiddenShift={14}
								durationMs={AUDIO_IN_MS}
								reduceMotion={reduceMotion}
							/>
						))}
					</div>
				) : null}
			</div>
		</ScrollArea>
	);
}
