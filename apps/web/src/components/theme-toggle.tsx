"use client";

import * as React from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const isDark = resolvedTheme === "dark";

	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			onClick={() => setTheme(isDark ? "light" : "dark")}
			className="
				h-9 w-9 rounded-full
				flex items-center justify-center
				text-primary
				border border-border
				bg-transparent dark:bg-transparent
				shadow-none
				transition-colors
				hover:bg-zinc-100 dark:hover:bg-zinc-900
				focus:outline-hidden focus:ring-2 focus:ring-primary
			"
		>
			<Sun
				className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
				aria-hidden="true"
			/>
			<Moon
				className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
				aria-hidden="true"
			/>
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}

type ThemeSelectorProps = {
	className?: string;
	labelSize?: "xs" | "sm";
	showSelectedLabel?: boolean;
};

export function ThemeSelector({
	className,
	labelSize: _labelSize = "xs",
	showSelectedLabel = true,
}: ThemeSelectorProps = {}) {
	const { theme, setTheme } = useTheme();
	const reduceMotion = useReducedMotion();
	const [mounted, setMounted] = React.useState(false);
	const [showLabel, setShowLabel] = React.useState(false);
	const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	React.useEffect(() => {
		setMounted(true);
	}, []);
	React.useEffect(() => {
		return () => {
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		};
	}, []);

	const normalizedTheme =
		mounted && (theme === "light" || theme === "dark" || theme === "system")
			? theme
			: "system";
	const order = ["system", "light", "dark"] as const;
	const labels: Record<(typeof order)[number], string> = {
		system: "System",
		light: "Light",
		dark: "Dark",
	};
	const iconByTheme: Record<
		(typeof order)[number],
		React.ComponentType<{ className?: string }>
	> = {
		light: Sun,
		dark: Moon,
		system: Monitor,
	};
	const springTransition = reduceMotion
		? { duration: 0 }
		: {
				type: "spring" as const,
				stiffness: 360,
				damping: 30,
				mass: 0.8,
			};

	const revealLabel = () => {
		setShowLabel(true);
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		hideTimerRef.current = setTimeout(() => {
			setShowLabel(false);
		}, 3000);
	};

	return (
		<div className={cn("inline-flex items-center gap-2", className)}>
			<div
				role="radiogroup"
				aria-label="Theme"
				className="inline-flex items-center gap-0.5 rounded-lg"
			>
				{order.map((themeOption) => {
					const Icon = iconByTheme[themeOption];
					const active = normalizedTheme === themeOption;

					return (
						<button
							key={themeOption}
							type="button"
							role="radio"
							aria-checked={active}
							aria-label={`Use ${labels[themeOption]} theme`}
							onClick={() => {
								setTheme(themeOption);
								if (showSelectedLabel) {
									revealLabel();
								}
							}}
							className={cn(
								"group/theme relative inline-flex h-8 w-8 touch-manipulation items-center justify-center rounded-lg px-0.5 text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-300 dark:text-zinc-400 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-700",
								active && "text-zinc-900 dark:text-zinc-100",
							)}
						>
							<motion.span
								className={cn(
									"flex h-6 w-6 items-center justify-center rounded-md bg-zinc-100 p-1 text-zinc-500 transition-colors group-hover/theme:bg-zinc-200 group-hover/theme:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-400 dark:group-hover/theme:bg-zinc-800 dark:group-hover/theme:text-zinc-100",
									active &&
										"bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100",
								)}
								animate={
									reduceMotion || !active ? undefined : { y: -0.5 }
								}
								whileHover={
									reduceMotion ? undefined : { scale: 1.06, y: -0.5 }
								}
								transition={springTransition}
							>
								<Icon className="h-4 w-4" />
							</motion.span>
						</button>
					);
				})}
			</div>
			{showSelectedLabel ? (
				<AnimatePresence initial={false} mode="wait">
					{showLabel ? (
						<motion.span
							key={normalizedTheme}
							initial={
								reduceMotion
									? undefined
									: { opacity: 0, x: -6, filter: "blur(3px)" }
							}
							animate={
								reduceMotion
									? undefined
									: {
											opacity: 1,
											x: 0,
											filter: "blur(0px)",
											transition: springTransition,
										}
							}
							exit={
								reduceMotion
									? undefined
									: {
											opacity: 0,
											x: -6,
											filter: "blur(3px)",
											transition: { duration: 0.18, ease: "easeOut" },
										}
							}
							className="relative inline-flex min-w-[3.75rem] overflow-hidden text-sm font-medium text-zinc-600 dark:text-zinc-300"
						>
							{labels[normalizedTheme]}
						</motion.span>
					) : null}
				</AnimatePresence>
			) : null}
		</div>
	);
}
