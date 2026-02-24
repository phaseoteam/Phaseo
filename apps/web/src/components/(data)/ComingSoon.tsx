// components/common/ComingSoon.tsx
"use client";

import * as React from "react";
import { Sparkles, Hammer, Clock, Home, Info } from "lucide-react";
import { motion } from "motion/react";

type Action =
	| {
			label: string;
			href: string;
			external?: boolean;
			icon?: React.ReactNode;
	  }
	| { label: string; onClick: () => void; icon?: React.ReactNode };

type Crumb = { label: string; href?: string };

export type ComingSoonProps = {
	title: string;
	subtitle?: string;
	description?: string;
	eta?: Date | string; // e.g., "Q4 2025" or new Date("2025-11-01")
	icon?: React.ReactNode; // override the default icon
	featureList?: string[]; // optional bullets to tease what's coming
	tags?: string[]; // e.g., ["Data", "Benchmarks", "Gateway"]
	primaryAction?: Action;
	secondaryAction?: Action;
	extraActions?: Action[];
	breadcrumb?: Crumb[];
	align?: "center" | "left";
	variant?: "default" | "minimal"; // minimal removes background flourishes
	className?: string;
	children?: React.ReactNode; // if you want to inject custom content below
};

function isLink(a: Action): a is Extract<Action, { href: string }> {
	return (a as any).href !== undefined;
}

function cn(...classes: Array<string | false | null | undefined>) {
	return classes.filter(Boolean).join(" ");
}

function formatEta(eta?: Date | string) {
	if (!eta) return null;
	if (typeof eta === "string") return eta;
	try {
		return eta.toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
		});
	} catch {
		return String(eta);
	}
}

export default function ComingSoon({
	title,
	subtitle,
	description,
	eta,
	icon,
	featureList,
	tags,
	primaryAction,
	secondaryAction,
	extraActions,
	breadcrumb,
	align = "center",
	variant = "minimal",
	className,
	children,
}: ComingSoonProps) {
	const etaText = formatEta(eta);

	const alignment =
		align === "center"
			? "items-center text-center"
			: "items-start text-left";
	const containerPad = "px-4 sm:px-6 lg:px-8";
	const Section = (variant === "default" ? motion.section : "section") as any;

	return (
		<Section
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.35, ease: "easeOut" }}
			className={cn(
				"relative w-full",
				variant === "default"
					? "bg-gradient-to-b from-zinc-50 via-white to-white dark:from-zinc-950 dark:via-zinc-950 dark:to-black"
					: "",
				className
			)}
		>
			{/* Subtle background decoration */}
			{variant === "default" && (
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(60%_50%_at_50%_0%,black,transparent)]"
				>
					<div
						className="absolute inset-x-0 -top-24 mx-auto h-[480px] w-[960px] opacity-25 blur-3xl
                          bg-[conic-gradient(at_50%_33%,theme(colors.indigo.500/30),theme(colors.violet.500/20),transparent_60%)]"
					/>
				</div>
			)}

			<div
				className={cn("mx-auto max-w-5xl py-12 sm:py-16", containerPad)}
			>
				{/* Breadcrumbs */}
				{!!breadcrumb?.length && (
					<nav
						className={cn(
							"mb-6 flex flex-wrap gap-1 text-sm text-zinc-500",
							align === "center" && "justify-center"
						)}
					>
						{breadcrumb.map((c, i) => (
							<span key={i} className="flex items-center gap-1">
								{c.href ? (
									<a
										href={c.href}
										className="hover:text-zinc-900 dark:hover:text-zinc-100 underline-offset-4 underline decoration-transparent hover:decoration-current transition-colors duration-200"
									>
										{c.label}
									</a>
								) : (
									<span>{c.label}</span>
								)}
								{i < breadcrumb.length - 1 && (
									<span aria-hidden>›</span>
								)}
							</span>
						))}
					</nav>
				)}

				<div className={cn("mx-auto grid gap-8", alignment)}>
					{/* Header */}
					<div className={cn("flex flex-col gap-4", alignment)}>
						<div className="flex items-center gap-3">
							<div
								className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200/70 bg-white/80 shadow-sm backdrop-blur
							  dark:border-zinc-800 dark:bg-zinc-900/50"
							>
								{icon ?? (
									<Hammer className="h-5 w-5" aria-hidden />
								)}
							</div>
							{etaText && (
								<div
									className="inline-flex items-center gap-1 rounded-full border border-zinc-200/70 bg-white/80 px-3 py-1 text-xs text-zinc-600 shadow-sm
                                dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400"
								>
									<Clock className="h-3.5 w-3.5" />
									<span>Expected: {etaText}</span>
								</div>
							)}
							{!!tags?.length && (
								<div className="flex flex-wrap gap-2">
									{tags.map((t) => (
										<span
											key={t}
											className="rounded-full border border-zinc-200/70 bg-white/80 px-2.5 py-1 text-xs text-zinc-600 shadow-sm
                                 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400"
										>
											{t}
										</span>
									))}
								</div>
							)}
						</div>

						<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
							{title}
						</h1>

						{subtitle && (
							<p className="text-lg text-zinc-700 dark:text-zinc-300">
								{subtitle}
							</p>
						)}

						{description && (
							<p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
								{description}
							</p>
						)}
					</div>

					{/* Feature teaser */}
					{!!featureList?.length && (
						<div
							className={cn(
								"w-full max-w-2xl",
								align === "center" && "mx-auto"
							)}
						>
							<ul className="grid gap-2">
								{featureList.map((f, i) => (
									<li
										key={i}
										className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400"
									>
										<Sparkles className="mt-0.5 h-4 w-4 flex-none" />
										<span>{f}</span>
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Actions */}
					<div
						className={cn(
							"flex w-full flex-col gap-4",
							align === "center" ? "items-center" : "items-start"
						)}
					>
						<div className="flex flex-wrap items-center gap-2">
							{primaryAction &&
								(isLink(primaryAction) ? (
									<a
										href={primaryAction.href}
										target={
											primaryAction.external
												? "_blank"
												: undefined
										}
										rel={
											primaryAction.external
												? "noreferrer"
												: undefined
										}
										className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm
                               transition hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-100"
									>
										{primaryAction.icon ?? (
											<Info className="h-4 w-4" />
										)}
										{primaryAction.label}
									</a>
								) : (
									<button
										onClick={primaryAction.onClick}
										className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm
                               transition hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-100"
									>
										{primaryAction.icon ?? (
											<Info className="h-4 w-4" />
										)}
										{primaryAction.label}
									</button>
								))}

							{secondaryAction &&
								(isLink(secondaryAction) ? (
									<a
										href={secondaryAction.href}
										target={
											secondaryAction.external
												? "_blank"
												: undefined
										}
										rel={
											secondaryAction.external
												? "noreferrer"
												: undefined
										}
										className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900
                               shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
									>
										{secondaryAction.icon ?? (
											<Home className="h-4 w-4" />
										)}
										{secondaryAction.label}
									</a>
								) : (
									<button
										onClick={secondaryAction.onClick}
										className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900
                               shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
									>
										{secondaryAction.icon ?? (
											<Home className="h-4 w-4" />
										)}
										{secondaryAction.label}
									</button>
								))}

							{extraActions?.map((a, i) =>
								isLink(a) ? (
									<a
										key={i}
										href={a.href}
										target={
											a.external ? "_blank" : undefined
										}
										rel={
											a.external
												? "noreferrer"
												: undefined
										}
										className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900
                               shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
									>
										{a.icon}
										{a.label}
									</a>
								) : (
									<button
										key={i}
										onClick={a.onClick}
										className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900
                               shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
									>
										{a.icon}
										{a.label}
									</button>
								)
							)}
						</div>
					</div>

					{/* Custom content slot */}
					{children && (
						<div
							className={cn(
								"w-full max-w-3xl",
								align === "center" && "mx-auto"
							)}
						>
							{children}
						</div>
					)}

					{/* Info card */}
					<div
						className={cn(
							"mt-4 w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm",
							"dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
							align === "center" && "mx-auto"
						)}
					>
						<div className="flex items-start gap-2">
							<div className="mt-0.5 size-7 shrink-0 grid place-items-center rounded-full border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
								<Hammer className="size-4" />
							</div>

							<p>
								This page is under active development. We’re
								shipping fast - expect frequent updates to every
								page, and docs. If you’ve got ideas, we’d love
								your feedback.
							</p>
						</div>
					</div>
				</div>
			</div>
		</Section>
	);
}

