import Image from "next/image";
import Link from "next/link";
import { FooterStatusIndicator } from "@/components/FooterStatusIndicator";
import { ThemeSelector } from "@/components/theme-toggle";
import { Logo } from "@/components/Logo";
import { FooterYearRange } from "./FooterYearRange";

const startYear = 2025;

const productLinks = [
	{ href: "/models", label: "Models" },
	{ href: "/chat", label: "Chat" },
	{ href: "/compare", label: "Compare" },
	{ href: "/api-providers", label: "Providers" },
	{ href: "/apps", label: "Apps" },
	{ href: "/rankings", label: "Rankings" },
	{ href: "/monitor", label: "Monitor" },
];

const developerLinks = [
	{ href: "https://phaseo.app/docs/v1", label: "Documentation", external: true },
	{
		href: "https://phaseo.app/docs/v1/api-reference/introduction",
		label: "API Reference",
		external: true,
	},
	{ href: "https://phaseo.app/docs/v1/quickstart", label: "Quickstart", external: true },
	{
		href: "https://phaseo.app/docs/v1/sdk-reference/typescript/overview",
		label: "SDKs",
		external: true,
	},
	{ href: "/methodology", label: "Methodology" },
];

const companyLinks = [
	{ href: "/blog", label: "Blog" },
	{ href: "/pricing", label: "Pricing" },
	{ href: "/works-with", label: "Works With" },
	{ href: "/contact", label: "Support" },
	{ href: "/privacy", label: "Privacy" },
	{ href: "/terms", label: "Terms" },
];

const communityLinks = [
	{
		href: "https://discord.gg/aQyywCvgZ5",
		label: "Discord",
		logoId: "discord",
		external: true,
	},
	{
		href: "https://github.com/phaseoteam/Phaseo",
		label: "GitHub",
		logoId: "github",
		external: true,
	},
	{
		href: "https://www.linkedin.com/company/phaseoapp/",
		label: "LinkedIn",
		logoId: "linkedin",
		external: true,
	},
	{
		href: "https://www.reddit.com/r/Phaseo/",
		label: "Reddit",
		logoId: "reddit",
		external: true,
	},
	{ href: "https://x.com/phaseoteam", label: "X", logoId: "x", external: true },
];

type FooterLink = {
	href: string;
	label: string;
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
	return (
		<div className="flex flex-col gap-2">
			<h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
				{title}
			</h3>
			<ul className="flex flex-wrap gap-x-3 gap-y-1.5 lg:block lg:space-y-1.5">
				{links.map((link) => (
					<li key={`${title}-${link.href}`}>
						<Link
							href={link.href}
							prefetch={link.external ? undefined : false}
							target={link.external ? "_blank" : undefined}
							rel={link.external ? "noopener noreferrer" : undefined}
							className="group inline-flex items-center text-sm text-zinc-600 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/70 dark:text-zinc-400 dark:hover:text-zinc-50"
						>
							{link.label}
							{link.logoId ? (
								<span
									aria-hidden="true"
									className="ml-0 inline-flex h-4 w-0 translate-x-1 items-center justify-center overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-2 group-hover:w-4 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:w-4 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
								>
									<Logo
										id={link.logoId}
										alt=""
										width={14}
										height={14}
										className="h-3.5 w-3.5 object-contain"
									/>
								</span>
							) : null}
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}

export default function Footer() {
	return (
		<footer className="mt-auto w-full border-t border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950">
			<div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
				<div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,0.8fr))]">
					<div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
						<Link href="/" className="inline-flex w-fit items-center">
							<Image
								src="/wordmark_light.svg"
								alt="Phaseo"
								width={154}
								height={40}
								className="h-7 w-auto dark:hidden"
								style={{ width: "auto" }}
							/>
							<Image
								src="/wordmark_dark.svg"
								alt="Phaseo"
								width={154}
								height={40}
								className="hidden h-7 w-auto dark:block"
								style={{ width: "auto" }}
							/>
						</Link>
						<ThemeSelector className="py-1" labelSize="sm" />
					</div>
					<FooterLinkList title="Explore" links={productLinks} />
					<FooterLinkList title="Build" links={developerLinks} />
					<FooterLinkList title="Company" links={companyLinks} />
					<div className="grid gap-3">
						<FooterLinkList title="Community" links={communityLinks} />
					</div>
				</div>

				<div className="flex flex-col gap-2 border-t border-zinc-200/80 pt-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
						<p className="font-medium tracking-[0.01em] text-zinc-500 dark:text-zinc-400">
							&copy; <FooterYearRange startYear={startYear} /> {"\u2022"} Phaseo
						</p>
						<FooterStatusIndicator />
					</div>
					<p className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
						<span>Spotted a data issue or broken page?</span>
						<Link
							href="https://github.com/phaseoteam/Phaseo/issues"
							target="_blank"
							rel="noopener noreferrer"
							className="text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
						>
							Open an issue
						</Link>
						<span>or</span>
						<Link
							href="/contact"
							className="text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50"
						>
							contact support
						</Link>
					</p>
				</div>
			</div>
		</footer>
	);
}
