import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
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
				"my-6 overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-950 p-4 text-sm text-zinc-100 dark:border-zinc-800",
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
};
