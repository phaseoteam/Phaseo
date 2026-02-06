"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ComponentType, FormEvent } from "react";
import {
	BookOpen,
	ArrowUpRight,
	Bug,
	LifeBuoy,
	LineChart,
	Sparkles,
	Inbox,
} from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";

const ISSUE_AREAS = [
	{ value: "web", label: "Web app" },
	{ value: "gateway", label: "Gateway" },
	{ value: "sdk", label: "SDKs" },
	{ value: "rest", label: "REST API" },
	{ value: "billing", label: "Billing & payments" },
	{ value: "data", label: "Data / rankings" },
	{ value: "docs", label: "Docs" },
	{ value: "other", label: "Other" },
];

type ContactMethod = {
	key: string;
	title: string;
	description: string;
	href: string;
	badge?: string;
	external?: boolean;
	icon?: ComponentType<{ className?: string }>;
	logoId?: string;
};

type IssueOption = {
	value: string;
	label: string;
	helper: string;
	recommendationKey: string;
	icon?: ComponentType<{ className?: string }>;
};

const METHODS: ContactMethod[] = [
	{
		key: "support",
		title: "Support form",
		description: "Private request routed directly to me.",
		href: "#support-form",
		badge: "Private",
		icon: Inbox,
	},
	{
		key: "github",
		title: "GitHub",
		description: "Bug reports, feature requests, and public tracking.",
		href: "/github",
		external: true,
		logoId: "github",
	},
	{
		key: "discord",
		title: "Discord",
		description: "Quick answers from the community.",
		href: "/discord",
		badge: "Fast",
		logoId: "discord",
	},
	{
		key: "docs",
		title: "Docs",
		description: "Guides, API reference, and quick starts.",
		href: "/docs",
		icon: BookOpen,
	},
	{
		key: "x",
		title: "X (Twitter)",
		description: "Product updates and release notes.",
		href: "/x",
		external: true,
		logoId: "x",
	},
];

const ISSUE_OPTIONS: IssueOption[] = [
	{
		value: "billing",
		label: "Billing or account issue",
		helper: "Use the support form so we can handle sensitive details privately.",
		recommendationKey: "support",
		icon: Inbox,
	},
	{
		value: "bug",
		label: "Bug or outage",
		helper: "File a GitHub issue with steps to reproduce and screenshots.",
		recommendationKey: "github",
		icon: Bug,
	},
	{
		value: "data",
		label: "Data or metrics issue",
		helper: "Use the support form and share request IDs or examples.",
		recommendationKey: "support",
		icon: LineChart,
	},
	{
		value: "docs",
		label: "Docs or integration question",
		helper: "Check the docs first, then submit a request if something is missing.",
		recommendationKey: "docs",
		icon: BookOpen,
	},
	{
		value: "feature",
		label: "Feature request",
		helper: "Open a GitHub issue with the workflow you want to unlock.",
		recommendationKey: "github",
		icon: Sparkles,
	},
	{
		value: "general",
		label: "General question",
		helper: "Submit the support form and we will route it quickly.",
		recommendationKey: "support",
		icon: LifeBuoy,
	},
	{
		value: "community",
		label: "Community or quick feedback",
		helper: "Jump into Discord for fast answers from the community.",
		recommendationKey: "discord",
		icon: LifeBuoy,
	},
];

const MAX_ATTACHMENTS = 3;

type ContactClientProps = {
	isOpen?: boolean;
	statusLabel?: string;
	statusTone?: string;
	waitText?: string;
	londonLabel?: string;
	userEmail?: string | null;
	tierLabel?: string;
	defaultInternalId?: string;
};

export function ContactClient({
	isOpen,
	statusLabel,
	statusTone,
	waitText,
	londonLabel,
	userEmail,
	tierLabel,
	defaultInternalId,
}: ContactClientProps) {
	const resolvedStatusLabel = statusLabel ?? "Support";
	const resolvedStatusTone = statusTone ?? "bg-amber-500 ring-amber-400/60";
	const resolvedWaitText = waitText ?? "Support replies resume soon.";
	const resolvedLondonLabel = londonLabel ?? "";
	const statusDotClass =
		resolvedStatusTone
			.split(" ")
			.find((value) => value.startsWith("bg-")) ?? "bg-muted-foreground";

	const [issueValue, setIssueValue] = useState<string>("");
	const [issueArea, setIssueArea] = useState<string>("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string>("");

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

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setIsSubmitting(true);
		setErrorMessage("");

		const form = event.currentTarget;
		const formData = new FormData(form);
		const email = String(formData.get("email") ?? "").trim();
		const issueLabel =
			ISSUE_OPTIONS.find((option) => option.value === issueValue)?.label ??
			issueValue;
		const issueAreaLabel =
			ISSUE_AREAS.find((area) => area.value === issueArea)?.label ??
			issueArea;

		const contactMethods = [{ type: "email", value: email }];

		formData.set("issueType", issueLabel);
		formData.set("issueArea", issueAreaLabel);
		if (tierLabel) {
			formData.set("customerType", tierLabel);
		}
		if (defaultInternalId) {
			formData.set("internalId", defaultInternalId);
		}
		formData.set("contactMethods", JSON.stringify(contactMethods));

		try {
			const sendPromise = (async () => {
				const response = await fetch("/api/contact", {
					method: "POST",
					body: formData,
				});
				const payload = (await response.json().catch(() => null)) as
					| { error?: string }
					| null;

				if (!response.ok) {
					throw new Error(payload?.error ?? "Something went wrong");
				}

				return true;
			})();

			const ok = await toast.promise(sendPromise, {
				loading: "Sending request...",
				success: "Request sent. We'll reply by email.",
				error: (err) =>
					err instanceof Error ? err.message : "Unable to submit request",
			});

			if (ok) {
				form.reset();
				setIssueValue("");
				setIssueArea("");
			}
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : "Unable to submit request"
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="container mx-auto py-10 space-y-8">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div className="space-y-2">
					<h1 className="text-3xl font-semibold">Contact</h1>
					<p className="text-muted-foreground max-w-2xl">
						Tell us what you need and we will route you to the fastest channel.
						The support form creates a private support request.
					</p>
				</div>
				<div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
					<Badge variant="outline" className="gap-2 border-border/60">
						<span className={cn("h-2 w-2 rounded-full", statusDotClass)} />
						Support {resolvedStatusLabel}
					</Badge>
					<span>{resolvedWaitText}</span>
					<span>London time: {resolvedLondonLabel}</span>
				</div>
			</div>

			<Card className="border border-border/60">
				<CardHeader className="pb-4">
					<CardTitle className="text-base">Choose a channel</CardTitle>
					<CardDescription>
						Pick the fastest way to get help. We will guide you to the right
						place.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{METHODS.map((method) => {
							const Icon = method.icon ?? ArrowUpRight;
							const isRecommended =
								recommendedMethod?.key === method.key;
							return (
								<Card
									key={method.key}
									className={cn(
										"relative overflow-hidden border bg-card p-4 transition hover:border-primary/30",
										isRecommended
											? "border-primary/40 ring-1 ring-primary/20"
											: "border-border/60"
									)
								}
								>
									<div className="flex items-start gap-3">
										<div className="mt-1 rounded-lg bg-primary/10 p-2 text-primary">
											{method.logoId ? (
												<Logo
													id={method.logoId}
													alt={method.title}
													width={16}
													height={16}
													className="h-4 w-4"
												/>
											) : (
												<Icon className="h-4 w-4" />
											)}
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<h3 className="font-medium text-sm">
													{method.title}
												</h3>
												{method.badge ? (
													<Badge variant="secondary" className="text-[10px]">
														{method.badge}
													</Badge>
												) : null}
												{isRecommended ? (
													<Badge variant="outline" className="text-[10px]">
														Recommended
													</Badge>
												) : null}
											</div>
											<p className="text-sm text-muted-foreground mt-1">
												{method.description}
											</p>
										</div>
									</div>
									<Link
										href={method.href}
										className={cn(
											"absolute inset-0 rounded-lg",
											"focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
										)}
										{...(method.external
											? { target: "_blank", rel: "noreferrer" }
											: {})}
									/>
								</Card>
							);
						})}
					</div>
				</CardContent>
			</Card>

			<Card className="border border-border/60">
				<CardHeader className="pb-4">
					<CardTitle className="text-base">
						What do you need help with?
					</CardTitle>
					<CardDescription>
						Select an issue type and we will highlight the best path.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
						<Select value={issueValue} onValueChange={setIssueValue}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Choose an issue type" />
							</SelectTrigger>
							<SelectContent>
								{ISSUE_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										<div className="flex items-center gap-2">
											{option.icon ? (
												<option.icon className="h-4 w-4 text-muted-foreground" />
											) : null}
											<span>{option.label}</span>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{recommendedMethod ? (
							<Button asChild className="sm:w-auto">
								<Link
									href={recommendedMethod.href}
									{...(recommendedMethod.external
										? { target: "_blank", rel: "noreferrer" }
										: {})}
								>
									Go to {recommendedMethod.title}
								</Link>
							</Button>
						) : (
							<Button disabled className="sm:w-auto">
								Select to continue
							</Button>
						)}
					</div>

					{selectedIssue ? (
						<div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm">
							<p className="font-medium text-foreground">
								Recommended: {recommendedMethod?.title ?? "Choose a channel"}
							</p>
							<p className="text-muted-foreground">
								{selectedIssue.helper}
							</p>
						</div>
					) : null}
				</CardContent>
			</Card>

			<Card className="border border-border/60" id="support-form">
				<CardHeader className="pb-4">
					<CardTitle className="text-base">Submit a support request</CardTitle>
					<CardDescription>
						We will reply within 30 minutes when I am available. Otherwise
						replies may be delayed - please be patient and I will get back to you
						ASAP.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="space-y-6" onSubmit={handleSubmit}>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="name">Name</Label>
								<Input id="name" name="name" placeholder="Your name" />
							</div>
							<div className="space-y-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									name="email"
									type="email"
									placeholder="name@domain.com"
									defaultValue={userEmail ?? ""}
									required
								/>
							</div>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label>Issue area</Label>
								<Select value={issueArea} onValueChange={setIssueArea}>
									<SelectTrigger>
										<SelectValue placeholder="Where is the issue?" />
									</SelectTrigger>
									<SelectContent>
										{ISSUE_AREAS.map((area) => (
											<SelectItem key={area.value} value={area.value}>
												{area.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label htmlFor="subject">Short summary</Label>
								<Input
									id="subject"
									name="subject"
									placeholder="One-line summary"
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="details">Details</Label>
							<Textarea
								id="details"
								name="details"
								placeholder="What happened? Steps to reproduce?"
								required
								rows={6}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="references">Reference info</Label>
							<Textarea
								id="references"
								name="references"
								placeholder="Request IDs, model IDs, URLs, timestamps"
								rows={3}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="attachments">Attachments (images only)</Label>
							<Input
								id="attachments"
								name="attachments"
								type="file"
								accept="image/*"
								multiple
							/>
							<p className="text-xs text-muted-foreground">
								Up to {MAX_ATTACHMENTS} images. 5MB per file.
							</p>
						</div>

						<div className="flex flex-wrap items-center gap-3">
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? "Submitting..." : "Submit request"}
							</Button>
							{errorMessage ? (
								<span className="text-sm text-red-500">
									{errorMessage}
								</span>
							) : null}
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
