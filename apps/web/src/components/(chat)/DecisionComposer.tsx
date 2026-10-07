"use client";
import { useTranslations } from "next-intl";

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

function isEmptyDecisionDraft(draft: DecisionDraft): boolean {
	return (
		!draft.prompt.trim() &&
		!draft.context.trim() &&
		draft.choices.length === 2 &&
		draft.choices.every((choice) => !choice.value.trim()) &&
		draft.scoreLevels.length === 1 &&
		!draft.scoreLevels[0]?.value.trim()
	);
}

export const DECISION_VALIDATION_COPY_KEYS = {
	"Enter a decision question.": "validationQuestion",
	"Add at least two answers.": "validationTwoAnswers",
	"Fill in every answer.": "validationEveryAnswer",
	"Each answer must be different.": "validationDistinctAnswers",
	"Add at least two score levels.": "validationTwoLevels",
	"Describe every score level.": "validationEveryLevel",
} as const;

export function validateDecisionDraft(draft: DecisionDraft): string | null {
	if (!draft.prompt.trim()) return "Enter a decision question.";
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

export function serializeDecisionDraft(draft: DecisionDraft): {
	input: string;
	questions: Array<Record<string, unknown>>;
} {
	const instructions = draft.prompt.trim();
	const input = draft.context.trim() || instructions;
	if (draft.mode === "noul") return { input, questions: [{ type: "predicate", name: "decision", instructions }] };
	if (draft.mode === "choice") {
		return { input, questions: [{
			type: "choice", name: "decision", instructions,
			choices: draft.choices.map(choice => ({ value: choice.value.trim() })),
		}] };
	}
	return { input, questions: [{
		type: "score", name: "decision", instructions,
		levels: draft.scoreLevels.map(level => ({ label: level.value.trim() })),
	}] };
}

// Tev returns a label without the distribution required by the native format.
// Preserve its existing request/response contract in the playground.
export function serializeDecisionDraftForModel(draft: DecisionDraft, model: string):
	| ReturnType<typeof serializeDecisionDraft>
	| { state: Record<string, unknown>; questions: Record<string, unknown> } {
	if (model !== "together/tev1-4b-experimental") return serializeDecisionDraft(draft);
	const native = serializeDecisionDraft(draft);
	const question = native.questions[0];
	const choices = draft.choices.map(choice => choice.value.trim());
	const used = new Set<string>();
	const criteria = Object.fromEntries(choices.map((value, index) => {
		const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `option_${index + 1}`;
		let key = base;
		let suffix = 2;
		while (used.has(key)) key = `${base}_${suffix++}`;
		used.add(key);
		return [key, value];
	}));
	return {
		state: { input: native.input },
		questions: { decision: { type: draft.mode, instructions: question.instructions,
			...(draft.mode === "choice" ? { criteria } : draft.mode === "score" ? { criteria: draft.scoreLevels.map(level => level.value.trim()) } : {}) } },
	};
}

type DecisionComposerProps = {
	draft: DecisionDraft;
	error: string | null;
	historyLoaded: boolean;
	isSubmitting: boolean;
	onDraftChange: (draft: DecisionDraft) => void;
	onSubmit: () => void | boolean | Promise<void | boolean>;
};

function ModeMenu({
	mode,
	onModeChange,
}: {
	mode: DecisionMode;
	onModeChange: (mode: DecisionMode) => void;
}) {
	const tCopy = useTranslations("SettingsUI.chatGaps");
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
						aria-label={tCopy("chooseDecision")}
					/>
				}
			>
				<ActiveIcon className="size-4" />
				<span>{({ Noul: "Noul", Choice: tCopy("choice"), Score: tCopy("copyScore") } as Record<string, string>)[activeMode.label] ?? activeMode.label}</span>
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
								<span className="block font-medium">{({ Noul: "Noul", Choice: tCopy("choice"), Score: tCopy("copyScore") } as Record<string, string>)[item.label] ?? item.label}</span>
								<span className="block text-xs text-muted-foreground">
									{({ "Get a yes or no probability": tCopy("noulHelp"), "Choose between your answers": tCopy("choiceHelp"), "Score against defined levels": tCopy("scoreHelp") } as Record<string, string>)[item.description] ?? item.description}
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
	const tCopy = useTranslations("SettingsUI.chatGaps");
	const [isActive, setIsActive] = useState(false);
	const [hasDraftChanges, setHasDraftChanges] = useState(false);
	const composerRef = useRef<HTMLDivElement | null>(null);
	const choiceViewportRef = useRef<HTMLDivElement | null>(null);
	const scoreViewportRef = useRef<HTMLDivElement | null>(null);
	const previousChoiceCountRef = useRef(draft.choices.length);
	const previousScoreCountRef = useRef(draft.scoreLevels.length);
	const previousDraftRef = useRef(draft);
	const internalDraftUpdateRef = useRef(false);
	const updateDraft = (patch: Partial<DecisionDraft>) => {
		internalDraftUpdateRef.current = true;
		setHasDraftChanges(true);
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
		hasModeDetails ||
		hasDraftChanges;

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

	useEffect(() => {
		if (previousDraftRef.current === draft) return;
		const wasInternalUpdate = internalDraftUpdateRef.current;
		internalDraftUpdateRef.current = false;
		previousDraftRef.current = draft;
		if (!wasInternalUpdate && isEmptyDecisionDraft(draft)) {
			setHasDraftChanges(false);
			setIsActive(false);
		}
	}, [draft]);

	useEffect(() => {
		const previousCount = previousChoiceCountRef.current;
		previousChoiceCountRef.current = draft.choices.length;
		if (draft.mode !== "choice" || draft.choices.length <= previousCount) return;

		const frame = window.requestAnimationFrame(() => {
			const viewport = choiceViewportRef.current;
			if (viewport) viewport.scrollTop = viewport.scrollHeight;
		});
		return () => window.cancelAnimationFrame(frame);
	}, [draft.choices.length, draft.mode]);

	useEffect(() => {
		const previousCount = previousScoreCountRef.current;
		previousScoreCountRef.current = draft.scoreLevels.length;
		if (draft.mode !== "score" || draft.scoreLevels.length <= previousCount) return;

		const frame = window.requestAnimationFrame(() => {
			const viewport = scoreViewportRef.current;
			if (viewport) viewport.scrollTop = viewport.scrollHeight;
		});
		return () => window.cancelAnimationFrame(frame);
	}, [draft.mode, draft.scoreLevels.length]);

	async function handleSubmit() {
		const submitted = await onSubmit();
		if (submitted !== false) {
			setHasDraftChanges(false);
			setIsActive(false);
		}
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
		if (
			event.key === "Enter" &&
			!event.shiftKey &&
			!event.nativeEvent.isComposing
		) {
			event.preventDefault();
			void handleSubmit();
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
						? tCopy("yesNoPrompt")
						: draft.mode === "choice"
							? tCopy("choicePrompt")
							: tCopy("scorePrompt")
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
						<Label className="text-xs">{tCopy("answers")}</Label>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => updateDraft({ choices: [...draft.choices, createChoice()] })}
						>
							<Plus className="size-3.5" /> {tCopy("addAnswer")}</Button>
					</div>
					<ScrollArea
						className="max-h-36"
						viewportClassName="max-h-36 pr-2"
						viewportRef={choiceViewportRef}
					>
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
										placeholder={tCopy("answerNumber", { number: index + 1 })}
										aria-label={tCopy("answerNumber", { number: index + 1 })}
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
										aria-label={tCopy("removeAnswer", { number: index + 1 })}
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
						<Label className="text-xs">{tCopy("scoreLevels")}</Label>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() =>
								updateDraft({ scoreLevels: [...draft.scoreLevels, createScoreLevel()] })
							}
						>
							<Plus className="size-3.5" /> {tCopy("addLevel")}</Button>
					</div>
					<ScrollArea
						className="max-h-36"
						viewportClassName="max-h-36 pr-2"
						viewportRef={scoreViewportRef}
					>
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
										placeholder={tCopy("describeScore", { number: index })}
										aria-label={tCopy("scoreDescription", { number: index })}
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
										aria-label={tCopy("removeScore", { number: index })}
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
									aria-label={tCopy("addContext")}
								/>
							}
						>
							<Braces className="size-4" />
							<span className="hidden sm:inline">{tCopy("copyContext")}</span>
							{draft.context.trim() ? (
								<span className="size-1.5 rounded-full bg-primary" aria-label={tCopy("contextAdded")} />
							) : null}
						</PopoverTrigger>
						<PopoverContent side="top" align="start" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))]">
							<PopoverHeader>
								<PopoverTitle className="text-sm">{tCopy("copyContext")}</PopoverTitle>
								<PopoverDescription className="text-xs">
									{tCopy("contextHelp")}</PopoverDescription>
							</PopoverHeader>
							<Textarea
								value={draft.context}
								onChange={(event) => updateDraft({ context: event.target.value })}
								placeholder={tCopy("contextPlaceholder")}
								className="min-h-28 resize-none"
							/>
						</PopoverContent>
					</Popover>
				</div>
				<div className="flex items-center gap-2">
					<span className="hidden text-[11px] text-muted-foreground sm:inline">
						{tCopy("enter")}</span>
					<Button
						type="button"
						size="icon"
						className="size-8 rounded-full"
						onClick={() => void handleSubmit()}
						disabled={!historyLoaded || isSubmitting || !draft.prompt.trim()}
						aria-label={isSubmitting ? tCopy("evaluating") : tCopy("sendDecision")}
					>
						<ArrowUp className="size-4" />
					</Button>
				</div>
			</div>
			{error ? <div className="border-t border-border/70 px-3.5 py-2 text-sm text-destructive">{error}</div> : null}
		</div>
	);
}
