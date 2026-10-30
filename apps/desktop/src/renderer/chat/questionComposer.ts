import { useSyncExternalStore } from "react";

/** The question panel lets the composer answer its current question, as T3 Code's composer does. answer is false when the text did not answer it (the panel shows why). */
export type QuestionAnswerer = { answer: (text: string) => boolean };
const answerers = new Map<string, QuestionAnswerer>();
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export function registerQuestionAnswerer(taskId: string, answerer: QuestionAnswerer) {
	answerers.set(taskId, answerer); emit();
	return () => { if (answerers.get(taskId) === answerer) { answerers.delete(taskId); emit(); } };
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useQuestionAnswerer = (taskId: string) => useSyncExternalStore(subscribe, () => answerers.get(taskId));
