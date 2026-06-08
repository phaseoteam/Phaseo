"use client";

import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
	Activity,
	AppWindow,
	ArrowUpRight,
	BookOpenText,
	Boxes,
	Code2,
	FileText,
	GitBranch,
	LifeBuoy,
	MessageSquare,
	Megaphone,
	Scale,
	Server,
	ShieldCheck,
	Sparkles,
	Trophy,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { ThemeSelector } from "@/components/theme-toggle";
import { Logo } from "./Logo";
import { FooterYearRange } from "./FooterYearRange";

const startYear = 2025;

const productLinks = [
	{ href: "/models", label: "Models", icon: Boxes },
	{ href: "/chat", label: "Playground", icon: MessageSquare },
	{ href: "/compare", label: "Compare", icon: Scale },
	{ href: "/api-providers", label: "Providers", icon: Server },
	{ href: "/apps", label: "Apps", icon: AppWindow },
	{ href: "/rankings", label: "Rankings", icon: Trophy },
];

const developerLinks = [
	{
		href: "https://docs.ai-stats.phaseo.app/v1",
		label: "Documentation",
		icon: BookOpenText,
		external: true,
	},
	{
		href: "https://docs.ai-stats.phaseo.app/v1/api-reference/introduction",
		label: "API Reference",
		icon: Code2,
		external: true,
	},
	{
		href: "https://docs.ai-stats.phaseo.app/v1/quickstart",
		label: "Quickstart",
		icon: Sparkles,
		external: true,
	},
	{
		href: "https://docs.ai-stats.phaseo.app/v1/sdk-reference/typescript/overview",
		label: "SDKs",
		icon: GitBranch,
		external: true,
	},
	{
		href: "/methodology",
		label: "Methodology",
		icon: FileText,
	},
	{
		href: "https://ai-stats.instatus.com/",
		label: "Status",
		icon: Activity,
		external: true,
	},
];

const companyLinks = [
	{ href: "/announcements", label: "Announcements", icon: Megaphone },
	{ href: "/pricing", label: "Pricing", icon: Sparkles },
	{ href: "/works-with", label: "Works With", icon: AppWindow },
	{ href: "/contact", label: "Support", icon: LifeBuoy },
	{ href: "/privacy", label: "Privacy", icon: ShieldCheck },
	{ href: "/terms", label: "Terms", icon: FileText },
];

const connectLinks = [
	{ href: "https://discord.gg/zDw73wamdX", label: "Discord", logoId: "discord", external: true },
	{ href: "https://github.com/AI-Stats/AI-Stats", label: "GitHub", logoId: "github", external: true },
	{ href: "https://reddit.com/r/AIStats/", label: "Reddit", logoId: "reddit", external: true },
	{ href: "https://www.linkedin.com/company/phaseoapp/", label: "LinkedIn", logoId: "linkedin", external: true },
	{ href: "https://x.com/ai_stats_team", label: "X", logoId: "x", external: true },
];

const featuredLinks = [
	{
		href: "https://docs.ai-stats.phaseo.app/v1",
		label: "Read the docs",
		icon: BookOpenText,
		external: true,
	},
	{
		href: "https://ai-stats.instatus.com/",
		label: "Check status",
		icon: Activity,
		external: true,
	},
	{
		href: "https://github.com/AI-Stats/AI-Stats",
		label: "View GitHub",
		logoId: "github",
		external: true,
	},
];

type FooterLink = {
	href: string;
	label: string;
	icon?: LucideIcon;
	logoId?: string;
	external?: boolean;
};

function FooterLinkList({
	title,
	links,
}: {
	title: string;
	links: FooterLink[];
}) {
	const reduceMotion = useReducedMotion();

	return (
		<div className="flex flex-col gap-3">
			<h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
				{title}
			</h3>
			<ul className="space-y-1.5">
				{links.map((link) => (
					<motion.li
						key={`${title}-${link.href}`}
						whileHover={reduceMotion ? undefined : { x: 3 }}
						transition={
							reduceMotion
								? { duration: 0 }
								: {
										type: "spring",
										stiffness: 320,
										damping: 26,
										mass: 0.7,
									}
						}
					>
						<Link
							href={link.href}
							prefetch={link.external ? undefined : false}
							target={link.external ? "_blank" : undefined}
							rel={link.external ? "noopener noreferrer" : undefined}
							className="group inline-flex items-center gap-2 rounded-md py-1 text-sm text-zinc-600 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
						>
							<motion.span
								className="flex h-[1.5rem] w-[1.5rem] shrink-0 items-center justify-center rounded-md bg-zinc-100 p-1 text-zinc-500 transition-colors group-hover:bg-zinc-200 group-hover:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-400 dark:group-hover:bg-zinc-800 dark:group-hover:text-zinc-100"
								whileHover={
									reduceMotion
										? undefined
										: { scale: 1.08, y: -1, rotate: link.logoId ? 0 : -4 }
								}
								transition={
									reduceMotion
										? { duration: 0 }
										: {
												type: "spring",
												stiffness: 360,
												damping: 24,
												mass: 0.7,
											}
								}
							>
								{link.logoId ? (
									<Logo
										id={link.logoId}
										alt={link.label}
										width={12}
										height={12}
										className="h-3 w-3"
									/>
								) : link.icon ? (
									<link.icon className="h-3.5 w-3.5" />
								) : null}
							</motion.span>
							{link.label}
							{link.external ? (
								<motion.span
									className="flex"
									whileHover={
										reduceMotion
											? undefined
											: { x: 1.5, y: -1.5, opacity: 1 }
									}
									initial={reduceMotion ? undefined : { opacity: 0.5 }}
									transition={
										reduceMotion
											? { duration: 0 }
											: {
													type: "spring",
													stiffness: 340,
													damping: 24,
												}
									}
								>
									<ArrowUpRight className="h-3.5 w-3.5 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100" />
								</motion.span>
							) : null}
						</Link>
					</motion.li>
				))}
			</ul>
		</div>
	);
}

export default function Footer() {
	const reduceMotion = useReducedMotion();

	return (
		<footer className="mt-auto w-full border-t border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950">
			<div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
				<div className="grid items-start gap-10 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,0.8fr))] xl:grid-rows-[auto_auto]">
					<div className="flex flex-col gap-5 sm:col-span-2 xl:col-span-1 xl:row-span-2">
						<Link href="/" className="inline-flex w-fit items-center">
							<Image
								src="/wordmark_light.svg"
								alt="AI Stats"
								width={154}
								height={40}
								className="h-8 w-auto dark:hidden"
							/>
							<Image
								src="/wordmark_dark.svg"
								alt="AI Stats"
								width={154}
								height={40}
								className="hidden h-8 w-auto dark:block"
							/>
						</Link>
						<p className="max-w-xs text-sm leading-6 text-zinc-600 dark:text-zinc-400">
							AI Stats by Phaseo brings together model, provider, and gateway
							data for teams building with AI APIs.
						</p>
						<div className="grid gap-2 sm:max-w-none sm:grid-cols-3 xl:max-w-sm xl:grid-cols-1">
							{featuredLinks.map((link) => (
								<motion.div
									key={link.href}
									whileHover={
										reduceMotion
											? undefined
											: { y: -2, x: 2, scale: 1.01 }
									}
									transition={
										reduceMotion
											? { duration: 0 }
											: {
													type: "spring",
													stiffness: 320,
													damping: 24,
													mass: 0.8,
												}
									}
								>
									<Link
										href={link.href}
										target={link.external ? "_blank" : undefined}
										rel={link.external ? "noopener noreferrer" : undefined}
										className="group inline-flex w-full items-center justify-between rounded-xl border border-zinc-200/80 px-3 py-2.5 text-sm text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
									>
										<span className="inline-flex items-center gap-2">
							<motion.span
												className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 p-[5px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
												whileHover={
													reduceMotion
														? undefined
														: { scale: 1.08, rotate: link.logoId ? 0 : -6 }
												}
												transition={
													reduceMotion
														? { duration: 0 }
														: {
																type: "spring",
																stiffness: 360,
																damping: 24,
																mass: 0.7,
															}
												}
											>
												{link.logoId ? (
													<Logo
														id={link.logoId}
														alt={link.label}
														width={16}
														height={16}
														className="h-4 w-4"
													/>
												) : link.icon ? (
													<link.icon className="h-4 w-4" />
												) : null}
											</motion.span>
											<motion.span
												whileHover={reduceMotion ? undefined : { x: 1.5 }}
												transition={
													reduceMotion
														? { duration: 0 }
														: {
																type: "spring",
																stiffness: 320,
																damping: 26,
															}
												}
											>
												{link.label}
											</motion.span>
										</span>
										<motion.span
											whileHover={
												reduceMotion
													? undefined
													: { x: 2, y: -2, opacity: 1 }
											}
											initial={reduceMotion ? undefined : { opacity: 0.7 }}
											transition={
												reduceMotion
													? { duration: 0 }
													: {
															type: "spring",
															stiffness: 320,
															damping: 24,
														}
											}
										>
											<ArrowUpRight className="h-4 w-4 text-zinc-400 transition-transform group-hover:text-zinc-700 dark:group-hover:text-zinc-200" />
										</motion.span>
									</Link>
								</motion.div>
							))}
						</div>
					</div>

					<FooterLinkList title="Explore" links={productLinks} />
					<FooterLinkList title="Build" links={developerLinks} />
					<FooterLinkList title="Company" links={companyLinks} />
					<div className="grid gap-4">
						<FooterLinkList title="Community" links={connectLinks} />
						<div className="pt-2 xl:hidden">
							<ThemeSelector
								className="py-1"
								labelSize="sm"
							/>
						</div>
					</div>
					<div className="hidden xl:flex xl:col-start-5 xl:row-start-2 xl:self-end">
						<ThemeSelector
							className="py-1"
							labelSize="sm"
						/>
					</div>
				</div>

				<div className="flex flex-col gap-2 border-t border-zinc-200/80 pt-5 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
					<p className="inline-flex items-center px-2 py-1 font-medium tracking-[0.01em] text-zinc-500 dark:text-zinc-400">
                        &copy; <FooterYearRange startYear={startYear} /> {"\u2022"} AI Stats
					</p>
					<p className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
						<span>Spotted a data issue or broken page?</span>
						<Link
							href="https://github.com/AI-Stats/AI-Stats/issues"
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex items-center gap-1 text-zinc-700 transition-colors hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
						>
							<span>Open an issue</span>
							<ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
						</Link>
						<span>or</span>
						<Link
							href="/contact"
							className="group inline-flex items-center gap-1 text-zinc-700 transition-colors hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
						>
							<span>contact support</span>
							<ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
						</Link>
					</p>
				</div>
			</div>
		</footer>
	);
}
