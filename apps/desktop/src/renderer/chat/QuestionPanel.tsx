import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, MessageCircleQuestion, X } from "lucide-react";
import type { AgentQuestion, Task } from "../../shared/workspace";
import { errorText, useWorkspace } from "../app/workspace";
import { MessageContent } from "../components/MessageContent";
import { cn } from "../lib/utils";

type Draft = { picked: string[]; other: string; otherOn: boolean };
const empty: Draft = { picked: [], other: "", otherOn: false };

/** The answer a draft gives: chosen options, then the person's own words (which stand alone for a single choice). */
export function draftAnswer(question: AgentQuestion, draft: Draft) {
	const other = draft.otherOn || !question.options?.length ? draft.other.trim() : "";
	if (!question.multiSelect) return other ? [other] : draft.picked.slice(0, 1);
	return [...draft.picked, ...(other ? [other] : [])];
}

/**
 * The agent's questions, above the composer as in T3 Code: one question at a time, options as flat numbered rows,
 * the person's own answer as the last row. 1–9 pick, arrows move, Space toggles, Enter goes on, Esc folds the panel.
 */
function QuestionRequest({ task, request }: { task: Task; request: { id: string; questions: AgentQuestion[] } }) {
	const { command } = useWorkspace();
	const [step, setStep] = useState(0);
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	const [highlight, setHighlight] = useState(0);
	const [collapsed, setCollapsed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const panel = useRef<HTMLElement>(null);
	const otherInput = useRef<HTMLInputElement>(null);
	const advance = useRef<ReturnType<typeof setTimeout>>(undefined);
	const question = request.questions[Math.min(step, request.questions.length - 1)];
	const draft = drafts[question.id] ?? empty;
	const options = question.options ?? [];
	const allowOther = question.isOther || !options.length;
	const rows = options.length + (allowOther ? 1 : 0);
	const last = step === request.questions.length - 1;
	const answered = (value: AgentQuestion) => draftAnswer(value, drafts[value.id] ?? empty).length > 0;
	const set = (patch: Partial<Draft>) => setDrafts(current => ({ ...current, [question.id]: { ...(current[question.id] ?? empty), ...patch } }));

	async function send(dismissed = false) {
		if (busy) return;
		setBusy(true); setError("");
		const answers = dismissed ? {} : Object.fromEntries(request.questions.map(value => [value.id, draftAnswer(value, drafts[value.id] ?? empty)]));
		try { await command({ type: "answer", id: task.id, requestId: request.id, answers, ...(dismissed ? { dismissed: true } : {}) }); }
		catch (reason) { setError(errorText(reason)); setBusy(false); }
	}
	const next = () => { if (!answered(question)) return; if (last) { if (request.questions.every(answered)) void send(); } else { setStep(step + 1); setHighlight(0); } };
	const choose = (index: number) => {
		if (index === options.length && allowOther) { set({ otherOn: question.multiSelect ? !draft.otherOn : true, ...(question.multiSelect ? {} : { picked: [] }) }); setHighlight(index); setTimeout(() => otherInput.current?.focus()); return; }
		const label = options[index]?.label;
		if (!label) return;
		setHighlight(index);
		if (question.multiSelect) { set({ picked: draft.picked.includes(label) ? draft.picked.filter(value => value !== label) : [...draft.picked, label] }); return; }
		// A single choice moves on by itself after a moment, as in T3.
		set({ picked: [label], otherOn: false, other: draft.otherOn ? "" : draft.other });
		clearTimeout(advance.current);
		advance.current = setTimeout(() => { if (!last) { setStep(current => current + 1); setHighlight(0); } }, 200);
	};
	useEffect(() => () => clearTimeout(advance.current), []);

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

	const selectedPreview = options.find(option => option.preview && draft.picked.includes(option.label));
	return <section ref={panel} aria-label="Agent questions" aria-busy={busy} tabIndex={-1} className="mx-auto w-full max-w-[760px] border-t border-border px-6 pt-3 pb-1 outline-none">
		<div className="flex items-center gap-2 text-[13px]">
			<MessageCircleQuestion className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
			<span className="shrink-0 font-semibold">{question.header}</span>
			{collapsed && <span className="min-w-0 truncate text-muted-foreground">{question.question}</span>}
			<span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{request.questions.length > 1 ? `${step + 1} of ${request.questions.length}` : ""}</span>
			<button type="button" aria-label={collapsed ? "Show question" : "Hide question"} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><ChevronDown className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")} /></button>
			<button type="button" aria-label="Dismiss questions" title="Dismiss: the agent carries on without your answers" disabled={busy} onClick={() => void send(true)} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
		</div>
		{!collapsed && <div className="mt-2 flex flex-col gap-2">
			<div data-selectable className="text-[14px] leading-relaxed"><MessageContent text={question.question} projectId={task.projectId} /></div>
			{question.multiSelect && <p className="-mt-1 text-xs text-muted-foreground">Select one or more options.</p>}
			<div role={question.multiSelect ? "group" : "radiogroup"} aria-label={question.header} className="flex flex-col gap-0.5">
				{options.map((option, index) => {
					const on = draft.picked.includes(option.label);
					return <button key={option.label} type="button" role={question.multiSelect ? "checkbox" : "radio"} aria-checked={on} disabled={busy} onClick={() => choose(index)} onMouseEnter={() => setHighlight(index)}
						className={cn("flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors", on ? "bg-muted/55" : highlight === index ? "bg-muted/30" : "hover:bg-muted/30")}>
						<span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">{option.label}</span>{option.description && option.description !== option.label && <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>}</span>
						<span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded border text-[11px] font-medium", on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{on ? <Check className="size-3" /> : index < 9 ? index + 1 : ""}</span>
					</button>;
				})}
				{allowOther && <div className={cn("flex items-center gap-3 rounded-md px-2.5 py-1.5", draft.otherOn || !options.length ? "bg-muted/55" : highlight === options.length ? "bg-muted/30" : "")} onMouseEnter={() => setHighlight(options.length)}>
					<input ref={otherInput} aria-label={options.length ? "Your own answer" : question.question} type={question.isSecret ? "password" : "text"} autoComplete="off" maxLength={10000} disabled={busy}
						placeholder={options.length ? "Type your own answer" : "Type your answer"} value={draft.other}
						onFocus={() => { if (options.length && !draft.otherOn) set({ otherOn: true, ...(question.multiSelect ? {} : { picked: [] }) }); }}
						onChange={event => set({ other: event.target.value, otherOn: true, ...(question.multiSelect ? {} : { picked: [] }) })}
						onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); next(); } }}
						className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70" />
					{options.length > 0 && <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded border text-[11px] font-medium", draft.otherOn && draft.other.trim() ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{draft.otherOn && draft.other.trim() ? <Check className="size-3" /> : options.length < 9 ? options.length + 1 : ""}</span>}
				</div>}
			</div>
			{selectedPreview?.preview && <div data-selectable className="border-l-2 border-border pl-3 text-[13px]"><MessageContent text={selectedPreview.preview} projectId={task.projectId} /></div>}
			{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
			<div className="flex items-center gap-2 pb-1">
				{step > 0 && <button type="button" disabled={busy} onClick={() => { setStep(step - 1); setHighlight(0); }} className="h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">Previous</button>}
				<button type="button" disabled={busy || !answered(question) || (last && !request.questions.every(answered))} onClick={next}
					className="ml-auto h-7 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/85 disabled:opacity-50">{busy ? "Sending…" : !last ? "Next question" : request.questions.length > 1 ? "Submit answers" : "Submit answer"}</button>
			</div>
		</div>}
	</section>;
}

/** Every pending question request for a chat, first one in front. */
export function QuestionPanel({ task }: { task: Task }) {
	const request = task.questions?.[0];
	if (!request) return null;
	return <QuestionRequest key={request.id} task={task} request={request} />;
}
