"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bug, ClipboardCopy, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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
	onDismiss: () => void;
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
	onDismiss,
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
			const response = await fetch("/api/chat/issues", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
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
			const payload = (await response.json()) as {
				error?: string;
				created?: boolean;
				issueUrl?: string;
			};
			if (!response.ok || !payload.issueUrl) {
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
			<div
				className={cn(
					"mx-auto mb-4 flex w-full max-w-5xl items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-950 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100",
					className,
				)}
			>
				<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium">
						Request failed{error.status ? ` (${error.status})` : ""}.
					</p>
					<p className="mt-0.5 text-xs opacity-90">{summary}</p>
					<div className="mt-2 flex flex-wrap gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-8"
							onClick={() => setOpen(true)}
						>
							<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
							Details
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-8"
							onClick={copyDiagnostics}
						>
							<ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
							Copy
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-8"
							onClick={() => setOpen(true)}
						>
							<Bug className="mr-1.5 h-3.5 w-3.5" />
							Report
						</Button>
					</div>
				</div>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="h-7 w-7 shrink-0 text-red-900 hover:bg-red-100 hover:text-red-950 dark:text-red-100 dark:hover:bg-red-900/40"
					onClick={onDismiss}
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
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
