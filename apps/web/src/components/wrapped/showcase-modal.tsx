"use client";

import * as React from "react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
	X,
	Download,
	Share2,
	ArrowLeft,
	ArrowRight,
	Sparkles,
	ArrowRight as ArrowRightIcon,
	Loader2,
	CheckCircle2,
} from "lucide-react";
import { SlideLayout } from "./slide-layout";
import { formatNumber, PROVIDERS } from "./utils";
import type { Summary, Slide } from "./types";

interface ShowcaseModalProps {
	isOpen: boolean;
	step: number;
	summary: Summary | null;
	slides: Slide[];
	onClose: () => void;
	onStepChange: (step: number) => void;
}

export default function ShowcaseModal({
	isOpen,
	step,
	summary,
	slides,
	onClose,
	onStepChange,
}: ShowcaseModalProps) {
	const [downloadLoading, setDownloadLoading] = useState(false);

	const handleDownload = async () => {
		if (!summary) return;
		setDownloadLoading(true);
		try {
			const payload = {
				summary,
				generatedAt: new Date().toISOString(),
			};
			const blob = new Blob([JSON.stringify(payload, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "ai-stats-wrapped-summary.json";
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			setDownloadLoading(false);
		}
	};

	const handleShare = async () => {
		if (!summary) return;

		const shareText = `My AI Wrapped: ${formatNumber(
			summary.totalTokens
		)} tokens * ${formatNumber(summary.totalMessages)} messages * ${
			summary.topWords[0]
		} was my word of the year.`;

		if (navigator.share) {
			try {
				await navigator.share({
					title: "My AI Wrapped",
					text: shareText,
					url: window.location.href,
				});
			} catch (error) {
				console.error("Share cancelled/failed", error);
			}
		} else if (navigator.clipboard) {
			try {
				await navigator.clipboard.writeText(
					`${shareText}\n${window.location.href}`
				);
				alert("Copied a shareable summary to your clipboard!");
			} catch (error) {
				alert("Unable to copy automatically -- please copy manually.");
			}
		}
	};
	return (
		<AnimatePresence>
			{isOpen && summary ? (
				<motion.div
					className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-zinc-100 via-white to-zinc-200 text-zinc-900 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900 dark:text-zinc-100"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.3 }}
				>
					<div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.35),_transparent_45%),_radial-gradient(circle_at_bottom_left,_rgba(236,72,153,0.25),_transparent_55%)]" />
					<header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
						<Button
							variant="ghost"
							size="icon"
							className="rounded-full bg-white/60 text-zinc-700 shadow hover:bg-white/80 dark:bg-zinc-900/70 dark:text-zinc-200"
							onClick={onClose}
						>
							<X className="h-5 w-5" />
						</Button>

						<div className="flex items-center gap-3">
							<Button
								variant="ghost"
								className="gap-2"
								onClick={handleShare}
							>
								<Share2 className="h-4 w-4" />
								Share
							</Button>
							<Button
								variant="default"
								className="gap-2 bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
								onClick={handleDownload}
								disabled={downloadLoading}
							>
								{downloadLoading ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Download className="h-4 w-4" />
								)}
								Download summary
							</Button>
						</div>
					</header>

					<div className="relative z-10 flex flex-1 flex-col">
						<motion.div
							key={step}
							initial={{ opacity: 0, x: 48 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -48 }}
							transition={{ duration: 0.4, ease: "easeOut" }}
							className="flex-1"
						>
							{slides[step] ? (
								<SlideLayout>
									<div className="space-y-6">
										<div className="space-y-2">
											<Badge className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow">
												AI Wrapped • {step + 1} /{" "}
												{slides.length}
											</Badge>
											<h2 className="text-4xl font-semibold sm:text-5xl lg:text-6xl">
												{slides[step]!.title}
											</h2>
											<p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-300">
												{slides[step]!.subtitle}
											</p>
										</div>
										<div
											className={cn(
												"rounded-3xl border border-white/70 bg-white/80 p-8 shadow-xl backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-900/70",
												"bg-gradient-to-br",
												slides[step]!.accent
											)}
										>
											<div className="rounded-2xl border border-white/40 bg-white/80 p-6 shadow-inner backdrop-blur-sm dark:border-zinc-800/50 dark:bg-zinc-950/70">
												{slides[step]!.content}
											</div>
										</div>
									</div>
								</SlideLayout>
							) : null}
						</motion.div>

						<footer className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
							<div className="flex items-center gap-2">
								{slides.map((_, index) => (
									<button
										key={index}
										type="button"
										onClick={() => onStepChange(index)}
										className={cn(
											"h-2.5 w-8 rounded-full transition",
											index === step
												? "bg-zinc-900 dark:bg-zinc-100"
												: "bg-zinc-400/40 dark:bg-zinc-600/40"
										)}
										aria-label={`Go to slide ${index + 1}`}
									/>
								))}
							</div>

							<div className="flex items-center gap-3">
								<Button
									variant="outline"
									className="gap-2 rounded-full"
									onClick={() =>
										onStepChange(Math.max(step - 1, 0))
									}
									disabled={step === 0}
								>
									<ArrowLeft className="h-4 w-4" />
									Prev
								</Button>
								<Button
									className="gap-2 rounded-full bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
									onClick={() => {
										if (step === slides.length - 1) {
											onClose();
											return;
										}
										onStepChange(
											Math.min(
												step + 1,
												slides.length - 1
											)
										);
									}}
								>
									{step === slides.length - 1 ? (
										<>
											Close
											<X className="h-4 w-4" />
										</>
									) : (
										<>
											Next
											<ArrowRight className="h-4 w-4" />
										</>
									)}
								</Button>
							</div>
						</footer>
					</div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
