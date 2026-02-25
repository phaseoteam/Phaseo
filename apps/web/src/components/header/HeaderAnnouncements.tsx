"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

export function HeaderAnnouncements({
	message,
	href,
	label,
	secondaryLabel,
	secondaryHref,
	tertiaryLabel,
	tertiaryHref,
}: {
	message: string;
	href?: string;
	label?: string;
	secondaryLabel?: string;
	secondaryHref?: string;
	tertiaryLabel?: string;
	tertiaryHref?: string;
}) {
	if (!message) return null;

	const slides = useMemo(
		() =>
			[
				label ? { text: label } : null,
				{ text: message, href },
				secondaryLabel && secondaryHref
					? { text: secondaryLabel, href: secondaryHref }
					: null,
				tertiaryLabel && tertiaryHref
					? { text: tertiaryLabel, href: tertiaryHref }
					: null,
			].filter(Boolean) as Array<{ text: string; href?: string }>,
		[
			href,
			label,
			message,
			secondaryHref,
			secondaryLabel,
			tertiaryHref,
			tertiaryLabel,
		]
	);

	const [mobileIndex, setMobileIndex] = useState(0);
	const shouldReduceMotion = useReducedMotion();

	useEffect(() => {
		if (slides.length <= 1) return;
		const interval = setInterval(() => {
			setMobileIndex((prev) => (prev + 1) % slides.length);
		}, 3500);
		return () => {
			clearInterval(interval);
		};
	}, [slides.length]);

	const mobileSlide = slides[mobileIndex] ?? slides[0];

	return (
		<div className="border-t border-zinc-200/60 bg-white/80 dark:border-zinc-800/60 dark:bg-zinc-950/80 backdrop-blur">
			<div className="container mx-auto px-4">
				<div className="hidden sm:flex flex-wrap items-center justify-center gap-3 py-2 text-sm">
					{label ? (
						<>
							<span className="text-sm font-semibold text-foreground">
								{label}
							</span>
							<span className="text-xs text-foreground/50">|</span>
						</>
					) : null}
					{href ? (
						<Link
							href={href}
							className="flex items-center gap-2 font-medium text-foreground/80 underline decoration-transparent hover:decoration-current transition-colors duration-200 underline-offset-4"
						>
							<span>{message}</span>
							<ArrowUpRight className="h-4 w-4" />
						</Link>
					) : (
						<span className="flex items-center gap-2 font-medium text-foreground/80">
							{message}
							<ArrowUpRight className="h-4 w-4" />
						</span>
					)}
					{secondaryLabel && secondaryHref ? (
						<>
							<span className="text-xs text-foreground/50">|</span>
							<Link
								href={secondaryHref}
								className="flex items-center gap-2 font-medium text-foreground/80 underline decoration-transparent hover:decoration-current transition-colors duration-200 underline-offset-4"
							>
								<span>{secondaryLabel}</span>
								<ArrowUpRight className="h-4 w-4" />
							</Link>
						</>
					) : null}
					{tertiaryLabel && tertiaryHref ? (
						<>
							<span className="text-xs text-foreground/50">|</span>
							<Link
								href={tertiaryHref}
								className="flex items-center gap-2 font-medium text-foreground/80 underline decoration-transparent hover:decoration-current transition-colors duration-200 underline-offset-4"
							>
								<span>{tertiaryLabel}</span>
								<ArrowUpRight className="h-4 w-4" />
							</Link>
						</>
					) : null}
				</div>

				<div className="sm:hidden py-2 text-sm overflow-hidden [perspective:1200px]">
					<div className="relative h-5">
						<AnimatePresence mode="sync" initial={false}>
						<motion.div
							key={`${mobileIndex}-${mobileSlide?.text ?? "slide"}`}
							className="absolute inset-0"
							initial={
								shouldReduceMotion
									? { opacity: 0, y: 6 }
									: {
											opacity: 0,
											y: 14,
											rotateX: -72,
											scale: 0.985,
											filter: "blur(2px)",
										}
							}
							animate={
								shouldReduceMotion
									? { opacity: 1, y: 0 }
									: {
											opacity: 1,
											y: 0,
											rotateX: 0,
											scale: 1,
											filter: "blur(0px)",
										}
							}
							exit={
								shouldReduceMotion
									? { opacity: 0, y: -6 }
									: {
											opacity: 0,
											y: -14,
											rotateX: 68,
											scale: 0.985,
											filter: "blur(2px)",
										}
							}
							transition={
								shouldReduceMotion
									? { duration: 0.22, ease: "easeOut" }
									: {
											duration: 0.42,
											ease: [0.22, 1, 0.36, 1],
										}
							}
							style={{ transformOrigin: "50% 55%" }}
						>
							{mobileSlide?.href ? (
								<Link
									href={mobileSlide.href}
									className="flex items-center justify-center gap-2 font-medium text-foreground/80 underline decoration-transparent hover:decoration-current transition-colors duration-200 underline-offset-4"
								>
									<span>{mobileSlide.text}</span>
									<ArrowUpRight className="h-4 w-4" />
								</Link>
							) : (
								<div className="flex items-center justify-center">
									<span className="text-sm font-semibold text-foreground">
										{mobileSlide?.text}
									</span>
								</div>
							)}
						</motion.div>
						</AnimatePresence>
					</div>
				</div>
			</div>
		</div>
	);
}

