import { useEffect, useState, type KeyboardEvent, type MouseEvent } from "react";

/**
 * Click twice to act (after T3 Code): the first click arms one control, the second confirms.
 * It disarms after 3 seconds, on a click elsewhere, on Escape, on blur and when the window loses focus.
 */
export function useInlineActionConfirm(scopeKey: string) {
	const [armed, setArmed] = useState<{ scopeKey: string; action: string; element: HTMLElement } | null>(null);
	const active = armed?.scopeKey === scopeKey ? armed : null;
	useEffect(() => {
		if (!armed) return;
		const disarm = () => setArmed(null);
		if (armed.scopeKey !== scopeKey) { disarm(); return; }
		const onPointerDown = (event: PointerEvent) => { if (event.target instanceof Node && !armed.element.contains(event.target)) disarm(); };
		const timeout = window.setTimeout(disarm, 3000);
		document.addEventListener("pointerdown", onPointerDown, true);
		window.addEventListener("blur", disarm);
		return () => { window.clearTimeout(timeout); document.removeEventListener("pointerdown", onPointerDown, true); window.removeEventListener("blur", disarm); };
	}, [armed, scopeKey]);
	return {
		isArmed: (action: string) => active?.action === action,
		props: (action: string, onConfirm: () => void) => ({
			onClick: (event: MouseEvent<HTMLElement>) => {
				if (active?.action === action && active.element === event.currentTarget) { setArmed(null); onConfirm(); }
				else setArmed({ scopeKey, action, element: event.currentTarget });
			},
			// The armed control holds focus, so Escape lands here; stop it before a surrounding menu closes on it.
			onKeyDown: (event: KeyboardEvent<HTMLElement>) => { if (event.key === "Escape" && active?.action === action) { event.preventDefault(); event.stopPropagation(); setArmed(null); } },
			onBlur: () => setArmed(null),
		}),
	};
}
