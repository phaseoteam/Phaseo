import { useSyncExternalStore } from "react";

/**
 * The question panel lets the composer answer its current question. answer is false when the text did not answer it (the
 * panel shows why). The rest drives the composer's Previous and Next buttons, which stand in for the panel's own.
 */
export type QuestionAnswerer = {
	answer: (text: string) => boolean;
	step: number;
	count: number;
	/** The current question can go on (or the answers can be sent, on the last). */
	ready: boolean;
	busy: boolean;
	/** The question takes no typed answer: only its options. */
	choiceOnly: boolean;
	previous: () => void;
};
const answerers = new Map<string, QuestionAnswerer>();
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export function registerQuestionAnswerer(taskId: string, answerer: QuestionAnswerer) {
	answerers.set(taskId, answerer); emit();
	return () => { if (answerers.get(taskId) === answerer) { answerers.delete(taskId); emit(); } };
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useQuestionAnswerer = (taskId: string) => useSyncExternalStore(subscribe, () => answerers.get(taskId));
