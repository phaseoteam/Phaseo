"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { ComponentType } from "react";
import { useQueryState } from "nuqs";
import {
	ArrowRight,
	ArrowUpRight,
	BookOpen,
	Bug,
	CheckCircle2,
	Inbox,
	LifeBuoy,
	LineChart,
	Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Logo } from "@/components/Logo";

type ContactMethod = {
	key: string;
	title: string;
	description: string;
	href: string;
	cta: string;
	external?: boolean;
	icon?: ComponentType<{ className?: string }>;
	logoId?: string;
};

type IssueOption = {
	value: string;
	label: string;
	helper: string;
	recommendationKey: string;
	icon: ComponentType<{ className?: string }>;
};

const METHODS: ContactMethod[] = [
	{
		key: "support",
		title: "Private support ticket",
		description: "Best for account, billing, data, or implementation issues.",
		href: "#support-form",
		cta: "Create ticket",
		icon: Inbox,
	},
	{
		key: "github",
		title: "GitHub",
		description: "Best for reproducible bugs, feature requests, and public tracking.",
		href: "/github",
		cta: "Open GitHub",
		external: true,
		logoId: "github",
	},
	{
		key: "discord",
		title: "Discord",
		description: "Best for quick setup questions and lightweight community feedback.",
		href: "/discord",
		cta: "Join Discord",
		logoId: "discord",
	},
	{
		key: "docs",
		title: "Docs",
		description: "Best for gateway guides, SDK examples, model references, and quick starts.",
		href: "/docs",
		cta: "Read docs",
		icon: BookOpen,
	},
];

const ISSUE_OPTIONS: IssueOption[] = [
	{
		value: "billing",
		label: "Billing or account issue",
		helper:
			"Create a private support ticket and we will reply to the email address you provide.",
		recommendationKey: "support",
		icon: Inbox,
	},
	{
		value: "bug",
		label: "Bug or outage",
		helper:
			"Use GitHub when the issue is reproducible and useful for other users to track.",
		recommendationKey: "github",
		icon: Bug,
	},
	{
		value: "data",
		label: "Data or metrics issue",
		helper:
			"Create a private ticket with model IDs, provider names, URLs, and timestamps.",
		recommendationKey: "support",
		icon: LineChart,
	},
	{
		value: "docs",
		label: "Docs or integration question",
		helper:
			"Start with the docs. If the answer is missing, send a ticket with the exact page.",
		recommendationKey: "docs",
		icon: BookOpen,
	},
	{
		value: "feature",
		label: "Feature request",
		helper:
			"Open a GitHub issue with the workflow, expected behavior, and why it matters.",
		recommendationKey: "github",
		icon: Sparkles,
	},
	{
		value: "general",
		label: "General question",
		helper:
			"Create a private support ticket and include enough context for a direct reply.",
		recommendationKey: "support",
		icon: LifeBuoy,
	},
	{
		value: "community",
		label: "Community or quick feedback",
		helper:
			"Use Discord when you want a lightweight answer or discussion with other users.",
		recommendationKey: "discord",
		icon: LifeBuoy,
	},
];
const ISSUE_VALUES = new Set(ISSUE_OPTIONS.map((option) => option.value));

const TAWK_PROPERTY_ID = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID ?? "";
const TAWK_WIDGET_ID = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID ?? "default";

type TawkApi = {
	hideWidget?: () => void;
	maximize?: () => void;
	onChatMinimized?: () => void;
	onLoad?: () => void;
	setAttributes?: (
		attributes: Record<string, string>,
		callback?: (error?: unknown) => void
	) => void;
	showWidget?: () => void;
};

declare global {
	interface Window {
		Tawk_API?: TawkApi;
		Tawk_LoadStart?: Date;
	}
}

type ContactClientProps = {
	isOpen?: boolean;
	isAuthenticated?: boolean;
	londonTimeLabel?: string;
	statusLabel?: string;
	statusTone?: string;
	waitText?: string;
	userEmail?: string | null;
	tierLabel?: string;
	defaultInternalId?: string;
};

function MethodIcon({ method }: { method: ContactMethod }) {
	const Icon = method.icon ?? ArrowUpRight;

	if (method.logoId) {
		return (
			<Logo
				id={method.logoId}
				alt={method.title}
				width={18}
				height={18}
				className="size-[18px]"
			/>
		);
	}

	return <Icon className="size-4" />;
}

function SupportTimeHint({ londonTimeLabel }: { londonTimeLabel?: string }) {
	const [now, setNow] = useState<Date | null>(null);

	useEffect(() => {
		const update = () => setNow(new Date());
		update();
		const interval = window.setInterval(update, 60_000);
		return () => window.clearInterval(interval);
	}, []);

	const localTimeLabel = useMemo(() => {
		if (!now) return null;
		return new Intl.DateTimeFormat(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			timeZoneName: "short",
		}).format(now);
	}, [now]);

	const liveLondonTimeLabel = useMemo(() => {
		if (!now) return londonTimeLabel || "Europe/London";
		return new Intl.DateTimeFormat("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
			timeZone: "Europe/London",
			timeZoneName: "short",
		}).format(now);
	}, [londonTimeLabel, now]);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex w-fit items-center rounded-full border border-border/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
					Your time {localTimeLabel ?? "checking..."}
				</span>
			</TooltipTrigger>
			<TooltipContent>
				Phaseo support time: {liveLondonTimeLabel}
			</TooltipContent>
		</Tooltip>
	);
}

function TawkSupportLauncher({
	defaultInternalId,
	issueLabel,
	supportIsOpen,
	tierLabel,
	userEmail,
}: {
	defaultInternalId?: string;
	issueLabel?: string;
	supportIsOpen: boolean;
	tierLabel?: string;
	userEmail?: string | null;
}) {
	const [chatStatus, setChatStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
	const isConfigured = Boolean(TAWK_PROPERTY_ID);
	const canStartChat = isConfigured && supportIsOpen;
	const directChatHref = isConfigured
		? `https://tawk.to/chat/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`
		: "";
	const emailHref = useMemo(() => {
		const subject = issueLabel
			? `[Phaseo Support] ${issueLabel}`
			: "[Phaseo Support] Support request";
		const body = [
			"Hi Phaseo team,",
			"",
			"I need help with:",
			"",
			"Summary:",
			"",
			"Details:",
			"",
			"Useful context:",
			`- Issue type: ${issueLabel ?? "Not selected"}`,
			`- Account email: ${userEmail ?? ""}`,
			`- Workspace: ${defaultInternalId ?? ""}`,
			`- Plan: ${tierLabel ?? ""}`,
			"- Page URL:",
			"- Request ID:",
			"- Model ID / provider:",
			"- Time observed:",
			"",
			"Attachments/screenshots:",
			"",
		].join("\n");

		return `mailto:support@phaseo.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	}, [defaultInternalId, issueLabel, tierLabel, userEmail]);
	const openChat = () => {
		if (!canStartChat) return;

		const setVisitorAttributes = () => {
			const attributes: Record<string, string> = {};
			if (userEmail) attributes.email = userEmail;
			if (defaultInternalId) attributes.workspace = defaultInternalId;
			if (tierLabel) attributes.plan = tierLabel;
			if (issueLabel) attributes.issue_type = issueLabel;

			if (Object.keys(attributes).length > 0) {
				window.Tawk_API?.setAttributes?.(attributes);
			}
		};

		const showChat = () => {
			setVisitorAttributes();
			window.Tawk_API?.showWidget?.();
			window.Tawk_API?.maximize?.();
			setChatStatus("ready");
		};

		if (window.Tawk_API?.maximize) {
			showChat();
			return;
		}

		setChatStatus("loading");
		window.Tawk_API = window.Tawk_API ?? {};
		window.Tawk_API.onLoad = showChat;
		window.Tawk_API.onChatMinimized = () => {
			window.Tawk_API?.hideWidget?.();
		};
		window.Tawk_LoadStart = new Date();

		if (!document.getElementById("phaseo-tawk-widget")) {
			const script = document.createElement("script");
			const firstScript = document.getElementsByTagName("script")[0];
			script.id = "phaseo-tawk-widget";
			script.async = true;
			script.src = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;
			script.charset = "UTF-8";
			script.setAttribute("crossorigin", "*");
			script.onerror = () => setChatStatus("error");
			firstScript.parentNode?.insertBefore(script, firstScript);
		}

		window.setTimeout(() => {
			if (!window.Tawk_API?.maximize) {
				setChatStatus("error");
			}
		}, 12_000);
	};

	return (
		<div className="rounded-2xl border border-border/60 px-4 py-4">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="text-sm font-medium">Live chat or email</p>
					<p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
						Start a live chat from this page, or open a prefilled email with
						the context we need.
					</p>
					{userEmail ? (
						<p className="mt-2 text-xs text-muted-foreground">
							Signed in as {userEmail}
						</p>
					) : null}
					{isConfigured ? null : (
						<p className="mt-2 text-xs text-muted-foreground">
							Live chat needs `NEXT_PUBLIC_TAWK_PROPERTY_ID` before it can load.
						</p>
					)}
					{isConfigured && !supportIsOpen ? (
						<p className="mt-2 text-xs text-muted-foreground">
							Live chat is available during support hours. Email is still open.
						</p>
					) : null}
				</div>
				<div className="flex flex-col gap-2 sm:min-w-52">
					{isConfigured ? (
						<Button
							type="button"
							className="w-full"
							disabled={!canStartChat || chatStatus === "loading"}
							onClick={openChat}
						>
							{!supportIsOpen
								? "Live chat offline"
								: chatStatus === "loading"
									? "Loading chat..."
									: "Start live chat"}
							<ArrowUpRight className="size-4" />
						</Button>
					) : (
						<Button type="button" className="w-full" disabled>
							Live chat unavailable
							<ArrowUpRight className="size-4" />
						</Button>
					)}
					<Button asChild type="button" variant="outline" className="w-full">
						<a href={emailHref}>
							Send email
							<ArrowRight className="size-4" />
						</a>
					</Button>
					{chatStatus === "error" ? (
						<Button asChild type="button" variant="ghost" className="w-full">
							<a href={directChatHref} target="_blank" rel="noreferrer">
								Open chat in new tab
								<ArrowUpRight className="size-4" />
							</a>
						</Button>
					) : null}
				</div>
			</div>
		</div>
	);
}

export function ContactClient({
	isOpen,
	londonTimeLabel,
	statusLabel,
	statusTone,
	waitText,
	userEmail,
	tierLabel,
	defaultInternalId,
}: ContactClientProps) {
	const resolvedStatusLabel = statusLabel ?? "Support";
	const resolvedStatusTone = statusTone ?? "bg-amber-500 ring-amber-400/60";
	const resolvedWaitText = waitText ?? "Support replies resume soon.";
	const statusDotClass =
		resolvedStatusTone
			.split(" ")
			.find((value) => value.startsWith("bg-")) ?? "bg-muted-foreground";

	const [issueParam, setIssueParam] = useQueryState("support", {
		defaultValue: "",
	});
	const issueValue = ISSUE_VALUES.has(issueParam) ? issueParam : "";

	const selectedIssue = useMemo(
		() => ISSUE_OPTIONS.find((option) => option.value === issueValue),
		[issueValue]
	);

	const recommendedMethod = useMemo(() => {
		if (!selectedIssue) return null;
		return (
			METHODS.find((method) => method.key === selectedIssue.recommendationKey) ??
			null
		);
	}, [selectedIssue]);

	const showTicketForm = recommendedMethod?.key === "support";
	const otherMethods = useMemo(
		() => METHODS.filter((method) => method.key !== recommendedMethod?.key),
		[recommendedMethod]
	);

	return (
		<TooltipProvider>
			<div className="container mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
			<header className="grid gap-8 border-b border-border/60 pb-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
				<div className="max-w-3xl space-y-4">
					<h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
						Contact Phaseo support
					</h1>
					<p className="max-w-2xl text-base leading-7 text-muted-foreground">
						Tell us what you need, and we will route you to the right place.
						Private account issues become support tickets. Public bugs, feature
						requests, and quick questions go to the channel that fits.
					</p>
				</div>

				<div className="rounded-2xl border border-border/60 px-4 py-3 text-sm">
					<div className="flex items-center gap-2 font-medium text-foreground">
						<span className="relative flex size-2.5">
							<span
								className={cn(
									"absolute inline-flex size-full animate-ping rounded-full opacity-60",
									statusDotClass
								)}
							/>
							<span
								className={cn("relative inline-flex size-2.5 rounded-full", statusDotClass)}
							/>
						</span>
						Support {resolvedStatusLabel}
					</div>
					<p className="mt-3 leading-6 text-muted-foreground">
						{resolvedWaitText}
					</p>
					<div className="mt-3">
						<SupportTimeHint londonTimeLabel={londonTimeLabel} />
					</div>
				</div>
			</header>

			<main id="support-form" className="scroll-mt-24 space-y-8 py-8">
				<section aria-labelledby="support-router-title" className="space-y-5">
					<div>
						<p className="mb-2 text-xs font-medium text-muted-foreground">
							Step 1
						</p>
						<h2 id="support-router-title" className="text-xl font-semibold">
							What do you need help with?
						</h2>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
							Pick the closest option and we will show the next step below.
						</p>

						<div className="mt-5 max-w-xl">
							<Select
								value={issueValue}
								onValueChange={(value) => {
									void setIssueParam(value);
								}}
							>
								<SelectTrigger className="h-11 w-full rounded-2xl px-4">
									{selectedIssue ? (
										<span>{selectedIssue.label}</span>
									) : (
										<SelectValue placeholder="Choose an issue type" />
									)}
								</SelectTrigger>
								<SelectContent>
									{ISSUE_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</section>

				{selectedIssue && recommendedMethod ? (
					<>
						<section className="border-t border-border/60 pt-6">
						<div className="space-y-6">
							<div className="space-y-4">
								<p className="text-xs font-medium text-muted-foreground">
									Step 2
								</p>
								<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
									<div className="flex gap-3">
										<span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted/60 text-foreground">
											<MethodIcon method={recommendedMethod} />
										</span>
										<div className="space-y-1">
											<p className="flex items-center gap-2 text-sm font-medium">
												<CheckCircle2 className="size-4 text-emerald-500" />
												Recommended: {recommendedMethod.title}
											</p>
											<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
												{selectedIssue.helper}
											</p>
										</div>
									</div>

									{showTicketForm ? null : (
										<Button asChild className="w-full sm:w-auto">
											<Link
												href={recommendedMethod.href}
												{...(recommendedMethod.external
													? { target: "_blank", rel: "noreferrer" }
													: {})}
											>
												{recommendedMethod.cta}
												<ArrowUpRight className="size-4" />
											</Link>
										</Button>
									)}
								</div>
							</div>

							{showTicketForm ? (
								<TawkSupportLauncher
											defaultInternalId={defaultInternalId}
											issueLabel={selectedIssue.label}
											supportIsOpen={Boolean(isOpen)}
											tierLabel={tierLabel}
											userEmail={userEmail}
										/>
							) : (
								<div className="rounded-2xl border border-border/60 px-4 py-4">
									<p className="text-sm font-medium">
										Prefer a private reply?
									</p>
									<p className="mt-1 text-sm leading-6 text-muted-foreground">
										If this includes account details, billing information, request
										IDs, or screenshots, choose a private support ticket instead.
									</p>
									<Button
										type="button"
										variant="outline"
										className="mt-4"
										onClick={() => void setIssueParam("general")}
									>
										Switch to private ticket
										<ArrowRight className="size-4" />
									</Button>
								</div>
								)}
							</div>
						</section>

				<section className="border-t border-border/60 pt-6">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 className="text-sm font-medium">Other support methods</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								Use another channel if it fits your issue better.
							</p>
						</div>
					</div>
					<div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{otherMethods.map((method) => (
							<Link
								key={method.key}
								href={method.href}
								className="group flex items-center justify-between gap-3 rounded-2xl border border-border/60 px-3 py-3 text-sm transition-colors hover:border-border hover:bg-muted/35"
								{...(method.external ? { target: "_blank", rel: "noreferrer" } : {})}
							>
								<span className="flex min-w-0 items-center gap-3">
									<span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-foreground">
										<MethodIcon method={method} />
									</span>
									<span className="min-w-0">
										<span className="block font-medium">{method.title}</span>
										<span className="block truncate text-xs text-muted-foreground">
											{method.description}
										</span>
									</span>
								</span>
								<ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
							</Link>
						))}
					</div>
				</section>
					</>
				) : null}
			</main>
			</div>
		</TooltipProvider>
	);
}
