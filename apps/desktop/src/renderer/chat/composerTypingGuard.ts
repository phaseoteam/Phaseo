import { useEffect, useMemo, useState } from "react";

/**
 * A question or approval that arrives while the person is typing waits until they pause, so the Enter they were about
 * to press sends their message instead of answering or declining something they never saw.
 */
export const typingIdleMs = 1500;

export type TypingGuardState = { seen: ReadonlySet<string>; held: ReadonlySet<string>; focused: boolean; lastTypedAt: number };
export type TypingGuardEvent = { type: "requests"; ids: readonly string[]; now: number } | { type: "type"; now: number } | { type: "focus" | "blur" | "send" | "idle" };

export const typingGuardState = (): TypingGuardState => ({ seen: new Set(), held: new Set(), focused: false, lastTypedAt: -Infinity });

export function updateTypingGuard(state: TypingGuardState, event: TypingGuardEvent): TypingGuardState {
	switch (event.type) {
		case "requests": {
			const seen = new Set(state.seen), held = new Set([...state.held].filter(id => event.ids.includes(id)));
			for (const id of event.ids) {
				if (!seen.has(id) && state.focused && event.now - state.lastTypedAt < typingIdleMs) held.add(id);
				seen.add(id);
			}
			return { ...state, seen, held: held.size === state.held.size && [...held].every(id => state.held.has(id)) ? state.held : held };
		}
		case "type": return { ...state, lastTypedAt: event.now };
		case "focus": return { ...state, focused: true };
		case "blur": case "send": case "idle":
			return { ...state, held: state.held.size ? new Set() : state.held, lastTypedAt: -Infinity, focused: event.type === "blur" ? false : state.focused };
	}
}

/** The requests to keep out of sight for now, for one chat. */
export function useTypingGuard(scope: string, ids: readonly string[]) {
	const key = ids.join("\n");
	const [snapshot, setSnapshot] = useState(() => ({ scope, key, state: updateTypingGuard(typingGuardState(), { type: "requests", ids, now: Date.now() }) }));
	if (snapshot.scope !== scope || snapshot.key !== key) setSnapshot(current => ({ scope, key, state: updateTypingGuard(current.scope === scope ? current.state : { ...typingGuardState(), focused: current.state.focused }, { type: "requests", ids, now: Date.now() }) }));
	// Only the state setter is used, so the handlers stay the same across renders.
	const handlers = useMemo(() => {
		const dispatch = (event: TypingGuardEvent) => setSnapshot(current => ({ ...current, state: updateTypingGuard(current.state, event) }));
		return { dispatch, typed: () => dispatch({ type: "type", now: Date.now() }), focus: () => dispatch({ type: "focus" }), blur: () => dispatch({ type: "blur" }), sent: () => dispatch({ type: "send" }) };
	}, []);
	const { held, lastTypedAt } = snapshot.state;
	useEffect(() => {
		if (!held.size) return;
		const timer = setTimeout(() => handlers.dispatch({ type: "idle" }), Math.max(0, lastTypedAt + typingIdleMs - Date.now()));
		return () => clearTimeout(timer);
	}, [held, lastTypedAt, handlers]);
	return { held, typed: handlers.typed, focus: handlers.focus, blur: handlers.blur, sent: handlers.sent };
}
