import { useEffect, useRef, useState, type RefObject } from "react";
import { Check, ChevronDown, MessageCircleQuestion, X } from "lucide-react";
import type { AgentQuestion, QuestionRequest, Task } from "../../shared/workspace";
import { allowsOwnAnswer, optionValue, questionOptions } from "../../shared/agentQuestions";
import { errorText, useWorkspace } from "../app/workspace";
import { MessageContent } from "../components/MessageContent";
import { cn } from "../lib/utils";
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
 * The agent's questions, above the composer as in T3 Code: one question at a time, options as flat numbered rows,
 * the person's own answer as the last row (or typed in the composer). 1–9 pick, arrows move, Space toggles, Enter goes on, Esc folds the panel.
 */
function QuestionRequestPanel({ task, request }: { task: Task; request: QuestionRequest }) {
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
	const draftOf = (value: AgentQuestion, from = drafts) => from[value.id] ?? draftFor(value);
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
		// A single choice moves on by itself after a moment, as in T3; starting text the person edited stays.
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
	useEffect(() => registerQuestionAnswerer(task.id, { answer: text => answerFromComposer.current(text) }), [task.id, request.id]);

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
	const problem = draftError(question, draft);
	const optional = question.required === false;
	const ownPlaceholder = options.length ? "Type your own answer" : optional ? "Type your answer, or leave it empty" : "Type your answer";
	return <section ref={panel} aria-label="Agent questions" aria-busy={busy} tabIndex={-1} className="mx-auto w-full max-w-[760px] border-t border-border px-6 pt-3 pb-1 outline-none">
		<div className="flex items-center gap-2 text-[13px]">
			<MessageCircleQuestion className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
			<span className="shrink-0 font-semibold">{question.header}</span>
			{request.origin && <span className="min-w-0 truncate text-xs text-muted-foreground">from {request.origin}</span>}
			{collapsed && <span className="min-w-0 truncate text-muted-foreground">{question.question}</span>}
			<span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{request.questions.length > 1 ? `${step + 1} of ${request.questions.length}` : ""}</span>
			<button type="button" aria-label={collapsed ? "Show question" : "Hide question"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronDown className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")} /></button>
			<button type="button" aria-label="Dismiss questions" title={message ? "Dismiss: no answer is sent" : "Dismiss: the agent carries on without your answers"} disabled={busy} onClick={() => void send(true)} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
		</div>
		{!collapsed && <div className="mt-2 flex flex-col gap-2">
			<div data-selectable className="text-[14px] leading-relaxed"><MessageContent text={question.question} projectId={task.projectId} /></div>
			{question.multiSelect && <p className="-mt-1 text-xs text-muted-foreground">Select one or more options.</p>}
			{message && <p className="-mt-1 text-xs text-muted-foreground">Your answer is sent to the agent as a message.</p>}
			<div role={question.multiSelect ? "group" : "radiogroup"} aria-label={question.header} className="flex flex-col gap-0.5">
				{options.map((option, index) => {
					const on = draft.picked.includes(optionValue(option));
					return <button key={`${index}:${optionValue(option)}`} type="button" role={question.multiSelect ? "checkbox" : "radio"} aria-checked={on} disabled={busy} onClick={() => choose(index)} onMouseEnter={() => setHighlight(index)}
						className={cn("flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors", on ? "bg-muted/55" : highlight === index ? "bg-muted/30" : "hover:bg-muted/30")}>
						<span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{option.label}</span>{option.description && option.description !== option.label && <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>}</span>
						<span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded border text-[11px] font-medium", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{on ? <Check className="size-3" /> : index < 9 ? index + 1 : ""}</span>
					</button>;
				})}
				{allowOther && <div className={cn("flex gap-3 rounded-md px-2.5 py-1.5", question.input?.kind === "multiline" ? "items-start" : "items-center", otherActive ? "bg-muted/55" : highlight === options.length ? "bg-muted/30" : "")} onMouseEnter={() => setHighlight(options.length)}>
					<OwnAnswer question={question} inputRef={otherInput} value={draft.other} disabled={busy} label={options.length ? "Your own answer" : question.question} placeholder={ownPlaceholder}
						onFocus={() => { if (options.length && !draft.otherOn) set({ otherOn: true, ...(question.multiSelect ? {} : { picked: [] }) }); }}
						onChange={value => set({ other: value, otherOn: true, ...(question.multiSelect ? {} : { picked: [] }) })}
						onEnter={() => next()} />
					{options.length > 0 && <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded border text-[11px] font-medium", ownFilled ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{ownFilled ? <Check className="size-3" /> : options.length < 9 ? options.length + 1 : ""}</span>}
				</div>}
			</div>
			{selectedPreview?.preview && <div data-selectable className="border-l-2 border-border pl-3 text-[13px]"><MessageContent text={selectedPreview.preview} projectId={task.projectId} /></div>}
			{touched && problem && <p className="text-xs text-destructive">{problem}</p>}
			{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
			<div className="flex items-center gap-2 pb-1">
				{step > 0 && <button type="button" disabled={busy} onClick={() => { setStep(step - 1); setHighlight(0); }} className="h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Previous</button>}
				<button type="button" disabled={busy || !!problem || (last && !request.questions.every(value => answered(value)))} onClick={() => next()}
					className="ml-auto h-7 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/85 disabled:opacity-50">{busy ? "Sending…" : !last ? "Next question" : request.questions.length > 1 ? "Submit answers" : "Submit answer"}</button>
			</div>
		</div>}
	</section>;
}

/** Every pending question request for a chat, first one in front. */
export function QuestionPanel({ task }: { task: Task }) {
	const request = task.questions?.[0];
	if (!request) return null;
	return <QuestionRequestPanel key={request.id} task={task} request={request} />;
}
