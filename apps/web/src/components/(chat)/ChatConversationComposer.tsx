"use client";

import type { ChangeEvent, RefObject } from "react";
import Link from "next/link";
import {
	Brain,
	Check,
	Cpu,
	Info,
	Mic,
	Paperclip,
	Search,
	SendHorizontal,
	Square,
	X,
} from "lucide-react";
import type { ChatSettings } from "@/lib/indexeddb/chats";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SendGateType = "auth" | null;

type ReasoningOption = {
	value: NonNullable<ChatSettings["reasoningEffort"]>;
	label: string;
};

interface ChatConversationComposerProps {
	sendGateType: SendGateType;
	isSending: boolean;
	composer: string;
	attachments: File[];
	attachmentPreviewUrls: Array<string | null>;
	placeholder: string;
	textareaRef: RefObject<HTMLTextAreaElement | null>;
	fileInputRef: RefObject<HTMLInputElement | null>;
	audioInputRef: RefObject<HTMLInputElement | null>;
	isUnified: boolean;
	webSearchEnabled: boolean;
	onWebSearchEnabledChange?: (enabled: boolean) => void;
	reasoningEnabled: boolean;
	reasoningPickerOpen: boolean;
	onReasoningPickerOpenChange: (open: boolean) => void;
	reasoningSelection: NonNullable<ChatSettings["reasoningEffort"]>;
	reasoningOptions: ReasoningOption[];
	onReasoningSelection: (
		value: NonNullable<ChatSettings["reasoningEffort"]>,
	) => void;
	selectedModelCount: number;
	selectedModelsHint?: string;
	selectedModelId: string;
	selectedModelLabel: string;
	selectedOrgId: string;
	isRecording: boolean;
	isStartingRecording: boolean;
	recordingSupported: boolean;
	onToggleRecording: () => void;
	onOpenModelPicker: () => void;
	onSubmit: () => void;
	onComposerChange: (value: string) => void;
	onRemoveAttachment: (index: number) => void;
	onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
}

export function ChatConversationComposer(props: ChatConversationComposerProps) {
	const {
		sendGateType,
		isSending,
		composer,
		attachments,
		attachmentPreviewUrls,
		placeholder,
		textareaRef,
		fileInputRef,
		audioInputRef,
		isUnified,
		webSearchEnabled,
		onWebSearchEnabledChange,
		reasoningEnabled,
		reasoningPickerOpen,
		onReasoningPickerOpenChange,
		reasoningSelection,
		reasoningOptions,
		onReasoningSelection,
		selectedModelCount,
		selectedModelsHint,
		selectedModelId,
		selectedModelLabel,
		selectedOrgId,
		isRecording,
		isStartingRecording,
		recordingSupported,
		onToggleRecording,
		onOpenModelPicker,
		onSubmit,
		onComposerChange,
		onRemoveAttachment,
		onFileSelect,
	} = props;

	return (
		<div className="border-t border-border px-4 py-4 md:px-8">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
				{sendGateType === "auth" ? (
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100">
						<div className="flex items-start gap-2 text-sm">
							<Info className="mt-0.5 h-4 w-4 shrink-0" />
							<div className="space-y-0.5">
								<p className="font-medium">
									Create an account to send messages.
								</p>
								<p className="text-xs opacity-90">
									Sign up to start chatting in this playground.
								</p>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Button asChild size="sm">
								<Link href="/sign-up">Create account</Link>
							</Button>
							<Button asChild variant="outline" size="sm">
								<Link href="/sign-in">Sign in</Link>
							</Button>
						</div>
					</div>
				) : null}
				<div className="rounded-2xl border border-border bg-background px-3 py-2">
					<input
						ref={fileInputRef}
						type="file"
						className="hidden"
						multiple
						onChange={onFileSelect}
					/>
					<input
						ref={audioInputRef}
						type="file"
						accept="audio/*"
						className="hidden"
						multiple
						onChange={onFileSelect}
					/>
					<Textarea
						ref={textareaRef}
						value={composer}
						onChange={(event) => onComposerChange(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								onSubmit();
							}
						}}
						rows={2}
						placeholder={placeholder}
						className="min-h-[56px] resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
					/>
					{attachments.length > 0 ? (
						<div className="flex flex-wrap gap-1 pb-1">
							{attachments.map((file, index) => (
								<button
									key={`${file.name}-${file.size}-${index}`}
									type="button"
									className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
									onClick={() => onRemoveAttachment(index)}
								>
									{attachmentPreviewUrls[index] ? (
										<span
											aria-hidden="true"
											className="h-5 w-5 rounded bg-muted-foreground/20 shrink-0"
										/>
									) : null}
									<span className="max-w-[180px] truncate">
										{file.name}
									</span>
									<X className="h-3 w-3" />
								</button>
							))}
						</div>
					) : null}
					<div className="flex items-center justify-between pt-2">
						<div className="flex items-center gap-2">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										onClick={onOpenModelPicker}
										className="h-8 px-2 gap-1.5"
									>
										{selectedModelCount > 1 ? (
											<span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background">
												{selectedModelCount}
											</span>
										) : selectedModelLabel === "Select model" ? (
											<Cpu className="h-4 w-4 text-muted-foreground" />
										) : (
											<Logo
												id={selectedOrgId}
												alt={selectedOrgId}
												width={16}
												height={16}
												className="rounded-xl shrink-0"
											/>
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{selectedModelCount > 1
										? selectedModelsHint ??
										  `${selectedModelCount} models selected`
										: selectedModelId || "Select model"}
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										disabled={!isUnified}
										onClick={() => fileInputRef.current?.click()}
									>
										<Paperclip className="h-4 w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{isUnified ? "Add files" : "Available in unified chat"}
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										disabled={isStartingRecording}
										className={cn(
											"h-8 w-8",
											isRecording
												? "bg-primary/12 text-primary hover:bg-primary/20 hover:text-primary"
												: "",
										)}
										onClick={onToggleRecording}
										aria-label={
											isRecording ? "Stop recording" : "Record audio"
										}
									>
										{isRecording ? (
											<Square className="h-3.5 w-3.5 fill-current" />
										) : (
											<Mic className="h-4 w-4" />
										)}
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{isRecording
										? "Stop recording and attach audio"
										: recordingSupported
											? "Record and attach audio"
											: "Recording unavailable in this browser context, click to add audio file"}
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										disabled={!isUnified}
										className={cn(
											"h-8 w-8",
											webSearchEnabled && isUnified
												? "bg-muted text-foreground"
												: "",
										)}
										onClick={() => {
											if (!isUnified) return;
											const next = !webSearchEnabled;
											onWebSearchEnabledChange?.(next);
										}}
									>
										<Search className="h-4 w-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>
									{isUnified
										? webSearchEnabled
											? "Disable web search"
											: "Enable web search"
										: "Available in unified chat"}
								</TooltipContent>
							</Tooltip>
							<Popover
								open={reasoningPickerOpen}
								onOpenChange={onReasoningPickerOpenChange}
							>
								<Tooltip>
									<TooltipTrigger asChild>
										<PopoverTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className={cn(
													"h-8 w-8",
													reasoningEnabled
														? "bg-muted text-foreground"
														: "",
												)}
											>
												<Brain className="h-4 w-4" />
											</Button>
										</PopoverTrigger>
									</TooltipTrigger>
									<TooltipContent>
										Reasoning:{" "}
										{reasoningOptions.find(
											(option) => option.value === reasoningSelection,
										)?.label ?? "Medium"}
									</TooltipContent>
								</Tooltip>
								<PopoverContent align="start" className="w-40 p-1">
									<div className="grid gap-0.5">
										{reasoningOptions.map((option) => (
											<Button
												key={option.value}
												type="button"
												variant="ghost"
												className="h-8 w-full justify-between px-2 text-sm"
												onClick={() => onReasoningSelection(option.value)}
											>
												<span className="flex-1 text-left">
													{option.label}
												</span>
												<Check
													className={cn(
														"ml-2 h-3.5 w-3.5 shrink-0",
														reasoningSelection === option.value
															? "opacity-100"
															: "opacity-0",
													)}
												/>
											</Button>
										))}
									</div>
								</PopoverContent>
							</Popover>
						</div>
						<Button
							size="icon"
							onClick={onSubmit}
							disabled={isSending || (!composer.trim() && attachments.length === 0)}
						>
							{isSending ? (
								<Spinner className="h-4 w-4" />
							) : (
								<SendHorizontal className="h-4 w-4" />
							)}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
