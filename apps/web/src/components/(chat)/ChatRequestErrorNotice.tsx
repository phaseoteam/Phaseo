"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

function asNullableString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function asRequiredString(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value : fallback;
}

function asNullableRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function normalizeChatRequestErrorDetailsArray(
	value: unknown,
): ChatRequestErrorDetails["details"] {
	if (!Array.isArray(value)) return [];
	return value.reduce<ChatRequestErrorDetails["details"]>((acc, entry) => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) return acc;
		const detail = entry as Record<string, unknown>;
		const path = Array.isArray(detail.path)
			? detail.path.filter((segment): segment is string => typeof segment === "string")
			: undefined;
		acc.push({
			message:
				typeof detail.message === "string" && detail.message.trim()
					? detail.message
					: "Unknown validation error.",
			path: path?.length ? path : undefined,
			keyword: typeof detail.keyword === "string" ? detail.keyword : undefined,
		});
		return acc;
	}, []);
}

export function normalizeChatRequestErrorDetails(
	value: unknown,
): ChatRequestErrorDetails {
	const raw = asNullableRecord(value) ?? {};
	const status =
		typeof raw.status === "number" && Number.isFinite(raw.status) ? raw.status : null;

	return {
		status,
		message: asRequiredString(raw.message, "Request failed."),
		errorCode: asNullableString(raw.errorCode),
		requestId: asNullableString(raw.requestId),
		description: asNullableString(raw.description),
		details: normalizeChatRequestErrorDetailsArray(raw.details),
		routingDiagnostics: asNullableRecord(raw.routingDiagnostics),
		rawPayload: asNullableRecord(raw.rawPayload),
		modelId: asRequiredString(raw.modelId, "unknown"),
		providerId: asNullableString(raw.providerId),
		endpoint: asRequiredString(raw.endpoint, "unknown"),
		timestamp: asRequiredString(raw.timestamp, ""),
	};
}

function buildSummary(error: ChatRequestErrorDetails): string {
	return (
		error.description ||
		error.details[0]?.message ||
		error.message ||
		`Request failed${error.status ? ` (${error.status})` : ""}.`
	);
}

export function ChatRequestErrorNotice({
	error,
	threadTitle,
	className,
}: ChatRequestErrorNoticeProps) {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const safeError = useMemo(() => normalizeChatRequestErrorDetails(error), [error]);
	const summary = useMemo(() => buildSummary(safeError), [safeError]);

	const createIssue = async () => {
		setIsSubmitting(true);
		try {
			const response = await fetch("/api/chat/issues", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					error: safeError,
					threadTitle,
					pageUrl:
						typeof window !== "undefined"
							? window.location.href
							: null,
				}),
			});
			const payload = (await response.json()) as {
				error?: string;
				created?: boolean;
				issueUrl?: string;
				rateLimited?: boolean;
			};
			if (!response.ok || !payload.issueUrl) {
				throw new Error(payload.error || "Failed to create GitHub issue");
			}
			window.open(payload.issueUrl, "_blank", "noopener,noreferrer");
			toast.success(
				payload.rateLimited
					? "Automatic reports are capped, opened GitHub instead"
					: payload.created
					? "GitHub issue created"
					: "Opened prefilled GitHub issue",
			);
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
		<div
			className={cn(
				"mx-auto mb-4 flex w-full max-w-5xl items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-950 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-100",
				className,
			)}
		>
			<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
			<div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="min-w-0">
					<p className="text-sm font-medium">
						Request failed{safeError.status ? ` (${safeError.status})` : ""}.
					</p>
					<p className="mt-0.5 text-xs opacity-90">{summary}</p>
				</div>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="h-8 shrink-0 border-red-300 bg-white/70 text-red-950 hover:bg-red-100 hover:text-red-950 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-100 dark:hover:bg-red-900/40"
					onClick={createIssue}
					disabled={isSubmitting}
				>
					<Bug className="mr-1.5 h-3.5 w-3.5" />
					{isSubmitting ? "Preparing report..." : "Report issue"}
				</Button>
			</div>
		</div>
	);
}
