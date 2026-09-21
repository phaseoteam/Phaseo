"use client";

import {
	ArrowUp,
	Binary,
	Braces,
	Check,
	ChevronDown,
	Gauge,
	ListChecks,
	Plus,
	Trash2,
	type LucideIcon,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type DecisionMode = "noul" | "choice" | "score";

export type DecisionChoice = {
	id: string;
	value: string;
};

export type DecisionScoreLevel = {
	id: string;
	value: string;
};

export type DecisionDraft = {
	mode: DecisionMode;
	prompt: string;
	context: string;
	choices: DecisionChoice[];
	scoreLevels: DecisionScoreLevel[];
};

type ModeDefinition = {
	id: DecisionMode;
	label: string;
	description: string;
	icon: LucideIcon;
};

const MODES: ModeDefinition[] = [
	{
		id: "noul",
		label: "Noul",
		description: "Get a yes or no probability",
		icon: Binary,
	},
	{
		id: "choice",
		label: "Choice",
		description: "Choose between your answers",
		icon: ListChecks,
	},
	{
		id: "score",
		label: "Score",
		description: "Score against defined levels",
		icon: Gauge,
	},
];

function createId(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createChoice(value = ""): DecisionChoice {
	return { id: createId("choice"), value };
}

function createScoreLevel(value = ""): DecisionScoreLevel {
	return { id: createId("score"), value };
}

export function createDefaultDecisionDraft(
	mode: DecisionMode = "noul",
): DecisionDraft {
	return {
		mode,
		prompt: "",
		context: "",
		choices: [createChoice(), createChoice()],
		scoreLevels: [createScoreLevel()],
	};
}

export function validateDecisionDraft(draft: DecisionDraft): string | null {
	if (!draft.prompt.trim()) return "Enter a question for Jev.";
	if (draft.mode === "choice") {
		const choices = draft.choices.map((choice) => choice.value.trim());
		if (choices.length < 2) return "Add at least two answers.";
		if (choices.some((choice) => !choice)) return "Fill in every answer.";
		if (new Set(choices.map((choice) => choice.toLowerCase())).size !== choices.length) {
			return "Each answer must be different.";
		}
	}
	if (draft.mode === "score") {
		const levels = draft.scoreLevels.map((level) => level.value.trim());
		if (levels.length < 2) return "Add at least two score levels.";
		if (levels.some((level) => !level)) return "Describe every score level.";
	}
	return null;
}

function keyForChoice(value: string, index: number, usedKeys: Set<string>): string {
	const baseKey =
		value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/^_+|_+$/g, "") || `option_${index + 1}`;
	let key = baseKey;
	let suffix = 2;
	while (usedKeys.has(key)) {
		key = `${baseKey}_${suffix}`;
		suffix += 1;
	}
	usedKeys.add(key);
	return key;
}

export function serializeDecisionDraft(draft: DecisionDraft): {
	state: Record<string, unknown>;
	questions: Record<string, unknown>;
} {
	const prompt = draft.prompt.trim();
	const state = { input: draft.context.trim() || prompt };

	if (draft.mode === "noul") {
		return {
			state,
			questions: {
				decision: {
					type: "noul",
					instructions: prompt,
					criteria: {
						true: "The answer to the question is yes.",
						false: "The answer to the question is no.",
					},
				},
			},
		};
	}

	if (draft.mode === "choice") {
		const usedKeys = new Set<string>();
		return {
			state,
			questions: {
				decision: {
					type: "choice",
					instructions: prompt,
					criteria: Object.fromEntries(
						draft.choices.map((choice, index) => {
							const value = choice.value.trim();
							return [keyForChoice(value, index, usedKeys), value];
						}),
					),
				},
			},
		};
	}

	return {
		state,
		questions: {
			decision: {
				type: "score",
				instructions: prompt,
				criteria: draft.scoreLevels.map((level) => level.value.trim()),
			},
		},
	};
}

type DecisionComposerProps = {
	draft: DecisionDraft;
	error: string | null;
	historyLoaded: boolean;
	isSubmitting: boolean;
	onDraftChange: (draft: DecisionDraft) => void;
	onSubmit: () => void;
};

function ModeMenu({
	mode,
	onModeChange,
}: {
	mode: DecisionMode;
	onModeChange: (mode: DecisionMode) => void;
}) {
	const activeMode = MODES.find((item) => item.id === mode) ?? MODES[0];
	const ActiveIcon = activeMode.icon;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-8 gap-1.5 px-2"
						aria-label="Choose decision type"
					/>
				}
			>
				<ActiveIcon className="size-4" />
				<span>{activeMode.label}</span>
				<ChevronDown className="size-3.5 text-muted-foreground" />
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start" sideOffset={8} className="w-64">
				{MODES.map((item) => {
					const Icon = item.icon;
					return (
						<DropdownMenuItem
							key={item.id}
							onClick={() => onModeChange(item.id)}
							className="items-start gap-2.5 py-2"
						>
							<Icon className="mt-0.5 size-4 text-muted-foreground" />
							<span className="min-w-0">
								<span className="block font-medium">{item.label}</span>
								<span className="block text-xs text-muted-foreground">
									{item.description}
								</span>
							</span>
							{item.id === mode ? <Check className="ml-auto mt-0.5 size-4" /> : null}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function DecisionComposer({
	draft,
	error,
	historyLoaded,
	isSubmitting,
	onDraftChange,
	onSubmit,
}: DecisionComposerProps) {
	const [isActive, setIsActive] = useState(false);
	const composerRef = useRef<HTMLDivElement | null>(null);
	const updateDraft = (patch: Partial<DecisionDraft>) => {
		onDraftChange({ ...draft, ...patch });
	};
	const hasModeDetails =
		draft.mode === "choice"
			? draft.choices.some((choice) => choice.value.trim())
			: draft.mode === "score"
				? draft.scoreLevels.some((level) => level.value.trim())
				: false;
	const composerExpanded =
		isActive ||
		draft.prompt.trim().length >= 96 ||
		draft.prompt.includes("\n") ||
		Boolean(draft.context.trim()) ||
		hasModeDetails;

	useEffect(() => {
		function handlePointerDown(event: PointerEvent) {
			const target = event.target;
			if (!(target instanceof Node) || composerRef.current?.contains(target)) {
				return;
			}
			if (
				target instanceof Element &&
				target.closest('[role="menu"], [data-slot="popover-content"]')
			) {
				return;
			}
			setIsActive(false);
		}

		document.addEventListener("pointerdown", handlePointerDown, true);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true);
		};
	}, []);

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (
			event.key === "Enter" &&
			!event.shiftKey &&
			!event.nativeEvent.isComposing
		) {
			event.preventDefault();
			onSubmit();
		}
	}

	return (
		<div
			ref={composerRef}
			data-decision-composer="true"
			data-expanded={composerExpanded}
			className="min-w-0"
			onFocusCapture={() => setIsActive(true)}
			onBlurCapture={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget)) {
					setIsActive(false);
				}
			}}
		>
			<Textarea
				data-decision-question-input="true"
				value={draft.prompt}
				onChange={(event) => updateDraft({ prompt: event.target.value })}
				onKeyDown={handleKeyDown}
				placeholder={
					draft.mode === "noul"
						? "Ask a yes or no question…"
						: draft.mode === "choice"
							? "What should Jev choose?"
							: "What should Jev score?"
				}
				rows={1}
				className={cn(
					"max-h-36 resize-none overflow-y-auto border-0 bg-transparent text-sm leading-5 shadow-none transition-[min-height,padding] duration-200 focus-visible:ring-0 motion-reduce:transition-none",
					composerExpanded
						? "min-h-20 px-3.5 py-3"
						: "min-h-9 px-3.5 py-2",
				)}
			/>

			{composerExpanded && draft.mode === "choice" ? (
				<div className="border-t border-border/70 px-3.5 py-3">
					<div className="mb-2 flex items-center justify-between gap-3">
						<Label className="text-xs">Answers</Label>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => updateDraft({ choices: [...draft.choices, createChoice()] })}
						>
							<Plus className="size-3.5" /> Add answer
						</Button>
					</div>
					<ScrollArea className="max-h-36" viewportClassName="pr-2">
						<div className="grid gap-2 sm:grid-cols-2">
							{draft.choices.map((choice, index) => (
								<div key={choice.id} className="flex min-w-0 items-center gap-1.5">
									<Input
										value={choice.value}
										onChange={(event) =>
											updateDraft({
												choices: draft.choices.map((item) =>
													item.id === choice.id
														? { ...item, value: event.target.value }
														: item,
												),
											})
										}
										placeholder={`Answer ${index + 1}`}
										aria-label={`Answer ${index + 1}`}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-9 w-9 shrink-0"
										disabled={draft.choices.length <= 2}
										onClick={() =>
											updateDraft({
												choices: draft.choices.filter((item) => item.id !== choice.id),
											})
										}
										aria-label={`Remove answer ${index + 1}`}
									>
										<Trash2 className="size-3.5" />
									</Button>
								</div>
							))}
						</div>
					</ScrollArea>
				</div>
			) : null}

			{composerExpanded && draft.mode === "score" ? (
				<div className="border-t border-border/70 px-3.5 py-3">
					<div className="mb-2 flex items-center justify-between gap-3">
						<Label className="text-xs">Score levels</Label>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() =>
								updateDraft({ scoreLevels: [...draft.scoreLevels, createScoreLevel()] })
							}
						>
							<Plus className="size-3.5" /> Add level
						</Button>
					</div>
					<ScrollArea className="max-h-36" viewportClassName="pr-2">
						<div className="space-y-2">
							{draft.scoreLevels.map((level, index) => (
								<div key={level.id} className="flex min-w-0 items-center gap-2">
									<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
										{index}
									</span>
									<Input
										value={level.value}
										onChange={(event) =>
											updateDraft({
												scoreLevels: draft.scoreLevels.map((item) =>
													item.id === level.id
														? { ...item, value: event.target.value }
														: item,
												),
											})
										}
										placeholder={`Describe score ${index}`}
										aria-label={`Description for score ${index}`}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-9 w-9 shrink-0"
										disabled={draft.scoreLevels.length <= 1}
										onClick={() =>
											updateDraft({
												scoreLevels: draft.scoreLevels.filter((item) => item.id !== level.id),
											})
										}
										aria-label={`Remove score ${index}`}
									>
										<Trash2 className="size-3.5" />
									</Button>
								</div>
							))}
						</div>
					</ScrollArea>
				</div>
			) : null}

			<div
				className={cn(
					"flex items-center justify-between gap-2 px-2.5 py-2",
					composerExpanded && "border-t border-border/70",
				)}
			>
				<div className="flex min-w-0 items-center gap-1">
					<ModeMenu mode={draft.mode} onModeChange={(mode) => updateDraft({ mode })} />
					<Popover>
						<PopoverTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-8 gap-1.5 px-2"
									aria-label="Add optional context"
								/>
							}
						>
							<Braces className="size-4" />
							<span className="hidden sm:inline">Context</span>
							{draft.context.trim() ? (
								<span className="size-1.5 rounded-full bg-primary" aria-label="Context added" />
							) : null}
						</PopoverTrigger>
						<PopoverContent side="top" align="start" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))]">
							<PopoverHeader>
								<PopoverTitle className="text-sm">Context</PopoverTitle>
								<PopoverDescription className="text-xs">
									Optional facts Jev should use when making this decision.
								</PopoverDescription>
							</PopoverHeader>
							<Textarea
								value={draft.context}
								onChange={(event) => updateDraft({ context: event.target.value })}
								placeholder="Add relevant account, user, or event context…"
								className="min-h-28 resize-none"
							/>
						</PopoverContent>
					</Popover>
				</div>
				<div className="flex items-center gap-2">
					<span className="hidden text-[11px] text-muted-foreground sm:inline">
						Enter
					</span>
					<Button
						type="button"
						size="icon"
						className="size-8 rounded-full"
						onClick={onSubmit}
						disabled={!historyLoaded || isSubmitting || !draft.prompt.trim()}
						aria-label={isSubmitting ? "Evaluating decision" : "Send decision"}
					>
						<ArrowUp className="size-4" />
					</Button>
				</div>
			</div>
			{error ? <div className="border-t border-border/70 px-3.5 py-2 text-sm text-destructive">{error}</div> : null}
		</div>
	);
}
