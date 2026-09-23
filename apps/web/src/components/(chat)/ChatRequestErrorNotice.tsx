"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import {
	AlertTriangle,
	ArrowRight,
	Bug,
	ClipboardCopy,
	InfoIcon,
	RefreshCw,
	WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Bubble,
	BubbleContent,
	BubbleReactions,
} from "@/components/ui/bubble";
import { cn } from "@/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { FREE_ROUTER_MODEL_ID } from "@/lib/models/freeRouter";
import { getChatRequestErrorPresentation } from "./chatRequestErrorPresentation";

export type ChatRequestErrorDetails = {
	status: number | null;
	message: string;
	errorCode: string | null;
	requestId: string | null;
	description: string | null;
	action?: string;
	retryable?: boolean;
	docsUrl?: string | null;
	supportUrl?: string | null;
	retryAfterSeconds?: number | null;
	details: Array<{
		message: string;
		path?: string[];
		keyword?: string;
	}>;
	routingDiagnostics?: Record<string, unknown> | null;
	rawPayload?: Record<string, unknown> | null;
	modelId: string;
	providerId: string | null;
	endpoint: string;
	timestamp: string;
};

type ChatRequestErrorNoticeProps = {
	error: ChatRequestErrorDetails;
	threadTitle?: string | null;
	className?: string;
	onRetry?: () => void;
	onChooseModel?: () => void;
};

function buildSummary(error: ChatRequestErrorDetails): string {
	return (
		error.description ||
		error.details[0]?.message ||
		error.message ||
		`Request failed${error.status ? ` (${error.status})` : ""}.`
	);
}

function buildCopyPayload(error: ChatRequestErrorDetails): string {
	return [
		`Status: ${error.status ?? "unknown"}`,
		`Code: ${error.errorCode ?? "unknown"}`,
		`Request ID: ${error.requestId ?? "unknown"}`,
		`Model: ${error.modelId}`,
		`Provider: ${error.providerId ?? "auto"}`,
		`Endpoint: ${error.endpoint}`,
		`Summary: ${buildSummary(error)}`,
		error.action ? `Next step: ${error.action}` : null,
		typeof error.retryable === "boolean"
			? `Retryable: ${error.retryable ? "yes" : "no"}`
			: null,
		error.retryAfterSeconds != null
			? `Retry after: ${error.retryAfterSeconds} seconds`
			: null,
		error.details.length
			? `Details:\n${error.details
					.map((detail) => `- ${detail.message}`)
					.join("\n")}`
			: null,
		error.routingDiagnostics
			? `Routing diagnostics:\n${JSON.stringify(
					error.routingDiagnostics,
					null,
					2,
				)}`
			: null,
	].filter(Boolean).join("\n\n");
}

export function ChatRequestErrorNotice({
	error,
	threadTitle,
	className,
	onRetry,
	onChooseModel,
}: ChatRequestErrorNoticeProps) {
	const [open, setOpen] = useState(false);
	const [notes, setNotes] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const summary = useMemo(() => buildSummary(error), [error]);
	const copyPayload = useMemo(() => buildCopyPayload(error), [error]);
	const presentation = useMemo(
		() => getChatRequestErrorPresentation(error),
		[error],
	);
	const canRetry = error.retryable ?? presentation.canRetry;
	const isPaymentRequired = presentation.kind === "payment";
	const isRecoveryState = [
		"payment",
		"authentication",
		"model-unavailable",
		"timeout",
		"conflict",
		"rate-limit",
		"service",
	].includes(presentation.kind) || error.retryable === true;

	const copyDiagnostics = async () => {
		try {
			await navigator.clipboard.writeText(copyPayload);
			toast.success("Copied diagnostics");
		} catch {
			toast.error("Failed to copy diagnostics");
		}
	};

	const createIssue = async () => {
		setIsSubmitting(true);
		try {
			const payload = await fetchAccountWebApi<{
				error?: string;
				created?: boolean;
				issueUrl?: string;
			}>("/api/account/chat/issues", await getBrowserAccessToken(), {
				method: "POST",
				body: JSON.stringify({
					error,
					threadTitle,
					pageUrl:
						typeof window !== "undefined"
							? window.location.href
							: null,
					notes,
				}),
			});
			if (!payload.issueUrl) {
				throw new Error(payload.error || "Failed to create GitHub issue");
			}
			window.open(payload.issueUrl, "_blank", "noopener,noreferrer");
			toast.success(
				payload.created
					? "GitHub issue created"
					: "Opened prefilled GitHub issue",
			);
			setOpen(false);
		} catch (issueError) {
			toast.error(
				issueError instanceof Error
					? issueError.message
					: "Failed to create GitHub issue",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<>
			<Bubble
				variant={isRecoveryState ? "tinted" : "destructive"}
				className={cn("mb-4 max-w-full", className)}
			>
				<BubbleContent
					className={cn(
						"w-full max-w-full px-3.5 py-3",
						isRecoveryState
							? "border-primary/20"
							: "border-destructive/20",
					)}
				>
					<div className="flex min-w-0 items-start gap-2.5">
						{isPaymentRequired ? (
							<WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
						) : (
							<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
						)}
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium">
								{presentation.title}
							</p>
							<p
								className={cn(
									"mt-0.5 text-xs",
									isRecoveryState
										? "text-muted-foreground"
										: "text-destructive/80",
								)}
							>
								{presentation.description}
							</p>
							{error.action ? (
								<p className="mt-2 text-xs text-muted-foreground">
									<span className="font-medium text-foreground">Next step:</span>{" "}
									{error.action}
								</p>
							) : null}
							{error.retryAfterSeconds != null ? (
								<p className="mt-1 text-xs text-muted-foreground">
									Retry after {error.retryAfterSeconds} seconds.
								</p>
							) : null}
							{isPaymentRequired ||
							presentation.kind === "authentication" ||
							(canRetry && onRetry) ||
							(presentation.canChooseModel && onChooseModel) ? (
								<div className="mt-3 flex flex-wrap gap-2">
									{isPaymentRequired ? (
										<>
											<Button asChild size="sm">
												<Link href="/settings/credits">
													Add credits
													<ArrowRight />
												</Link>
											</Button>
											<Button asChild size="sm" variant="outline">
												<Link
													href={`/chat?model=${encodeURIComponent(FREE_ROUTER_MODEL_ID)}`}
												>
													Try a free model
												</Link>
											</Button>
										</>
									) : null}
									{presentation.kind === "authentication" ? (
										<Button asChild size="sm">
											<Link href="/sign-in?returnUrl=%2Fchat">
												Sign in
												<ArrowRight />
											</Link>
										</Button>
									) : null}
									{canRetry && onRetry ? (
										<Button type="button" size="sm" onClick={onRetry}>
											<RefreshCw />
											Try again
										</Button>
									) : null}
									{presentation.canChooseModel && onChooseModel ? (
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={onChooseModel}
										>
											Choose another model
										</Button>
									) : null}
								</div>
							) : null}
							<div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
								<a
									href={error.docsUrl ?? "https://phaseo.app/docs/v1/api-reference/errors"}
									target="_blank"
									rel="noreferrer"
									className="underline underline-offset-2"
								>
									Read the error guide
								</a>
								<a
									href={error.supportUrl ?? "https://phaseo.tawk.help/"}
									target="_blank"
									rel="noreferrer"
									className="underline underline-offset-2"
								>
									Contact support
								</a>
							</div>
						</div>
					</div>
				</BubbleContent>
				<BubbleReactions
					align="end"
					className={cn(
						"bg-background ring-background",
						isRecoveryState ? "text-foreground" : "text-destructive",
					)}
				>
					<Popover>
						<Tooltip>
							<TooltipTrigger asChild>
								<PopoverTrigger asChild>
									<Button
										type="button"
										size="icon-xs"
										variant="ghost"
										aria-label="Show error details"
										className={cn(
											isRecoveryState
												? "text-muted-foreground hover:text-foreground aria-expanded:text-foreground"
												: "text-destructive hover:text-destructive aria-expanded:text-destructive",
										)}
									>
										<InfoIcon />
									</Button>
								</PopoverTrigger>
							</TooltipTrigger>
							<TooltipContent side="top" sideOffset={6}>
								Show error details
							</TooltipContent>
						</Tooltip>
						<PopoverContent align="end" className="w-80 gap-3 rounded-md">
							<PopoverHeader>
								<PopoverTitle className="text-sm">
									Chat request failed
								</PopoverTitle>
								<PopoverDescription className="text-sm">
									{summary}
								</PopoverDescription>
							</PopoverHeader>
							<div className="grid gap-1 text-xs text-muted-foreground">
								<p>
									<span className="font-medium text-foreground">Status:</span>{" "}
									{error.status ?? "unknown"}
								</p>
								<p>
									<span className="font-medium text-foreground">Code:</span>{" "}
									{error.errorCode ?? "unknown"}
								</p>
								<p className="break-all">
									<span className="font-medium text-foreground">Request:</span>{" "}
									{error.requestId ?? "unknown"}
								</p>
								{error.action ? (
									<p>
										<span className="font-medium text-foreground">Next step:</span>{" "}
										{error.action}
									</p>
								) : null}
								{typeof error.retryable === "boolean" ? (
									<p>
										<span className="font-medium text-foreground">Retryable:</span>{" "}
										{error.retryable ? "yes" : "no"}
									</p>
								) : null}
								<p className="break-all">
									<span className="font-medium text-foreground">Model:</span>{" "}
									{error.modelId}
								</p>
							</div>
						</PopoverContent>
					</Popover>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								size="icon-xs"
							variant="ghost"
							aria-label="Copy error diagnostics"
							className={cn(
								isRecoveryState
									? "text-muted-foreground hover:text-foreground"
									: "text-destructive hover:text-destructive",
							)}
							onClick={copyDiagnostics}
							>
								<ClipboardCopy />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={6}>
							Copy diagnostics
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								size="icon-xs"
							variant="ghost"
							aria-label="Report error"
							className={cn(
								isRecoveryState
									? "text-muted-foreground hover:text-foreground"
									: "text-destructive hover:text-destructive",
							)}
							onClick={() => setOpen(true)}
							>
								<Bug />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={6}>
							Report error
						</TooltipContent>
					</Tooltip>
				</BubbleReactions>
			</Bubble>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Chat error details</DialogTitle>
						<DialogDescription>
							Inspect the gateway failure and create a GitHub issue from this dialog.
						</DialogDescription>
					</DialogHeader>
					<ScrollArea
						className="min-h-0 max-h-[calc(85vh-8rem)]"
						viewportClassName="grid gap-3 pr-1"
					>
						<div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
							<div className="grid gap-1 sm:grid-cols-2">
								<p>
									<span className="font-medium">Status:</span>{" "}
									{error.status ?? "unknown"}
								</p>
								<p>
									<span className="font-medium">Code:</span>{" "}
									{error.errorCode ?? "unknown"}
								</p>
								<p className="break-all">
									<span className="font-medium">Request ID:</span>{" "}
									{error.requestId ?? "unknown"}
								</p>
								<p className="break-all">
									<span className="font-medium">Endpoint:</span>{" "}
									{error.endpoint}
								</p>
								<p className="break-all">
									<span className="font-medium">Model:</span>{" "}
									{error.modelId}
								</p>
								<p className="break-all">
									<span className="font-medium">Provider:</span>{" "}
									{error.providerId ?? "auto"}
								</p>
							</div>
							<div>
								<p className="font-medium">Summary</p>
								<p className="mt-1 text-muted-foreground">{summary}</p>
							</div>
						</div>
						{error.details.length > 0 ? (
							<div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
								<p className="font-medium">Validation details</p>
								<div className="space-y-2">
									{error.details.map((detail, index) => (
										<div key={`${detail.keyword ?? "detail"}-${index}`}>
											<p>{detail.message}</p>
											{detail.path?.length ? (
												<p className="text-xs text-muted-foreground">
													Path: {detail.path.join(" / ")}
												</p>
											) : null}
										</div>
									))}
								</div>
							</div>
						) : null}
						{error.routingDiagnostics ? (
							<div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
								<p className="font-medium">Routing diagnostics</p>
								<ScrollArea
									className="max-h-56 rounded bg-muted"
									viewportClassName="p-3"
								>
									<pre className="text-xs">
										{JSON.stringify(error.routingDiagnostics, null, 2)}
									</pre>
								</ScrollArea>
							</div>
						) : null}
						<div className="grid gap-2">
							<p className="text-sm font-medium">Extra notes for the issue</p>
							<Textarea
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								rows={4}
								placeholder="What were you trying to do? How can we reproduce it?"
							/>
						</div>
					</ScrollArea>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={copyDiagnostics}>
							Copy diagnostics
						</Button>
						<Button type="button" onClick={createIssue} disabled={isSubmitting}>
							{isSubmitting ? "Creating issue..." : "Create GitHub issue"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
