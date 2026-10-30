"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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

function buildSummary(error: ChatRequestErrorDetails, fallback = "Request failed"): string {
	return (
		error.description ||
		error.details[0]?.message ||
		error.message ||
		fallback
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
	onRetry,
	onChooseModel,
}: ChatRequestErrorNoticeProps) {
	const t = useTranslations("Product.chat");
	const [open, setOpen] = useState(false);
	const [notes, setNotes] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const summary = useMemo(() => buildSummary(error, t("requestFailed")), [error, t]);
	const copyPayload = useMemo(() => buildCopyPayload(error), [error]);
	const presentation = useMemo(
		() => getChatRequestErrorPresentation(error),
		[error],
	);
	const isPaymentRequired = presentation.kind === "payment";
	const presentationTitle = t(`errorNotice.${presentation.titleKey}`);
	const presentationDescription = presentation.descriptionKey
		? t(`errorNotice.${presentation.descriptionKey}`)
		: summary;
	const isRecoveryState = [
		"payment",
		"authentication",
		"model-unavailable",
		"timeout",
		"conflict",
		"rate-limit",
		"service",
	].includes(presentation.kind);

	const copyDiagnostics = async () => {
		try {
			await navigator.clipboard.writeText(copyPayload);
			toast.success(t("errorNotice.copiedDiagnostics"));
		} catch {
			toast.error(t("errorNotice.copyDiagnosticsFailed"));
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
				throw new Error(payload.error || t("errorNotice.createIssueFailed"));
			}
			window.open(payload.issueUrl, "_blank", "noopener,noreferrer");
			toast.success(
				payload.created
					? t("errorNotice.issueCreated")
					: t("errorNotice.prefilledIssueOpened"),
			);
			setOpen(false);
		} catch (issueError) {
			toast.error(
				issueError instanceof Error
					? issueError.message
					: t("errorNotice.createIssueFailed"),
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
								{presentationTitle}
							</p>
							<p
								className={cn(
									"mt-0.5 text-xs",
									isRecoveryState
										? "text-muted-foreground"
										: "text-destructive/80",
								)}
							>
								{presentationDescription}
							</p>
							{isPaymentRequired ||
							presentation.kind === "authentication" ||
							(presentation.canRetry && onRetry) ||
							(presentation.canChooseModel && onChooseModel) ? (
								<div className="mt-3 flex flex-wrap gap-2">
									{isPaymentRequired ? (
										<>
											<Button asChild size="sm">
												<Link href="/settings/credits">
													{t("errorNotice.addCredits")}
													<ArrowRight />
												</Link>
											</Button>
											<Button asChild size="sm" variant="outline">
												<Link
													href={`/chat?model=${encodeURIComponent(FREE_ROUTER_MODEL_ID)}`}
												>
													{t("errorNotice.tryFreeModel")}
												</Link>
											</Button>
										</>
									) : null}
									{presentation.kind === "authentication" ? (
										<Button asChild size="sm">
											<Link href="/sign-in?returnUrl=%2Fchat">
													{t("errorNotice.signIn")}
												<ArrowRight />
											</Link>
										</Button>
									) : null}
									{presentation.canRetry && onRetry ? (
										<Button type="button" size="sm" onClick={onRetry}>
											<RefreshCw />
											{t("tryAgain")}
										</Button>
									) : null}
									{presentation.canChooseModel && onChooseModel ? (
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={onChooseModel}
										>
											{t("errorNotice.chooseAnotherModel")}
										</Button>
									) : null}
								</div>
							) : null}
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
										aria-label={t("errorNotice.showErrorDetails")}
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
								{t("errorNotice.showErrorDetails")}
							</TooltipContent>
						</Tooltip>
						<PopoverContent align="end" className="w-80 gap-3 rounded-md">
							<PopoverHeader>
								<PopoverTitle className="text-sm">
									{t("errorNotice.chatRequestFailed")}
								</PopoverTitle>
								<PopoverDescription className="text-sm">
									{summary}
								</PopoverDescription>
							</PopoverHeader>
							<div className="grid gap-1 text-xs text-muted-foreground">
								<p>
									<span className="font-medium text-foreground">{t("errorNotice.status")}:</span>{" "}
									{error.status ?? t("errorNotice.unknown")}
								</p>
								<p>
									<span className="font-medium text-foreground">{t("errorNotice.code")}:</span>{" "}
									{error.errorCode ?? t("errorNotice.unknown")}
								</p>
								<p className="break-all">
									<span className="font-medium text-foreground">{t("errorNotice.request")}:</span>{" "}
									{error.requestId ?? t("errorNotice.unknown")}
								</p>
								<p className="break-all">
									<span className="font-medium text-foreground">{t("errorNotice.model")}:</span>{" "}
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
							aria-label={t("errorNotice.copyDiagnostics")}
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
							{t("errorNotice.copyDiagnostics")}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								size="icon-xs"
							variant="ghost"
							aria-label={t("errorNotice.reportError")}
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
							{t("errorNotice.reportError")}
						</TooltipContent>
					</Tooltip>
				</BubbleReactions>
			</Bubble>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t("errorNotice.chatErrorDetails")}</DialogTitle>
						<DialogDescription>
							{t("errorNotice.dialogDescription")}
						</DialogDescription>
					</DialogHeader>
					<ScrollArea
						className="min-h-0 max-h-[calc(85vh-8rem)]"
						viewportClassName="grid gap-3 pr-1"
					>
						<div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
							<div className="grid gap-1 sm:grid-cols-2">
								<p>
									<span className="font-medium">{t("errorNotice.status")}:</span>{" "}
									{error.status ?? t("errorNotice.unknown")}
								</p>
								<p>
									<span className="font-medium">{t("errorNotice.code")}:</span>{" "}
									{error.errorCode ?? t("errorNotice.unknown")}
								</p>
								<p className="break-all">
									<span className="font-medium">{t("errorNotice.requestId")}:</span>{" "}
									{error.requestId ?? t("errorNotice.unknown")}
								</p>
								<p className="break-all">
									<span className="font-medium">{t("errorNotice.endpoint")}:</span>{" "}
									{error.endpoint}
								</p>
								<p className="break-all">
									<span className="font-medium">{t("errorNotice.model")}:</span>{" "}
									{error.modelId}
								</p>
								<p className="break-all">
									<span className="font-medium">{t("errorNotice.provider")}:</span>{" "}
									{error.providerId ?? t("errorNotice.automatic")}
								</p>
							</div>
							<div>
								<p className="font-medium">{t("errorNotice.summary")}</p>
								<p className="mt-1 text-muted-foreground">{summary}</p>
							</div>
						</div>
						{error.details.length > 0 ? (
							<div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
								<p className="font-medium">{t("errorNotice.validationDetails")}</p>
								<div className="space-y-2">
									{error.details.map((detail, index) => (
										<div key={`${detail.keyword ?? "detail"}-${index}`}>
											<p>{detail.message}</p>
											{detail.path?.length ? (
												<p className="text-xs text-muted-foreground">
												{t("errorNotice.path")}: {detail.path.join(" / ")}
												</p>
											) : null}
										</div>
									))}
								</div>
							</div>
						) : null}
						{error.routingDiagnostics ? (
							<div className="grid gap-2 rounded-lg border border-border p-3 text-sm">
								<p className="font-medium">{t("errorNotice.routingDiagnostics")}</p>
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
							<p className="text-sm font-medium">{t("errorNotice.extraNotes")}</p>
							<Textarea
								value={notes}
								onChange={(event) => setNotes(event.target.value)}
								rows={4}
								placeholder={t("errorNotice.notesPlaceholder")}
							/>
						</div>
					</ScrollArea>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={copyDiagnostics}>
						{t("errorNotice.copyDiagnostics")}
						</Button>
						<Button type="button" onClick={createIssue} disabled={isSubmitting}>
							{isSubmitting ? t("errorNotice.creatingIssue") : t("errorNotice.createIssue")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
