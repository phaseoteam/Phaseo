import { useState, type MouseEvent, type PointerEvent } from "react";
import { ArrowUp, Check, CornerUpRight, ListPlus, LoaderCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import { Tip } from "../components/ui/tooltip";
import { keyLabel } from "../../shared/keybindings";
import { isMac } from "../lib/shortcuts";
import { cn } from "../lib/utils";
import { answerLabel, primaryAction, primaryLabels } from "./composerSend";
import { useSendKey } from "./sendKey";

export type QuestionProgress = { step: number; count: number; ready: boolean; busy: boolean; onPrevious?: () => void };

/** A wide action button (Implement, Refine, the answer's Next and Submit): same colours as Send. */
const wideAction = "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-foreground px-3.5 text-[13px] font-medium text-background shadow-xs outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40";
const keepFocus = (event: PointerEvent) => { event.preventDefault(); };

/**
 * Stop, send, queue or steer, update a queued message, implement or refine a plan, or answer a question. The button
 * shows what a click does now; holding Ctrl/⌘ over it while a turn runs switches queue to steer.
 */
export function ComposerPrimaryActions({ running, hasContent, canSend, busy, onSubmit, onStop, editing = false, plan = false, canSteer = false, steerBlocker, question }: {
	running: boolean;
	hasContent: boolean;
	canSend: boolean;
	busy?: boolean;
	onSubmit: (alternate: boolean) => void;
	onStop?: () => void;
	editing?: boolean;
	plan?: boolean;
	canSteer?: boolean;
	/** Why this agent cannot take a message mid-turn. */
	steerBlocker?: string;
	question?: QuestionProgress;
}) {
	const sendKey = useSendKey();
	const [modifier, setModifier] = useState(false);
	const action = primaryAction({ running, hasContent, editing, question: Boolean(question), plan, canStop: Boolean(onStop), canSteer, alternate: modifier });
	const mod = isMac() ? "⌘" : "Ctrl";
	const track = (event: PointerEvent) => setModifier(event.ctrlKey || event.metaKey);

	const stop = <Tip key="stop" label="Stop"><button type="button" aria-label="Stop" onPointerDown={keepFocus} onClick={onStop}
		className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md bg-destructive/90 text-white shadow-xs transition-colors hover:bg-destructive">
		<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden><rect x="2" y="2" width="8" height="8" rx="1.5" /></svg>
	</button></Tip>;

	if (action === "answer" && question) return <div className="flex items-center justify-end gap-2">
		{running && onStop && stop}
		{question.step > 0 && <Button type="button" size="sm" variant="outline" onPointerDown={keepFocus} disabled={question.busy} onClick={question.onPrevious}>Previous</Button>}
		<button type="submit" className={wideAction} onPointerDown={keepFocus} disabled={question.busy || !question.ready}>{answerLabel(question)}</button>
	</div>;
	if (action === "implement" || action === "refine") return <button type="submit" className={wideAction} onPointerDown={keepFocus} disabled={busy || !canSend}>{busy ? "Sending…" : primaryLabels[action]}</button>;
	if (action === "stop") return stop;

	const steerHint = action === "queue" || action === "steer"
		? canSteer ? `Click to queue, ${mod}-click${sendKey === "enter" ? ` or ${keyLabel("mod+enter", isMac())}` : ""} to send into the running turn` : steerBlocker ?? "Queued messages send when the turn finishes"
		: action === "send" ? `Send (${sendKey === "enter" ? "Enter" : keyLabel("mod+enter", isMac())})` : primaryLabels[action];
	const click = (event: MouseEvent) => { event.preventDefault(); onSubmit(event.ctrlKey || event.metaKey); };
	return <Tip label={steerHint}>
		<button type="submit" aria-label={primaryLabels[action]} disabled={busy || !canSend} onPointerDown={keepFocus} onPointerEnter={track} onPointerMove={track} onPointerLeave={() => setModifier(false)} onClick={click}
			className={cn("grid size-8 shrink-0 cursor-pointer place-items-center rounded-md bg-foreground text-background shadow-xs transition-[opacity,transform] duration-150 hover:scale-105 hover:opacity-90 disabled:pointer-events-none disabled:bg-foreground/15 disabled:text-muted-foreground disabled:shadow-none")}>
			{busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" />
				: action === "update" ? <Check aria-hidden className="size-4" strokeWidth={2.5} />
				: action === "queue" ? <ListPlus aria-hidden className="size-4" />
				: action === "steer" ? <CornerUpRight aria-hidden className="size-4" />
				: <ArrowUp aria-hidden className="size-4" strokeWidth={2.5} />}
		</button>
	</Tip>;
}
