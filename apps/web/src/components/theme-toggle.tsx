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
};

export function ThemeSelector({ className }: ThemeSelectorProps = {}) {
	const { theme, setTheme } = useTheme();
	const reduceMotion = useReducedMotion();
	const [mounted, setMounted] = React.useState(false);
	const [showCurrent, setShowCurrent] = React.useState(false);
	const [direction, setDirection] = React.useState<1 | -1>(1);
	React.useEffect(() => {
		setMounted(true);
	}, []);

	const normalizedTheme =
		mounted && (theme === "light" || theme === "dark" || theme === "system")
			? theme
			: "system";
	const order = ["light", "dark", "system"] as const;
	const labels: Record<(typeof order)[number], string> = {
		light: "Light",
		dark: "Dark",
		system: "System",
	};
	const iconByTheme: Record<
		(typeof order)[number],
		React.ComponentType<{ className?: string }>
	> = {
		light: Sun,
		dark: Moon,
		system: Monitor,
	};
	const currentIndex = order.indexOf(normalizedTheme);
	const nextTheme = order[(currentIndex + 1) % order.length];
	const CurrentIcon = iconByTheme[normalizedTheme];
	const currentLabel = labels[normalizedTheme];
	const displayLabel = showCurrent ? currentLabel : "Theme";
	const labelWidthByTheme: Record<(typeof order)[number], number> = {
		light: 40,
		dark: 36,
		system: 50,
	};
	const labelWidth = showCurrent ? labelWidthByTheme[normalizedTheme] : 48;
	const springTransition = reduceMotion
		? { duration: 0 }
		: {
				type: "spring" as const,
				stiffness: 360,
				damping: 30,
				mass: 0.8,
			};
	const widthTransition = reduceMotion ? { duration: 0 } : springTransition;
	const exitTransition = reduceMotion
		? { duration: 0 }
		: { duration: 0.18, ease: "easeOut" as const };

	const revealCurrent = () => {
		setDirection(1);
		setShowCurrent(true);
	};

	const hideCurrent = () => {
		setDirection(-1);
		setShowCurrent(false);
	};

	const handleClick = () => {
		setDirection(1);
		setShowCurrent(true);
		setTheme(nextTheme);
	};

	return (
		<Button
			type="button"
			variant="ghost"
			className={cn("w-fit h-7 px-3 py-1", className)}
			onMouseEnter={revealCurrent}
			onMouseLeave={hideCurrent}
			onFocus={revealCurrent}
			onBlur={hideCurrent}
			onClick={handleClick}
			aria-label={`Current theme: ${currentLabel}. Click to switch to ${labels[nextTheme]}.`}
		>
			<motion.span
				className="inline-flex items-center gap-2"
				animate={
					reduceMotion ? undefined : { y: showCurrent ? -0.5 : 0 }
				}
				transition={springTransition}
				whileTap={reduceMotion ? undefined : { scale: 0.98 }}
			>
				<span className="relative flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden">
					<AnimatePresence mode="wait" initial={false}>
						<motion.span
							key={normalizedTheme}
							initial={
								reduceMotion
									? undefined
									: { opacity: 0, y: 6, filter: "blur(2px)" }
							}
							animate={
								reduceMotion
									? undefined
									: { opacity: 1, y: 0, filter: "blur(0px)" }
							}
							exit={
								reduceMotion
									? undefined
									: { opacity: 0, y: -6, filter: "blur(2px)" }
							}
							transition={springTransition}
							className="absolute inset-0 flex items-center justify-center"
						>
							<CurrentIcon className="h-4 w-4" />
						</motion.span>
					</AnimatePresence>
				</span>
				<motion.span
					className="relative -ml-[2px] h-4 overflow-hidden text-xs leading-4"
					animate={reduceMotion ? undefined : { width: labelWidth }}
					transition={widthTransition}
					style={
						reduceMotion ? { width: `${labelWidth}px` } : undefined
					}
				>
					<AnimatePresence
						mode="wait"
						initial={false}
					>
						<motion.span
							key={displayLabel}
							initial={
								reduceMotion
									? false
									: {
											opacity: 0,
											y: direction > 0 ? 10 : -10,
											filter: "blur(3px)",
										}
							}
							animate={
								reduceMotion
									? undefined
									: {
											opacity: 1,
											y: 0,
											filter: "blur(0px)",
											transition: springTransition,
										}
							}
							exit={
								reduceMotion
									? undefined
									: {
											opacity: 0,
											y: direction > 0 ? -8 : 8,
											filter: "blur(3px)",
											transition: exitTransition,
										}
							}
							className="block"
						>
							{displayLabel}
						</motion.span>
					</AnimatePresence>
				</motion.span>
			</motion.span>
		</Button>
	);
}
