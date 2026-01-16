import React from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import {
	FilePlus,
	Book,
	Milestone,
	Hammer,
	FileText,
	ShieldCheck,
	Database,
	Activity,
} from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import LastUpdated from "@/components/last-updated";
import { Separator } from "@/components/ui/separator";
import { withUTM } from "@/lib/utm";
import { Logo } from "./Logo";

const startYear = 2025;
const currentYear = new Date().getFullYear();
const deployTime = process.env.NEXT_PUBLIC_DEPLOY_TIME ?? "";

const externalLinks = {
	discord: withUTM("https://discord.gg/zDw73wamdX", {
		campaign: "footer-social",
		content: "discord",
	}),
	github: withUTM("https://github.com/AI-Stats/AI-Stats", {
		campaign: "footer-social",
		content: "github",
	}),
	insta: withUTM("https://instagram.com/ai__stats", {
		campaign: "footer-social",
		content: "instagram",
	}),
	reddit: withUTM("https://reddit.com/r/AIStats/", {
		campaign: "footer-social",
		content: "reddit",
	}),
	x: withUTM("https://x.com/ai_stats_team", {
		campaign: "footer-social",
		content: "x",
	}),
};

export default function Footer() {
	return (
		<footer className="w-full border-t border-border mt-auto bg-white dark:bg-zinc-950 px-4">
			<div className="container mx-auto py-4 text-xs text-muted-foreground flex flex-col gap-4">
				<div className="w-full grid grid-cols-1 lg:grid-cols-4 gap-6">
					{/* Mobile grid with icon and text for all actions */}
					<div className="grid grid-cols-2 md:grid-cols-3 gap-3 lg:hidden mb-4">
						{/* --- Social --- */}
						<div className="col-span-2 md:col-span-3 font-semibold text-sm">
							Social
						</div>
						{/* Social: Discord */}
						<Link
							href={externalLinks.discord}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Discord"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors gap-2"
						>
							<Logo
								id="discord"
								alt="Discord"
								width={20}
								height={20}
								className="h-5 w-5"
							/>
							<span className="text-xs">Discord</span>
						</Link>
						{/* Social: GitHub */}
						<Link
							href={externalLinks.github}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="GitHub"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors gap-2"
						>
							<Logo
								id="github"
								alt="GitHub"
								width={20}
								height={20}
								className="h-5 w-5"
							/>
							<span className="text-xs">GitHub</span>
						</Link>
						{/* Social: Instagram */}
						<Link
							href={externalLinks.insta}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Instagram"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-pink-100 dark:hover:bg-pink-900/40 transition-colors gap-2"
						>
							<Logo
								id="instagram"
								alt="Instagram"
								width={20}
								height={20}
								className="h-5 w-5"
							/>
							<span className="text-xs">Instagram</span>
						</Link>
						{/* Social: Reddit */}
						<Link
							href={externalLinks.reddit}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Reddit"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors gap-2"
						>
							<Logo
								id="reddit"
								alt="Reddit"
								width={20}
								height={20}
								className="h-5 w-5"
							/>
							<span className="text-xs">Reddit</span>
						</Link>
						{/* Social: X */}
						<Link
							href={externalLinks.x}
							target="_blank"
							rel="noopener noreferrer"
							aria-label="X"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors gap-2"
						>
							<Logo
								id="x"
								alt="X"
								width={20}
								height={20}
								className="h-5 w-5"
							/>
							<span className="text-xs">X</span>
						</Link>

						<Separator className="col-span-2 md:col-span-3" />

						{/* --- Explore --- */}
						<div className="col-span-2 md:col-span-3 font-semibold text-sm">
							Explore
						</div>
						{/* Docs - mobile */}
						<Link
							href="https://docs.ai-stats.phaseo.app"
							aria-label="Documentation"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors gap-2"
						>
							<Book className="h-5 w-5" />
							<span className="text-xs">Docs</span>
						</Link>
						{/* Roadmap - mobile */}
						<Link
							href="/roadmap"
							aria-label="Roadmap"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors gap-2"
						>
							<Milestone className="h-5 w-5" />
							<span className="text-xs">Roadmap</span>
						</Link>
						{/* Tools - mobile */}
						<Link
							href="/tools"
							aria-label="Tools"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors gap-2"
						>
							<Hammer className="h-5 w-5" />
							<span className="text-xs">Tools</span>
						</Link>
						{/* Wrapped - mobile */}
						{/*
						<Link
							href="/wrapped"
							aria-label="Wrapped"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors gap-2"
						>
							<Gift className="h-5 w-5" />
							<span className="text-xs">Wrapped</span>
						</Link>
						*/}

						<Separator className="col-span-2 md:col-span-3" />

						{/* --- Actions --- */}
						<div className="col-span-2 md:col-span-3 font-semibold text-sm">
							More
						</div>
						{/* Contribute */}
						<Link
							href="/contribute"
							aria-label="Contribute"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover=g-zinc-900 transition-colors gap-2"
						>
							<FilePlus className="h-5 w-5" />
							<span className="text-xs">Contribute</span>
						</Link>
						{/* Database Monitor */}
						<Link
							href="/monitor"
							aria-label="Database Monitor"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors gap-2"
						>
							<Database className="h-5 w-5" />
							<span className="text-xs">DB Monitor</span>
						</Link>
						{/* Status */}
						<Link
							href="https://ai-stats-status.stpg.dev/"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Status"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors gap-2"
						>
							<Activity className="h-5 w-5" />
							<span className="text-xs">Status</span>
						</Link>

						<Separator className="col-span-2 md:col-span-3" />

						{/* --- Legal --- */}
						<div className="col-span-2 md:col-span-3 font-semibold text-sm">
							Legal
						</div>
						<Link
							href="/terms"
							aria-label="Terms of Service"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors gap-2"
						>
							<FileText className="h-5 w-5" />
							<span className="text-xs">Terms</span>
						</Link>
						<Link
							href="/privacy"
							aria-label="Privacy Policy"
							className="flex items-center justify-center h-12 rounded-lg border border-border bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors gap-2"
						>
							<ShieldCheck className="h-5 w-5" />
							<span className="text-xs">Privacy</span>
						</Link>

						<Separator className="col-span-2 md:col-span-3" />

						{/* Theme */}
						<div className="col-span-2 md:col-span-3 flex items-center justify-center">
							<ThemeToggle />
						</div>
					</div>

					{/* --- Desktop: Social --- */}
					<div className="hidden lg:flex flex-col gap-2 items-center lg:items-start">
						<span className="font-semibold text-sm mb-2">
							Social
						</span>
						<div className="flex flex-row gap-2">
							<Link
								href={externalLinks.discord}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Discord"
								className="h-9 w-9 rounded-full border border-border flex items-center justify-center transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-900/40 focus:outline-hidden focus:ring-2 focus:ring-primary"
							>
								<Logo
									id="discord"
									alt="Discord"
									width={20}
									height={20}
									className="h-5 w-5"
								/>
							</Link>
							<Link
								href={externalLinks.github}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="GitHub"
								className="h-9 w-9 rounded-full border border-border flex items-center justify-center transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-primary"
							>
								<Logo
									id="github"
									alt="GitHub"
									width={20}
									height={20}
									className="h-5 w-5"
								/>
							</Link>
							<Link
								href={externalLinks.insta}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Instagram"
								className="h-9 w-9 rounded-full border border-border flex items-center justify-center transition-colors hover:bg-pink-100 dark:hover:bg-pink-900/40 focus:outline-hidden focus:ring-2 focus:ring-primary"
							>
								<Logo
									id="instagram"
									alt="Instagram"
									width={20}
									height={20}
									className="h-5 w-5"
								/>
							</Link>
							<Link
								href={externalLinks.reddit}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="Reddit"
								className="h-9 w-9 rounded-full border border-border flex items-center justify-center transition-colors hover:bg-orange-100 dark:hover:bg-orange-900/40 focus:outline-hidden focus:ring-2 focus:ring-primary"
							>
								<Logo
									id="reddit"
									alt="Reddit"
									width={20}
									height={20}
									className="h-5 w-5"
								/>
							</Link>
							<Link
								href={externalLinks.x}
								target="_blank"
								rel="noopener noreferrer"
								aria-label="X"
								className="h-9 w-9 rounded-full border border-border flex items-center justify-center transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-hidden focus:ring-2 focus:ring-primary"
							>
								<Logo
									id="x"
									alt="X"
									width={20}
									height={20}
									className="h-5 w-5"
								/>
							</Link>
						</div>
					</div>

					{/* --- Desktop: Explore (Docs + Roadmap + Wrapped) --- */}
					{/* <div className="hidden sm:flex flex-col items-center justify-center"> */}
					<div className="hidden lg:flex flex-col gap-2 items-center">
						<span className="font-semibold text-sm mb-2">
							Explore
						</span>
						<div className="flex items-center gap-2">
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Link
											href="https://docs.ai-stats.phaseo.app"
											aria-label="Documentation"
											className="h-9 w-9 rounded-full border border-border flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-primary"
										>
											<Book className="h-4 w-4 text-primary" />
										</Link>
									</TooltipTrigger>
									<TooltipContent side="top" align="center">
										Docs
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Link
											href="/roadmap"
											aria-label="Roadmap"
											className="h-9 w-9 rounded-full border border-border flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-primary"
										>
											<Milestone className="h-4 w-4 text-primary" />
										</Link>
									</TooltipTrigger>
									<TooltipContent side="top" align="center">
										Roadmap
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Link
											href="/tools"
											aria-label="Tools"
											className="h-9 w-9 rounded-full border border-border flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-primary"
										>
											<Hammer className="h-4 w-4 text-primary" />
										</Link>
									</TooltipTrigger>
									<TooltipContent side="top" align="center">
										Tools
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							{/*
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Link
											href="/wrapped"
											aria-label="Wrapped"
											className="h-9 w-9 text-primary rounded-full border border-border flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-primary"
										>
											<Gift className="h-4 w-4" />
										</Link>
									</TooltipTrigger>
									<TooltipContent side="top" align="center">
										Wrapped
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
							*/}
						</div>
					</div>

					{/* --- Desktop: Actions (Contribute, Sources, Theme) --- */}
					<div className="hidden lg:flex flex-col gap-2 items-center justify-center">
						<span className="font-semibold text-sm mb-2">More</span>
						<div className="flex flex-row gap-2">
							{/* Contribute */}
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Link
											href="/contribute"
											rel="noopener noreferrer"
											aria-label="Contribute"
											className="h-9 w-9 text-primary rounded-full border border-border flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-primary"
										>
											<FilePlus className="h-4 w-4" />
										</Link>
									</TooltipTrigger>
									<TooltipContent side="top" align="center">
										Contribute
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							{/* Database Monitor */}
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Link
											href="/monitor"
											aria-label="Database Monitor"
											className="h-9 w-9 text-primary rounded-full border border-border flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-primary"
										>
											<Database className="h-4 w-4" />
										</Link>
									</TooltipTrigger>
									<TooltipContent side="top" align="center">
										Database Monitor
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							{/* Status */}
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Link
											href="https://ai-stats-status.stpg.dev/"
											target="_blank"
											rel="noopener noreferrer"
											aria-label="Status"
											className="h-9 w-9 text-primary rounded-full border border-border flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-primary"
										>
											<Activity className="h-4 w-4" />
										</Link>
									</TooltipTrigger>
									<TooltipContent side="top" align="center">
										Status
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>

							{/* Theme */}
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<ThemeToggle />
									</TooltipTrigger>
									<TooltipContent side="top" align="center">
										Toggle Theme
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>
					{/* --- Desktop: Legal --- */}
					<div className="hidden lg:flex flex-col gap-2 items-end justify-center">
						<span className="font-semibold text-sm mb-2">
							Legal
						</span>
						<div className="flex flex-row gap-2">
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Link
											href="/terms"
											aria-label="Terms of Service"
											className="h-9 w-9 text-primary rounded-full border border-border flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-primary"
										>
											<FileText className="h-4 w-4 text-primary" />
										</Link>
									</TooltipTrigger>
									<TooltipContent side="top" align="center">
										Terms
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
							<TooltipProvider delayDuration={0}>
								<Tooltip>
									<TooltipTrigger asChild>
										<Link
											href="/privacy"
											aria-label="Privacy Policy"
											className="h-9 w-9 text-primary rounded-full border border-border flex items-center justify-center transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-primary"
										>
											<ShieldCheck className="h-4 w-4 text-primary" />
										</Link>
									</TooltipTrigger>
									<TooltipContent side="top" align="center">
										Privacy
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
					</div>
				</div>

				<hr className="border-t border-border" />

				<div className="flex flex-col items-center justify-center">
					<div className="text-center w-full px-4 sm:px-0">
						&copy; {startYear}
						{currentYear > startYear ? ` - ${currentYear}` : ""} AI
						Stats
						<span className="block mt-1">
							If you run into any issues or notice any data
							errors, please visit our GitHub and report an issue.
						</span>
						<LastUpdated deployTime={deployTime} />
					</div>
				</div>
			</div>
		</footer>
	);
}
