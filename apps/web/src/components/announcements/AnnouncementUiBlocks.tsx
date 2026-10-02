"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { getLocalizedDocsHref } from "@/lib/docs";

const socialLinks: Array<{
	href: string;
	label: string;
	handle: string;
	logoId: string;
	showJoinLabel?: boolean;
}> = [
	{
		href: "https://x.com/phaseoteam",
		label: "X",
		handle: "@phaseoteam",
		logoId: "x",
	},
	{
		href: "https://www.linkedin.com/company/phaseoapp/",
		label: "LinkedIn",
		handle: "@phaseoapp",
		logoId: "linkedin",
	},
	{
		href: "https://www.reddit.com/r/Phaseo/",
		label: "Reddit",
		handle: "r/Phaseo",
		logoId: "reddit",
	},
	{
		href: "https://github.com/phaseoteam/Phaseo",
		label: "GitHub",
		handle: "@phaseoteam/Phaseo",
		logoId: "github",
	},
	{
		href: "https://discord.gg/aQyywCvgZ5",
		label: "Discord",
		handle: "discord.gg/aQyywCvgZ5",
		logoId: "discord",
		showJoinLabel: true,
	},
];

const getStartedLinks = [
	{
		href: "https://phaseo.app/gateway/keys",
		label: "getGatewayKey",
		external: true,
		variant: "primary",
	},
	{
		href: "https://phaseo.app/docs/v1/quickstart",
		label: "readQuickstart",
		external: true,
		variant: "secondary",
	},
	{
		href: "/models",
		label: "browseModels",
		external: false,
		variant: "secondary",
	},
] as const;

export function AnnouncementSocialLinks() {
	const t = useTranslations("Content.announcementComponents");
	return (
		<div className="my-10 border-y border-zinc-200 py-4 dark:border-zinc-800">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
					{t("followPhaseo")}
				</p>
				<ul className="flex flex-wrap gap-2">
					{socialLinks.map((link) => (
						<li key={link.href}>
							<a
								href={link.href}
								target="_blank"
								rel="noopener noreferrer"
								aria-label={t("followOn", {
									platform: link.label,
									handle: link.handle,
								})}
								title={link.handle}
								className="group inline-flex h-9 items-center gap-2 rounded-full border border-zinc-200 bg-white/70 px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-white hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
							>
								<span className="relative h-4 w-4 shrink-0">
									<Logo
										id={link.logoId}
										alt={link.label}
										variant="color"
										fill
										sizes="16px"
										className="object-contain object-center"
									/>
								</span>
								<span>{link.showJoinLabel ? t("joinDiscord") : link.label}</span>
								{link.showJoinLabel ? (
									<ArrowUpRight className="h-3.5 w-3.5 shrink-0 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
								) : null}
							</a>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

export function AnnouncementGetStartedCta() {
	const t = useTranslations("Content.announcementComponents");
	const locale = useLocale();
	return (
		<div className="my-10 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/35 sm:p-6">
			<div className="max-w-xl">
				<p className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
					{t("getStartedTitle")}
				</p>
				<p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
					{t("getStartedDescription")}
				</p>
			</div>
			<div className="mt-5 grid gap-2 sm:grid-cols-3">
				{getStartedLinks.map((link) => (
					<Link
						key={link.href}
						href={link.href.startsWith("https://phaseo.app/docs/") ? getLocalizedDocsHref(locale, link.href) : link.href}
						target={link.external ? "_blank" : undefined}
						rel={link.external ? "noopener noreferrer" : undefined}
						className={cn(
							"group inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-center text-sm font-semibold transition active:translate-y-px",
							link.variant === "primary"
								? "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
								: "border border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-900",
						)}
					>
						<span className="truncate">{t(link.label)}</span>
						{link.variant === "primary" ? (
							<ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
						) : (
							<ArrowUpRight className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
						)}
					</Link>
				))}
			</div>
		</div>
	);
}
