import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import AnnouncementCounter from "./AnnouncementCounter";
import CliInstallTabs from "./CliInstallTabs";

type AnnouncementCalloutProps = {
	title?: string;
	tone?: "info" | "success" | "warning";
	children: ReactNode;
};

const CALLOUT_TONE_CLASSNAME: Record<
	NonNullable<AnnouncementCalloutProps["tone"]>,
	string
> = {
	info: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
	success:
		"border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
	warning:
		"border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
};

function AnnouncementCallout({
	title,
	tone = "info",
	children,
}: AnnouncementCalloutProps) {
	return (
		<div
			className={cn(
				"my-6 rounded-xl border px-4 py-3",
				CALLOUT_TONE_CLASSNAME[tone]
			)}
		>
			{title ? <p className="mb-1 text-sm font-semibold">{title}</p> : null}
			<div className="text-sm leading-7">{children}</div>
		</div>
	);
}

const socialLinks = [
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
		displayLabel: "Join Discord",
		handle: "discord.gg/aQyywCvgZ5",
		logoId: "discord",
	},
];

const getStartedLinks = [
	{
		href: "https://phaseo.ai/gateway/keys",
		label: "Create a gateway key",
		external: true,
		variant: "primary",
	},
	{
		href: "https://docs.phaseo.ai/v1/quickstart",
		label: "Read the quickstart",
		external: true,
		variant: "secondary",
	},
	{
		href: "/models",
		label: "Browse models",
		external: false,
		variant: "secondary",
	},
];

function AnnouncementSocialLinks() {
	return (
		<div className="my-10 border-y border-zinc-200 py-4 dark:border-zinc-800">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
					Follow Phaseo
				</p>
				<ul className="flex flex-wrap gap-2">
				{socialLinks.map((link) => (
					<li key={link.href}>
						<a
							href={link.href}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={`Follow Phaseo on ${link.label}: ${link.handle}`}
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
							<span>{link.displayLabel ?? link.label}</span>
							{link.displayLabel ? (
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

function AnnouncementGetStartedCta() {
	return (
		<div className="my-10 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-5 dark:border-zinc-800 dark:bg-zinc-900/35 sm:p-6">
			<div className="max-w-xl">
				<p className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
					Start building with Phaseo
				</p>
				<p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
					Get a gateway key, run the quickstart, or compare models before moving traffic.
				</p>
			</div>
			<div className="mt-5 grid gap-2 sm:grid-cols-3">
				{getStartedLinks.map((link) => (
					<Link
						key={link.href}
						href={link.href}
						target={link.external ? "_blank" : undefined}
						rel={link.external ? "noopener noreferrer" : undefined}
						className={cn(
							"group inline-flex h-11 w-full items-center justify-center gap-2 rounded-full px-4 text-center text-sm font-semibold transition active:translate-y-px",
							link.variant === "primary"
								? "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
								: "border border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/70 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
						)}
					>
						<span className="truncate">{link.label}</span>
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

function AnnouncementLink({ href, ...props }: ComponentPropsWithoutRef<"a">) {
	if (!href) {
		return (
			<a
				{...props}
				className="font-medium text-sky-700 underline decoration-sky-400/40 underline-offset-4 transition hover:decoration-sky-500 dark:text-sky-300"
			/>
		);
	}

	if (href.startsWith("/")) {
		return (
			<Link
				href={href}
				className="font-medium text-sky-700 underline decoration-sky-400/40 underline-offset-4 transition hover:decoration-sky-500 dark:text-sky-300"
			>
				{props.children}
			</Link>
		);
	}

	const isExternal = href.startsWith("http://") || href.startsWith("https://");

	return (
		<a
			{...props}
			href={href}
			className="font-medium text-sky-700 underline decoration-sky-400/40 underline-offset-4 transition hover:decoration-sky-500 dark:text-sky-300"
			target={isExternal ? "_blank" : undefined}
			rel={isExternal ? "noopener noreferrer" : undefined}
		/>
	);
}

function InlineCode({ className, ...props }: ComponentPropsWithoutRef<"code">) {
	if (className?.startsWith("language-")) {
		return (
			<code
				{...props}
				className={cn(
					"block whitespace-pre font-mono text-[0.875rem] leading-7 text-zinc-950 dark:text-zinc-100",
					className
				)}
			/>
		);
	}

	return (
		<code
			{...props}
			className={cn(
				"rounded-md bg-zinc-100 px-1.5 py-0.5 text-[0.85em] dark:bg-zinc-800",
				className
			)}
		/>
	);
}

function CodeBlock({ className, ...props }: ComponentPropsWithoutRef<"pre">) {
	return (
		<pre
			{...props}
			className={cn(
				"my-6 overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100",
				className
			)}
		/>
	);
}

export const announcementMdxComponents = {
	h1: (props: ComponentPropsWithoutRef<"h1">) => (
		<h1
			className="mt-8 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-4xl"
			{...props}
		/>
	),
	h2: (props: ComponentPropsWithoutRef<"h2">) => (
		<h2
			className="mt-10 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50"
			{...props}
		/>
	),
	h3: (props: ComponentPropsWithoutRef<"h3">) => (
		<h3
			className="mt-8 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50"
			{...props}
		/>
	),
	p: (props: ComponentPropsWithoutRef<"p">) => (
		<p
			className="mt-4 text-base leading-8 text-zinc-700 dark:text-zinc-300"
			{...props}
		/>
	),
	ul: (props: ComponentPropsWithoutRef<"ul">) => (
		<ul
			className="mt-4 list-disc space-y-2 pl-6 text-base leading-8 text-zinc-700 dark:text-zinc-300"
			{...props}
		/>
	),
	ol: (props: ComponentPropsWithoutRef<"ol">) => (
		<ol
			className="mt-4 list-decimal space-y-2 pl-6 text-base leading-8 text-zinc-700 dark:text-zinc-300"
			{...props}
		/>
	),
	li: (props: ComponentPropsWithoutRef<"li">) => <li className="pl-1" {...props} />,
	hr: (props: ComponentPropsWithoutRef<"hr">) => (
		<hr className="my-8 border-zinc-200 dark:border-zinc-800" {...props} />
	),
	a: AnnouncementLink,
	code: InlineCode,
	pre: CodeBlock,
	img: ({ className, alt, ...props }: ComponentPropsWithoutRef<"img">) => (
		<img
			{...props}
			alt={alt ?? ""}
			loading="lazy"
			className={cn(
				"my-6 h-auto w-full rounded-xl border border-zinc-200 dark:border-zinc-800",
				className
			)}
		/>
	),
	blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
		<blockquote
			className="my-6 border-l-4 border-zinc-300 pl-4 italic text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
			{...props}
		/>
	),
	Callout: AnnouncementCallout,
	Counter: AnnouncementCounter,
	CliInstallTabs,
	SocialLinks: AnnouncementSocialLinks,
	GetStartedCta: AnnouncementGetStartedCta,
};
