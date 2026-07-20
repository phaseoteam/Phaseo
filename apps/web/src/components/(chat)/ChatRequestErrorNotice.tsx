"use client";

import { useMemo, useState } from "react";
import { getBrowserAccessToken } from "@/lib/fetchers/internal/accountAuthClient";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { AlertTriangle, Bug, ClipboardCopy, InfoIcon } from "lucide-react";
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

export type ChatRequestErrorDetails = {
	status: number | null;
	message: string;
	errorCode: string | null;
	requestId: string | null;
	description: string | null;
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
}: ChatRequestErrorNoticeProps) {
	const [open, setOpen] = useState(false);
	const [notes, setNotes] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const summary = useMemo(() => buildSummary(error), [error]);
	const copyPayload = useMemo(() => buildCopyPayload(error), [error]);

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
				variant="destructive"
				className={cn("mb-4 max-w-full", className)}
			>
				<BubbleContent className="w-full max-w-full border-destructive/20 px-3.5 py-3">
					<div className="flex min-w-0 items-start gap-2.5">
						<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium">
								Request failed{error.status ? ` (${error.status})` : ""}.
							</p>
							<p className="mt-0.5 text-xs text-destructive/80">{summary}</p>
						</div>
					</div>
				</BubbleContent>
				<BubbleReactions
					align="end"
					className="bg-background text-destructive ring-background"
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
										className="text-destructive hover:text-destructive aria-expanded:text-destructive"
									>
										<InfoIcon />
									</Button>
								</PopoverTrigger>
							</TooltipTrigger>
							<TooltipContent side="top" sideOffset={6}>
								Show error details
							</TooltipContent>
						</Tooltip>
						<PopoverContent align="end" className="w-80 gap-3 rounded-2xl">
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
							className="text-destructive hover:text-destructive"
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
							className="text-destructive hover:text-destructive"
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
					<div className="grid gap-3 overflow-y-auto">
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
								<pre className="max-h-56 overflow-auto rounded bg-muted p-3 text-xs">
									{JSON.stringify(error.routingDiagnostics, null, 2)}
								</pre>
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
					</div>
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
