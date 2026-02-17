"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

function usePrefersReducedMotion(): boolean {
	const [reduced, setReduced] = React.useState(false);

	React.useEffect(() => {
		const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
		if (!mq) return;

		const update = () => setReduced(Boolean(mq.matches));
		update();

		// Safari still uses addListener/removeListener in some versions.
		// eslint-disable-next-line deprecation/deprecation
		if (mq.addEventListener) mq.addEventListener("change", update);
		// eslint-disable-next-line deprecation/deprecation
		else mq.addListener(update);

		return () => {
			// eslint-disable-next-line deprecation/deprecation
			if (mq.removeEventListener) mq.removeEventListener("change", update);
			// eslint-disable-next-line deprecation/deprecation
			else mq.removeListener(update);
		};
	}, []);

	return reduced;
}

export function PriceRotator({
	lines,
	intervalMs = 3500,
	className,
}: {
	lines: string[];
	intervalMs?: number;
	className?: string;
}) {
	const prefersReducedMotion = usePrefersReducedMotion();
	const [idx, setIdx] = React.useState(0);
	const [isFading, setIsFading] = React.useState(false);
	const [paused, setPaused] = React.useState(false);

	const transitionMs = prefersReducedMotion ? 0 : 180;
	const transitionRef = React.useRef<number | null>(null);
	const intervalRef = React.useRef<number | null>(null);
	const idxRef = React.useRef(0);

	React.useEffect(() => {
		// Ensure only one interval is running.
		if (intervalRef.current) window.clearInterval(intervalRef.current);
		intervalRef.current = null;

		if (paused) return;
		if (!lines || lines.length <= 1) return;

		intervalRef.current = window.setInterval(() => {
			if (transitionRef.current) return;

			const next = (idxRef.current + 1) % lines.length;

			if (prefersReducedMotion) {
				idxRef.current = next;
				setIdx(next);
				return;
			}

			setIsFading(true);
			transitionRef.current = window.setTimeout(() => {
				idxRef.current = next;
				setIdx(next);
				// Fade back in after we swapped text.
				setIsFading(false);
				transitionRef.current = null;
			}, transitionMs);
		}, intervalMs);

		return () => {
			if (intervalRef.current) window.clearInterval(intervalRef.current);
			intervalRef.current = null;
		};
	}, [lines, intervalMs, paused, prefersReducedMotion, transitionMs]);

	React.useEffect(() => {
		// Keep index in range if the set of lines changes.
		setIdx((current) => {
			const next = lines.length ? current % lines.length : 0;
			idxRef.current = next;
			return next;
		});
	}, [lines.length]);

	React.useEffect(() => {
		idxRef.current = idx;
	}, [idx]);

	React.useEffect(() => {
		return () => {
			if (transitionRef.current) window.clearTimeout(transitionRef.current);
			transitionRef.current = null;
			if (intervalRef.current) window.clearInterval(intervalRef.current);
			intervalRef.current = null;
		};
	}, []);

	if (!lines || lines.length === 0) return null;
	const current = lines[idx] ?? lines[0]!;
	const tooltip = lines.join("\n");

	return (
		<span
			className={cn(
				"relative inline-flex min-w-0 items-center tabular-nums overflow-hidden",
				className
			)}
			title={tooltip}
			onMouseEnter={() => setPaused(true)}
			onMouseLeave={() => setPaused(false)}
			onFocus={() => setPaused(true)}
			onBlur={() => setPaused(false)}
			aria-live="polite"
		>
			<span
				key={idx}
				className={cn("w-full truncate transition-all ease-out", {
					"opacity-0 -translate-y-1": !prefersReducedMotion && isFading,
					"opacity-100 translate-y-0": prefersReducedMotion || !isFading,
				})}
				style={{
					transitionDuration: `${transitionMs}ms`,
				}}
			>
				{current}
			</span>
		</span>
	);
}
