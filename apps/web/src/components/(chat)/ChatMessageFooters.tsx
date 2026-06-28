"use client";

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

function formatMetric(
	value: number | string | null | undefined,
	suffix?: string,
) {
	if (value === null || value === undefined || value === "") return "-";
	return suffix ? `${value}${suffix}` : `${value}`;
}

type UserMessageFooterProps = {
	copied: boolean;
	onCopy: () => void;
	onEdit: () => void;
};

export function UserMessageFooter({
	copied,
	onCopy,
	onEdit,
}: UserMessageFooterProps) {
	return (
		<MessageFooter className="mt-0 flex items-center gap-2 px-0 text-xs text-muted-foreground">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						size="icon"
						variant="ghost"
						className="h-7 w-7"
						onClick={onCopy}
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
	generationSeconds: number | null;
	isPendingAssistant: boolean;
	latencyDisplay: number | null;
	metadataOpen: boolean;
	metadataProviderLabel: string | null;
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
	generationSeconds,
	isPendingAssistant,
	latencyDisplay,
	metadataOpen,
	metadataProviderLabel,
	onBranch,
	onCopy,
	onMetadataOpenChange,
	onRetry,
	onSelectVariant,
	throughputDisplay,
	totalTokens,
	variantCount,
}: AssistantMessageFooterProps) {
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
									>
										<Info className="h-3.5 w-3.5" />
									</Button>
								</PopoverTrigger>
							</TooltipTrigger>
							<TooltipContent side="top">Metadata</TooltipContent>
						</Tooltip>
						<PopoverContent align="start" className="w-72">
							<div className="grid gap-3 text-sm">
								<div className="grid gap-1.5">
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											Provider
										</span>
										<span className="truncate pl-3 text-right">
											{metadataProviderLabel ?? "-"}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											Total tokens
										</span>
										<span>{formatMetric(totalTokens)}</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											Latency
										</span>
										<span>{formatMetric(latencyDisplay, " ms")}</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											Generation
										</span>
										<span>
											{formatMetric(generationSeconds, " s")}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											Throughput
										</span>
										<span>
											{formatMetric(throughputDisplay, " tps")}
										</span>
									</div>
									<div className="flex items-center justify-between">
										<span className="text-muted-foreground">
											Total cost
										</span>
										<span>{costLabel ?? "-"}</span>
									</div>
								</div>
							</div>
						</PopoverContent>
					</Popover>
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
					>
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
			) : null}
		</MessageFooter>
	);
}
