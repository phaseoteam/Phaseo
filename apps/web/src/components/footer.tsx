import React from "react";
import Link from "next/link";
import { ThemeSelector } from "@/components/theme-toggle";
import {
	ArrowRightLeft,
	FilePlus,
	Book,
	Milestone,
	Hammer,
	FileText,
	ShieldCheck,
	Database,
	Activity,
	DollarSign,
	Handshake,
	LifeBuoy,
} from "lucide-react";
import LastUpdated from "@/components/last-updated";
import { Button } from "@/components/ui/button";
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
		<footer className="w-full border-t border-border mt-auto bg-white dark:bg-zinc-950">
			<div className="container mx-auto px-4 py-4 text-xs text-muted-foreground flex flex-col gap-4">
				<div className="w-full grid grid-cols-1 gap-6 lg:grid-cols-4 lg:justify-items-center">
					{/* Mobile: compact two-column layout using desktop-like slim buttons */}
					<div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:hidden">
						<div className="flex flex-col items-start gap-2">
							<span className="pl-2 text-sm font-semibold">
								Social
							</span>
							<div className="flex w-full flex-col gap-1">
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link
										href={externalLinks.discord}
										target="_blank"
										rel="noopener noreferrer"
										aria-label="Discord"
									>
										<Logo
											id="discord"
											alt="Discord"
											width={16}
											height={16}
											className="h-4 w-4"
										/>
										<span className="text-xs">Discord</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link
										href={externalLinks.github}
										target="_blank"
										rel="noopener noreferrer"
										aria-label="GitHub"
									>
										<Logo
											id="github"
											alt="GitHub"
											width={16}
											height={16}
											className="h-4 w-4"
										/>
										<span className="text-xs">GitHub</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link
										href={externalLinks.insta}
										target="_blank"
										rel="noopener noreferrer"
										aria-label="Instagram"
									>
										<Logo
											id="instagram"
											alt="Instagram"
											width={16}
											height={16}
											className="h-4 w-4"
										/>
										<span className="text-xs">Instagram</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link
										href={externalLinks.reddit}
										target="_blank"
										rel="noopener noreferrer"
										aria-label="Reddit"
									>
										<Logo
											id="reddit"
											alt="Reddit"
											width={16}
											height={16}
											className="h-4 w-4"
										/>
										<span className="text-xs">Reddit</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link
										href={externalLinks.x}
										target="_blank"
										rel="noopener noreferrer"
										aria-label="X"
									>
										<Logo
											id="x"
											alt="X"
											width={16}
											height={16}
											className="h-4 w-4"
										/>
										<span className="text-xs">X</span>
									</Link>
								</Button>
							</div>
						</div>

						<div className="flex flex-col items-start gap-2">
							<span className="pl-2 text-sm font-semibold">
								Explore
							</span>
							<div className="flex w-full flex-col gap-1">
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link
										href="https://docs.ai-stats.phaseo.app"
										aria-label="Documentation"
									>
										<Book className="h-4 w-4" />
										<span className="text-xs">Docs</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link href="/roadmap" aria-label="Roadmap">
										<Milestone className="h-4 w-4" />
										<span className="text-xs">Roadmap</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link href="/tools" aria-label="Tools">
										<Hammer className="h-4 w-4" />
										<span className="text-xs">Tools</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link href="/migrate" aria-label="Migrate">
										<ArrowRightLeft className="h-4 w-4" />
										<span className="text-xs">Migrate</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link
										href="/tools/pricing-calculator"
										aria-label="Pricing Calculator"
									>
										<DollarSign className="h-4 w-4" />
										<span className="text-xs">Pricing</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link
										href="/works-with"
										aria-label="Works With AI Stats"
									>
										<Handshake className="h-4 w-4" />
										<span className="text-xs">Works With</span>
									</Link>
								</Button>
							</div>
						</div>

						<div className="flex flex-col items-start gap-2">
							<span className="pl-2 text-sm font-semibold">
								More
							</span>
							<div className="flex w-full flex-col gap-1">
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link href="/contribute" aria-label="Contribute">
										<FilePlus className="h-4 w-4" />
										<span className="text-xs">Contribute</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link
										href="/monitor"
										aria-label="Database Monitor"
									>
										<Database className="h-4 w-4" />
										<span className="text-xs">DB Monitor</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link
										href="https://ai-stats-status.stpg.dev/"
										target="_blank"
										rel="noopener noreferrer"
										aria-label="Status"
									>
										<Activity className="h-4 w-4" />
										<span className="text-xs">Status</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link href="/contact" aria-label="Contact">
										<LifeBuoy className="h-4 w-4" />
										<span className="text-xs">Contact</span>
									</Link>
								</Button>
								<ThemeSelector className="h-8 w-full justify-start px-3" />
							</div>
						</div>

						<div className="flex flex-col items-start gap-2">
							<span className="pl-2 text-sm font-semibold">
								Legal
							</span>
							<div className="flex w-full flex-col gap-1">
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link href="/terms" aria-label="Terms of Service">
										<FileText className="h-4 w-4" />
										<span className="text-xs">Terms</span>
									</Link>
								</Button>
								<Button
									asChild
									variant="ghost"
									className="h-8 w-full justify-start px-2"
								>
									<Link
										href="/privacy"
										aria-label="Privacy Policy"
									>
										<ShieldCheck className="h-4 w-4" />
										<span className="text-xs">Privacy</span>
									</Link>
								</Button>
							</div>
						</div>
					</div>

					{/* --- Desktop: Social --- */}
					<div className="hidden lg:flex flex-col items-start gap-2">
						<span className="pl-2 text-sm font-semibold">
							Social
						</span>
						<div className="flex flex-col gap-1">
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href={externalLinks.discord}
									target="_blank"
									rel="noopener noreferrer"
									aria-label="Discord"
								>
									<Logo
										id="discord"
										alt="Discord"
										width={16}
										height={16}
										className="h-4 w-4"
									/>
									<span className="text-xs">Discord</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href={externalLinks.github}
									target="_blank"
									rel="noopener noreferrer"
									aria-label="GitHub"
								>
									<Logo
										id="github"
										alt="GitHub"
										width={16}
										height={16}
										className="h-4 w-4"
									/>
									<span className="text-xs">GitHub</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href={externalLinks.insta}
									target="_blank"
									rel="noopener noreferrer"
									aria-label="Instagram"
								>
									<Logo
										id="instagram"
										alt="Instagram"
										width={16}
										height={16}
										className="h-4 w-4"
									/>
									<span className="text-xs">Instagram</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href={externalLinks.reddit}
									target="_blank"
									rel="noopener noreferrer"
									aria-label="Reddit"
								>
									<Logo
										id="reddit"
										alt="Reddit"
										width={16}
										height={16}
										className="h-4 w-4"
									/>
									<span className="text-xs">Reddit</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href={externalLinks.x}
									target="_blank"
									rel="noopener noreferrer"
									aria-label="X"
								>
									<Logo
										id="x"
										alt="X"
										width={16}
										height={16}
										className="h-4 w-4"
									/>
									<span className="text-xs">X</span>
								</Link>
							</Button>
						</div>
					</div>

					{/* --- Desktop: Explore (Docs + Roadmap + Wrapped) --- */}
					{/* <div className="hidden sm:flex flex-col items-center justify-center"> */}
					<div className="hidden lg:flex flex-col items-start gap-2">
						<span className="pl-2 text-sm font-semibold">
							Explore
						</span>
						<div className="flex flex-col gap-1">
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href="https://docs.ai-stats.phaseo.app"
									aria-label="Documentation"
								>
									<Book className="h-4 w-4" />
									<span className="text-xs">Docs</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link href="/roadmap" aria-label="Roadmap">
									<Milestone className="h-4 w-4" />
									<span className="text-xs">Roadmap</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link href="/tools" aria-label="Tools">
									<Hammer className="h-4 w-4" />
									<span className="text-xs">Tools</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link href="/migrate" aria-label="Migrate">
									<ArrowRightLeft className="h-4 w-4" />
									<span className="text-xs">Migrate</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href="/tools/pricing-calculator"
									aria-label="Pricing Calculator"
								>
									<DollarSign className="h-4 w-4" />
									<span className="text-xs">Pricing</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href="/works-with"
									aria-label="Works With AI Stats"
								>
									<Handshake className="h-4 w-4" />
									<span className="text-xs">Works With</span>
								</Link>
							</Button>
						</div>
					</div>

					{/* --- Desktop: Actions (Contribute, Sources, Theme) --- */}
					<div className="hidden lg:flex flex-col items-start gap-2">
						<span className="pl-2 text-sm font-semibold">More</span>
						<div className="flex flex-col gap-1">
							{/* Contribute */}
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href="/contribute"
									rel="noopener noreferrer"
									aria-label="Contribute"
								>
									<FilePlus className="h-4 w-4" />
									<span className="text-xs">Contribute</span>
								</Link>
							</Button>

							{/* Database Monitor */}
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href="/monitor"
									aria-label="Database Monitor"
								>
									<Database className="h-4 w-4" />
									<span className="text-xs">DB Monitor</span>
								</Link>
							</Button>

							{/* Status */}
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href="https://ai-stats-status.stpg.dev/"
									target="_blank"
									rel="noopener noreferrer"
									aria-label="Status"
								>
									<Activity className="h-4 w-4" />
									<span className="text-xs">Status</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link href="/contact" aria-label="Contact">
									<LifeBuoy className="h-4 w-4" />
									<span className="text-xs">Contact</span>
								</Link>
							</Button>

							{/* Theme */}
							<ThemeSelector />
						</div>
					</div>
					{/* --- Desktop: Legal --- */}
					<div className="hidden lg:flex flex-col items-start gap-2">
						<span className="pl-2 text-sm font-semibold">
							Legal
						</span>
						<div className="flex flex-col gap-1">
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href="/terms"
									aria-label="Terms of Service"
								>
									<FileText className="h-4 w-4" />
									<span className="text-xs">Terms</span>
								</Link>
							</Button>
							<Button
								asChild
								variant="ghost"
								className="w-fit py-1 px-2 h-7"
							>
								<Link
									href="/privacy"
									aria-label="Privacy Policy"
								>
									<ShieldCheck className="h-4 w-4" />
									<span className="text-xs">Privacy</span>
								</Link>
							</Button>
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
						<React.Suspense fallback={null}>
							<LastUpdated deployTime={deployTime} />
						</React.Suspense>
					</div>
				</div>
			</div>
		</footer>
	);
}
