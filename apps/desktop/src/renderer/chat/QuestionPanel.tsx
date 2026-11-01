import { useEffect, useRef, useState, type RefObject } from "react";
import { Check, MessageCircleQuestion, X } from "lucide-react";
import type { AgentQuestion, QuestionRequest, Task } from "../../shared/workspace";
import { allowsOwnAnswer, optionValue, questionOptions } from "../../shared/agentQuestions";
import { errorText, useWorkspace } from "../app/workspace";
import { MessageContent } from "../components/MessageContent";
import { ScrollArea } from "../components/ui/scroll-area";
import { Kbd } from "../components/ui/kbd";
import { cn } from "../lib/utils";
import { BannerActions, BannerContent, BannerCount, BannerIcon, BannerRoot, BannerRowButton, BannerSeparator, BannerSlot, BannerToggleIcon } from "./ComposerBanner";
import { draftAnswer, draftError, draftFor, withOwnAnswer, type QuestionDraft } from "./questionDraft";
import { registerQuestionAnswerer } from "./questionComposer";

export { draftAnswer } from "./questionDraft";

const inputTypes = { number: "number", integer: "number", email: "email", uri: "url", date: "date", "date-time": "datetime-local" } as const;

/** The own-answer control: a line of text, several lines, or a typed field (number, date, …) with the question's bounds. */
function OwnAnswer({ question, value, disabled, placeholder, label, inputRef, onFocus, onChange, onEnter }: { question: AgentQuestion; value: string; disabled: boolean; placeholder: string; label: string; inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>; onFocus: () => void; onChange: (value: string) => void; onEnter: () => void }) {
	const input = question.input;
	const className = "min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70";
	if (input?.kind === "multiline") return <textarea ref={inputRef as RefObject<HTMLTextAreaElement>} aria-label={label} rows={3} disabled={disabled} placeholder={placeholder} value={value} maxLength={input.maxLength ?? 100000}
		onFocus={onFocus} onChange={event => onChange(event.target.value)} className={cn(className, "field-sizing-content max-h-60 min-h-16 resize-none py-1 leading-relaxed")} />;
	const type = question.isSecret ? "password" : input && input.kind in inputTypes ? inputTypes[input.kind as keyof typeof inputTypes] : "text";
	return <input ref={inputRef as RefObject<HTMLInputElement>} aria-label={label} type={type} autoComplete="off" disabled={disabled} placeholder={placeholder} value={value}
		{...type === "number" ? { min: input?.min, max: input?.max, step: input?.kind === "integer" ? 1 : "any" } : { minLength: input?.minLength, maxLength: input?.maxLength ?? 10000 }}
		onFocus={onFocus} onChange={event => onChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onEnter(); } }}
		className={cn(className, "h-7", type === "date" || type === "datetime-local" ? "[color-scheme:light] dark:[color-scheme:dark]" : "")} />;
}

/**
 * The agent's questions, above the composer: one question at a time, options as flat numbered rows,
 * the person's own answer as the last row (or typed in the composer). 1–9 pick, arrows move, Space toggles, Enter goes on, Esc folds the panel.
 */
function QuestionRequestPanel({ task, request, inline }: { task: Task; request: QuestionRequest; inline: boolean }) {
	const { command } = useWorkspace();
	const [step, setStep] = useState(0);
	const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({});
	const [highlight, setHighlight] = useState(0);
	const [collapsed, setCollapsed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [touched, setTouched] = useState(false);
	const panel = useRef<HTMLElement>(null);
	const otherInput = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
	const advance = useRef<ReturnType<typeof setTimeout>>(undefined);
	const question = request.questions[Math.min(step, request.questions.length - 1)];
	// Own properties only: agents choose question ids, and "__proto__" must not reach the object prototype.
	const draftOf = (value: AgentQuestion, from = drafts) => Object.hasOwn(from, value.id) ? from[value.id] : draftFor(value);
	const draft = draftOf(question);
	const options = questionOptions(question);
	const allowOther = allowsOwnAnswer(question);
	const rows = options.length + (allowOther ? 1 : 0);
	const last = step === request.questions.length - 1;
	const message = request.responseMode === "message";
	const answered = (value: AgentQuestion, from = drafts) => !draftError(value, draftOf(value, from));
	const set = (patch: Partial<QuestionDraft>) => setDrafts(current => ({ ...current, [question.id]: { ...draftOf(question, current), ...patch } }));

	async function send(dismissed = false, from = drafts) {
		if (busy) return;
		setBusy(true); setError("");
		const answers = dismissed ? {} : Object.fromEntries(request.questions.map(value => [value.id, draftAnswer(value, draftOf(value, from))]));
		try { await command({ type: "answer", id: task.id, requestId: request.id, answers, ...(dismissed ? { dismissed: true } : {}) }); }
		catch (reason) { setError(errorText(reason)); setBusy(false); }
	}
	/** Goes on to the next question, or sends the answers after the last; false when the current one is not answered yet. */
	const next = (from = drafts) => {
		const problem = draftError(question, draftOf(question, from));
		if (problem) { setTouched(true); return false; }
		setTouched(false);
		if (last) { if (!request.questions.every(value => answered(value, from))) return false; void send(false, from); }
		else { setStep(step + 1); setHighlight(0); }
		return true;
	};
	const choose = (index: number) => {
		if (index === options.length && allowOther) { set({ otherOn: question.multiSelect ? !draft.otherOn : true, ...(question.multiSelect ? {} : { picked: [] }) }); setHighlight(index); setTimeout(() => otherInput.current?.focus()); return; }
		const option = options[index];
		if (!option) return;
		const value = optionValue(option);
		setHighlight(index); setTouched(false);
		if (question.multiSelect) { set({ picked: draft.picked.includes(value) ? draft.picked.filter(item => item !== value) : [...draft.picked, value] }); return; }
		// A single choice moves on by itself after a moment; starting text the person edited stays.
		set({ picked: [value], otherOn: false, other: draft.otherOn && question.initialAnswer === undefined ? "" : draft.other });
		clearTimeout(advance.current);
		advance.current = setTimeout(() => { if (!last) { setStep(current => current + 1); setHighlight(0); } }, 200);
	};
	useEffect(() => () => clearTimeout(advance.current), []);

	// Enter in the composer answers the current question: its text is the person's own answer, a blank keeps the chosen option.
	const answerFromComposer = useRef<(text: string) => boolean>(() => false);
	answerFromComposer.current = text => {
		if (busy) return false;
		if (!text.trim()) return next();
		if (!allowOther) { setError("Choose one of the options for this question."); return false; }
		const updated = { ...drafts, [question.id]: withOwnAnswer(question, draft, text) };
		setDrafts(updated); setError(""); return next(updated);
	};
	const problem = draftError(question, draft);
	const ready = !problem && (!last || request.questions.every(value => answered(value)));
	const back = useRef(() => {}); back.current = () => { if (step > 0) { setStep(step - 1); setHighlight(0); } };
	useEffect(() => registerQuestionAnswerer(task.id, { answer: text => answerFromComposer.current(text), step, count: request.questions.length, ready, busy, choiceOnly: !allowOther, previous: () => back.current() }), [task.id, request.id, step, request.questions.length, ready, busy, allowOther]);

	useEffect(() => {
		if (collapsed) return;
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const typing = Boolean(target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)));
			const inside = Boolean(target && panel.current?.contains(target));
			if (event.ctrlKey || event.metaKey) { if (event.key === "Enter" && (inside || !typing)) { event.preventDefault(); next(); } return; }
			if (event.altKey || (typing && !(inside && event.key === "Escape"))) return;
			if (/^[1-9]$/.test(event.key) && Number(event.key) <= rows) { event.preventDefault(); choose(Number(event.key) - 1); }
			else if (event.key === "ArrowDown" && (inside || !typing)) { event.preventDefault(); setHighlight(value => Math.min(rows - 1, value + 1)); }
			else if (event.key === "ArrowUp" && (inside || !typing)) { event.preventDefault(); setHighlight(value => Math.max(0, value - 1)); }
			else if (event.key === " " && inside) { event.preventDefault(); choose(highlight); }
			else if (event.key === "Enter" && inside) { event.preventDefault(); next(); }
			else if (event.key === "Escape" && inside) { event.preventDefault(); setCollapsed(true); }
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	});

	const selectedPreview = options.find(option => option.preview && draft.picked.includes(optionValue(option)));
	const otherActive = draft.otherOn || !options.length;
	const ownFilled = otherActive && (question.initialAnswer !== undefined || draft.other.trim().length > 0);
	const optional = question.required === false;
	const ownPlaceholder = options.length ? "Type your own answer" : optional ? "Type your answer, or leave it empty" : "Type your answer";
	const dismiss = () => { if (!busy) void send(true); };
	const panelBody = <section ref={panel} aria-label="Agent questions" aria-busy={busy} tabIndex={-1} className="outline-none">
		<BannerRowButton aria-expanded={!collapsed} title={collapsed ? "Show the question and its options" : "Hide the question and its options"} onClick={() => setCollapsed(!collapsed)}>
			<BannerIcon><MessageCircleQuestion className="text-indigo-600 dark:text-indigo-300" /></BannerIcon>
			<BannerContent>
				<span data-question-header className={cn("min-w-0 shrink-0 truncate text-muted-foreground", collapsed && "max-w-1/2")}>{question.header}</span>
				{request.origin && <span className="min-w-0 truncate text-muted-foreground/70">from {request.origin}</span>}
				{collapsed && <><BannerSeparator /><span className="min-w-0 flex-1 truncate text-foreground/80">{question.question}</span></>}
			</BannerContent>
			<BannerActions className="gap-0">
				{request.questions.length > 1 && <BannerCount>{step + 1}/{request.questions.length}</BannerCount>}
				<BannerToggleIcon expanded={!collapsed} />
				{/* A span: a button cannot sit inside the header row, which is itself a button. */}
				<span role="button" tabIndex={0} aria-label="Dismiss questions" aria-disabled={busy || undefined} title={message ? "Dismiss: no answer is sent" : "Dismiss: the agent carries on without your answers"}
					onClick={event => { event.stopPropagation(); dismiss(); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); dismiss(); } }}
					className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></span>
			</BannerActions>
		</BannerRowButton>
		{!collapsed && <div className="flex flex-col gap-2 pr-2 pl-8 text-[13px]">
			{/* On short windows the question scrolls, so the conversation keeps some room. */}
			<ScrollArea className="max-h-[40vh]" viewportClassName="max-h-[40vh]"><div className="flex flex-col gap-2 pr-2">
			<div data-selectable className="pt-1 leading-relaxed text-foreground/85"><MessageContent text={question.question} projectId={task.projectId} /></div>
			{question.multiSelect && <p className="-mt-1 text-xs text-muted-foreground">Select one or more options.</p>}
			{message && <p className="-mt-1 text-xs text-muted-foreground">Your answer is sent to the agent as a message.</p>}
			<div role={question.multiSelect ? "group" : "radiogroup"} aria-label={question.header} className="-ml-1.5 flex flex-col">
				{options.map((option, index) => {
					const on = draft.picked.includes(optionValue(option));
					return <button key={`${index}:${optionValue(option)}`} type="button" role={question.multiSelect ? "checkbox" : "radio"} aria-checked={on} disabled={busy} onClick={() => choose(index)} onMouseEnter={() => setHighlight(index)}
						className={cn("flex w-full items-start gap-2.5 rounded-md py-1.5 pl-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50", on ? "text-foreground" : "text-foreground/75", highlight === index ? "bg-muted/45" : "hover:bg-muted/30")}>
						<span className="flex h-5 shrink-0 items-center"><OptionMark on={on} multiple={Boolean(question.multiSelect)} /></span>
						<span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="font-medium">{option.label}</span>{option.description && option.description !== option.label && <span className="text-xs text-muted-foreground">{option.description}</span>}</span>
						{index < 9 && <span className="flex h-5 w-7 shrink-0 items-center justify-center"><Kbd className="rounded-md">{index + 1}</Kbd></span>}
					</button>;
				})}
				{allowOther && <div className={cn("flex gap-2.5 rounded-md py-1.5 pl-1.5", question.input?.kind === "multiline" ? "items-start" : "items-center", highlight === options.length && "bg-muted/45")} onMouseEnter={() => setHighlight(options.length)}>
					{options.length > 0 && <span className="flex h-5 shrink-0 items-center"><OptionMark on={ownFilled} multiple={Boolean(question.multiSelect)} /></span>}
					<OwnAnswer question={question} inputRef={otherInput} value={draft.other} disabled={busy} label={options.length ? "Your own answer" : question.question} placeholder={ownPlaceholder}
						onFocus={() => { if (options.length && !draft.otherOn) set({ otherOn: true, ...(question.multiSelect ? {} : { picked: [] }) }); }}
						onChange={value => set({ other: value, otherOn: true, ...(question.multiSelect ? {} : { picked: [] }) })}
						onEnter={() => next()} />
					{options.length > 0 && options.length < 9 && <span className="flex h-5 w-7 shrink-0 items-center justify-center"><Kbd className="rounded-md">{options.length + 1}</Kbd></span>}
				</div>}
			</div>
			{selectedPreview?.preview && <div data-selectable className="border-l-2 border-border pl-3"><MessageContent text={selectedPreview.preview} projectId={task.projectId} /></div>}
			{touched && problem && <p className="text-xs text-destructive">{problem}</p>}
			{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
			</div></ScrollArea>
			{/* Beside the message box its send button stands in for these; elsewhere (a side chat, a comparison) the panel keeps its own. */}
			{inline && <div className="flex items-center gap-2 pb-1">
				{step > 0 && <button type="button" disabled={busy} onClick={() => { setStep(step - 1); setHighlight(0); }} className="h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Previous</button>}
				<button type="button" disabled={busy || !ready} onClick={() => next()}
					className="ml-auto h-7 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:opacity-85 disabled:opacity-40">{busy ? "Sending…" : !last ? "Next question" : request.questions.length > 1 ? "Submit answers" : "Submit answer"}</button>
			</div>}
		</div>}
	</section>;
	return inline ? <BannerRoot detached>{panelBody}</BannerRoot> : <BannerSlot><BannerRoot>{panelBody}</BannerRoot></BannerSlot>;
}

/** A radio or checkbox mark for an option row. */
function OptionMark({ on, multiple }: { on: boolean; multiple: boolean }) {
	return <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-md border", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background dark:bg-input/30")}>
		{on && (multiple ? <Check className="size-3" strokeWidth={3} /> : <span className="size-1.5 rounded-[2px] bg-primary-foreground" />)}
	</span>;
}

/** Every pending question request for a chat, first one in front. */
export function QuestionPanel({ task, inline = false, held }: { task: Task; inline?: boolean; held?: ReadonlySet<string> }) {
	const request = task.questions?.[0];
	// A question that arrived while the person was typing waits until they pause (composerTypingGuard).
	if (!request || held?.has(request.id)) return null;
	return <QuestionRequestPanel key={request.id} task={task} request={request} inline={inline} />;
}
