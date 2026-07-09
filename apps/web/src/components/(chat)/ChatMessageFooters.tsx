"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
	ChevronLeft,
	ChevronRight,
	Check,
	Copy,
	GitBranch,
	Info,
	Pencil,
	RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageFooter } from "@/components/ui/message";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Logo } from "@/components/Logo";

function formatMetric(
	value: number | string | null | undefined,
	suffix?: string,
) {
	if (value === null || value === undefined || value === "") return "-";
	return suffix ? `${value}${suffix}` : `${value}`;
}

function formatTimingLabel(value: number) {
	if (!Number.isFinite(value)) return "-";
	if (value < 1000) return `${Math.max(0, Math.round(value))} ms`;
	const seconds = value / 1000;
	if (seconds < 10) {
		return `${seconds.toFixed(2).replace(/\.?0+$/, "")} s`;
	}
	if (seconds < 60) {
		return `${seconds.toFixed(1).replace(/\.0$/, "")} s`;
	}
	const minutes = seconds / 60;
	if (minutes < 10) {
		return `${minutes.toFixed(2).replace(/\.?0+$/, "")} min`;
	}
	return `${minutes.toFixed(1).replace(/\.0$/, "")} min`;
}

function MetadataSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="grid gap-1.5">
			<div className="text-xs font-semibold text-foreground">
				{title}
			</div>
			<div className="grid gap-1.5">{children}</div>
		</section>
	);
}

function TimingMetricRow({
	label,
	valueMs,
}: {
	label: string;
	valueMs: number | null;
}) {
	if (typeof valueMs !== "number" || !Number.isFinite(valueMs)) {
		return (
			<MetadataRow label={label}>
				<span>-</span>
			</MetadataRow>
		);
	}
	const normalizedValue = Math.max(0, valueMs);

	return (
		<MetadataRow label={label}>
			<NumericValue>
				{formatTimingLabel(normalizedValue)}
			</NumericValue>
		</MetadataRow>
	);
}

function NumericValue({ children }: { children: ReactNode }) {
	return (
		<span className="font-mono tabular-nums">
			{children}
		</span>
	);
}

function MetadataRow({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<span className="text-muted-foreground">{label}</span>
			<div className="min-w-0 text-right font-medium text-foreground">
				{children}
			</div>
		</div>
	);
}

type UserMessageFooterProps = {
	copied: boolean;
	sentAtLabel: string | null;
	onCopy: () => void;
	onEdit: () => void;
};

export function UserMessageFooter({
	copied,
	sentAtLabel,
	onCopy,
	onEdit,
}: UserMessageFooterProps) {
	return (
		<MessageFooter className="mt-0 flex items-center gap-2 px-0 text-xs text-muted-foreground">
			{sentAtLabel ? (
				<span className="select-none whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 group-focus-within/message:opacity-100">
					{sentAtLabel}
				</span>
			) : null}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="icon"
						variant="ghost"
						className="h-7 w-7"
						onClick={onCopy}
						aria-label={copied ? "Message copied" : "Copy message"}
					>
						{copied ? (
							<Check className="h-3.5 w-3.5" />
						) : (
							<Copy className="h-3.5 w-3.5" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">
					{copied ? "Copied" : "Copy"}
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="icon"
						variant="ghost"
						className="h-7 w-7"
						onClick={onEdit}
						aria-label="Edit message"
					>
						<Pencil className="h-3.5 w-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Edit</TooltipContent>
			</Tooltip>
		</MessageFooter>
	);
}

type AssistantMessageFooterProps = {
	activeVariantIndex: number;
	assistantCopied: boolean;
	costLabel: string | null;
	endToEndDisplay: string | null;
	endToEndMs: number | null;
	generationMs: number | null;
	isPendingAssistant: boolean;
	latencyMs: number | null;
	metadataOpen: boolean;
	metadataProviderId: string | null;
	metadataProviderLabel: string | null;
	sentAtLabel: string | null;
	onBranch: () => void;
	onCopy: () => void;
	onMetadataOpenChange: (open: boolean) => void;
	onRetry: () => void;
	onSelectVariant: (variantIndex: number) => void;
	throughputDisplay: number | null;
	totalTokens: number | string | null;
	variantCount: number;
};

export function AssistantMessageFooter({
	activeVariantIndex,
	assistantCopied,
	costLabel,
	endToEndDisplay,
	endToEndMs,
	generationMs,
	isPendingAssistant,
	latencyMs,
	metadataOpen,
	metadataProviderId,
	metadataProviderLabel,
	sentAtLabel,
	onBranch,
	onCopy,
	onMetadataOpenChange,
	onRetry,
	onSelectVariant,
	throughputDisplay,
	totalTokens,
	variantCount,
}: AssistantMessageFooterProps) {
	const providerHref = metadataProviderId && metadataProviderId !== "auto"
		? `/api-providers/${encodeURIComponent(metadataProviderId)}`
		: null;
	const providerLabel =
		metadataProviderLabel ?? metadataProviderId ?? "-";
	const latencyMetricMs =
		typeof latencyMs === "number" && Number.isFinite(latencyMs)
			? Math.max(0, latencyMs)
			: null;
	const generationMetricMs =
		typeof generationMs === "number" && Number.isFinite(generationMs)
			? Math.max(0, generationMs)
			: null;

	return (
		<MessageFooter className="mt-0 flex flex-wrap items-center gap-2 px-0 text-xs text-muted-foreground">
			{isPendingAssistant ? null : (
				<>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="icon"
								variant="ghost"
								className="h-7 w-7"
								onClick={onCopy}
								aria-label={
									assistantCopied
										? "Assistant response copied"
										: "Copy assistant response"
								}
							>
								{assistantCopied ? (
									<Check className="h-3.5 w-3.5" />
								) : (
									<Copy className="h-3.5 w-3.5" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">
							{assistantCopied ? "Copied" : "Copy"}
						</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="icon"
								variant="ghost"
								className="h-7 w-7"
								onClick={onRetry}
								aria-label="Retry assistant response"
							>
								<RotateCcw className="h-3.5 w-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">Retry</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								size="icon"
								variant="ghost"
								className="h-7 w-7"
								onClick={onBranch}
								aria-label="Branch from assistant response"
							>
								<GitBranch className="h-3.5 w-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="top">Branch</TooltipContent>
					</Tooltip>
					<Popover
						open={metadataOpen}
						onOpenChange={onMetadataOpenChange}
					>
						<Tooltip>
							<TooltipTrigger asChild>
								<PopoverTrigger asChild>
									<Button
										size="icon"
										variant="ghost"
										className="h-7 w-7"
										aria-label="Show response metadata"
									>
										<Info className="h-3.5 w-3.5" />
									</Button>
								</PopoverTrigger>
							</TooltipTrigger>
							<TooltipContent side="top">Metadata</TooltipContent>
						</Tooltip>
						<PopoverContent
							align="start"
							className="w-72 max-w-[calc(100vw-2rem)]"
						>
							<div className="grid gap-3 text-sm">
								<MetadataRow label="Provider">
									{providerHref && metadataProviderId ? (
										<Link
											href={providerHref}
											className="inline-flex min-w-0 items-center justify-end gap-1.5 text-right"
										>
											<Logo
												id={metadataProviderId}
												alt={providerLabel}
												width={16}
												height={16}
												className="shrink-0 rounded-none"
											/>
											<span className="truncate">
												{providerLabel}
											</span>
										</Link>
									) : (
										<span className="block truncate">
											{providerLabel}
										</span>
									)}
								</MetadataRow>
								<div className="h-px bg-border" />
								<MetadataSection title="Usage">
									<MetadataRow label="Total tokens">
										<NumericValue>
											{formatMetric(totalTokens)}
										</NumericValue>
									</MetadataRow>
									<MetadataRow label="Total cost">
										<NumericValue>{costLabel ?? "-"}</NumericValue>
									</MetadataRow>
								</MetadataSection>
								<div className="h-px bg-border" />
								<MetadataSection title="Timing">
									<TimingMetricRow
										label="Latency"
										valueMs={latencyMetricMs}
									/>
									<TimingMetricRow
										label="Generation time"
										valueMs={generationMetricMs}
									/>
									<MetadataRow label="End-to-end time">
										<NumericValue>
											{formatMetric(endToEndDisplay)}
										</NumericValue>
									</MetadataRow>
									<MetadataRow label="Throughput">
										<NumericValue>
											{formatMetric(throughputDisplay, " tps")}
										</NumericValue>
									</MetadataRow>
								</MetadataSection>
							</div>
						</PopoverContent>
					</Popover>
					{sentAtLabel && variantCount <= 1 ? (
						<span className="select-none whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 group-focus-within/message:opacity-100">
							{sentAtLabel}
						</span>
					) : null}
				</>
			)}
			{!isPendingAssistant && variantCount > 1 ? (
				<div className="ml-auto flex items-center gap-2">
					<Button
						size="icon"
						variant="ghost"
						onClick={() =>
							onSelectVariant(Math.max(0, activeVariantIndex - 1))
						}
						disabled={activeVariantIndex <= 0}
						aria-label="Previous response variant"
					>
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<span className="text-xs text-muted-foreground">
						{activeVariantIndex + 1}/{variantCount}
					</span>
					<Button
						size="icon"
						variant="ghost"
						onClick={() =>
							onSelectVariant(
								Math.min(variantCount - 1, activeVariantIndex + 1),
							)
						}
						disabled={activeVariantIndex >= variantCount - 1}
						aria-label="Next response variant"
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
					{sentAtLabel ? (
						<span className="select-none whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover/message:opacity-100 group-focus-within/message:opacity-100">
							{sentAtLabel}
						</span>
					) : null}
				</div>
			) : null}
		</MessageFooter>
	);
}
