// Motion for the auth dialog shell.
//
// - Focus anchoring: the dialog is centred, so when its content resizes (the other
//   options collapse as you type, an error appears) everything would move, including
//   the field you are typing in. Resizes shift the dialog (margin-top) so the last text
//   field used stays put, kept inside the viewport. Every resize is relative to that
//   field, so undoing them (collapse → expand) ends exactly centred again.
// - Step transitions: switching step (sign-in ↔ sign-up ↔ SSO …) animates the dialog's
//   height from the old step to the new one and resets any anchoring shift with it.
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/** Same curve as the in-step collapse animations. */
export const DIALOG_EASE = "cubic-bezier(0.16,1,0.3,1)";
export const STEP_TRANSITION_MS = 300;
/** Space kept between the dialog and the viewport edge when shifting it. */
const VIEWPORT_MARGIN = 16;

function prefersReducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * How far to move the dialog so the anchor returns to where it was, kept inside the
 * viewport. `drift` is how far the anchor moved; the result is added to the shift.
 */
export function anchorCorrection(drift: number, dialogTop: number, dialogBottom: number, viewportHeight: number): number {
	const wanted = -drift;
	const min = VIEWPORT_MARGIN - dialogTop; // can't move the top above the margin
	const max = viewportHeight - VIEWPORT_MARGIN - dialogBottom; // nor the bottom below it
	if (min > max) return 0; // taller than the viewport: it scrolls instead
	return Math.min(Math.max(wanted, min), max);
}

type Anchor = { element: Element; top: number };

/**
 * Keeps the last text field used still while `content`'s dialog
 * resizes. `content` comes from a callback ref: the dialog mounts its popup a render
 * after it opens, so a ref object would still be empty when an effect first runs. Returns a function that animates the shift back to zero (used on step change).
 */
export function useFocusAnchor(content: HTMLElement | null) {
	const shift = useRef(0);
	const popupRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const popup = content?.closest<HTMLElement>('[data-slot="dialog-content"]') ?? null;
		popupRef.current = popup;
		if (!content || !popup) return;
		shift.current = 0;
		popup.style.marginTop = "";
		let anchor: Anchor | null = null;

		// Anchor to the last text field used, captured before the DOM reacts to the event. It
		// stays the anchor after focus moves on (submitting disables the button and drops focus,
		// then the error grows in), so every resize is relative to the same field and undoing
		// them returns the dialog exactly to the centre.
		const capture = (event: Event) => {
			const target = event.target;
			if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.type !== "hidden") {
				anchor = { element: target, top: target.getBoundingClientRect().top };
			}
		};
		const events = ["focusin", "keydown", "input"] as const;
		for (const type of events) popup.addEventListener(type, capture, true);
		// The centred position moves with the viewport: re-measure rather than "correct" it.
		const onWindowResize = () => {
			if (anchor) anchor.top = anchor.element.getBoundingClientRect().top;
		};
		window.addEventListener("resize", onWindowResize);

		const observer = new ResizeObserver(() => {
			if (!anchor) return;
			if (!anchor.element.isConnected) {
				anchor = null; // the step changed
				return;
			}
			const drift = anchor.element.getBoundingClientRect().top - anchor.top;
			if (Math.abs(drift) < 0.5) return;
			const rect = popup.getBoundingClientRect();
			const correction = anchorCorrection(drift, rect.top, rect.bottom, window.innerHeight);
			if (correction === 0) return;
			shift.current += correction;
			// Land in the same frame. The popup's `duration-100` class would otherwise ease every
			// margin change over 100 ms (transition-property defaults to `all`), and the correction
			// would lag. Its open/close animations are keyframes, so they are unaffected.
			popup.style.transition = "none";
			popup.style.marginTop = `${shift.current}px`;
			anchor.top = anchor.element.getBoundingClientRect().top;
		});
		observer.observe(content);

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", onWindowResize);
			for (const type of events) popup.removeEventListener(type, capture, true);
		};
	}, [content]);

	/** Animate any shift back to zero (the dialog re-centres). Stable across renders. */
	return useCallback((durationMs: number) => {
		const popup = popupRef.current;
		if (!popup || shift.current === 0) return;
		shift.current = 0;
		if (durationMs > 0) popup.style.transition = `margin-top ${durationMs}ms ${DIALOG_EASE}`;
		popup.style.marginTop = "0px";
	}, []);
}

/**
 * Animates `wrapper`'s height from the previous step's height to the new one when
 * `step` changes, and calls `onStepChange` with the duration so other motion can follow.
 */
export function useStepHeightTransition(
	wrapper: HTMLElement | null,
	step: string,
	onStepChange?: (durationMs: number) => void,
) {
	const lastHeight = useRef(0);
	const lastStep = useRef(step);
	const onStepChangeRef = useRef(onStepChange);
	useEffect(() => {
		onStepChangeRef.current = onStepChange;
	});

	// Track the rendered height, so a step change knows where to animate from.
	useEffect(() => {
		if (!wrapper) return;
		const observer = new ResizeObserver(() => {
			lastHeight.current = wrapper.getBoundingClientRect().height;
		});
		observer.observe(wrapper);
		return () => observer.disconnect();
	}, [wrapper]);

	useLayoutEffect(() => {
		if (!wrapper) {
			lastStep.current = step;
			lastHeight.current = 0;
			return;
		}
		if (lastStep.current === step) return;
		lastStep.current = step;
		const from = lastHeight.current;
		const to = wrapper.scrollHeight;
		const duration = prefersReducedMotion() ? 0 : STEP_TRANSITION_MS;
		onStepChangeRef.current?.(duration);
		if (!duration || !from || Math.abs(from - to) < 1) return;
		return animateHeight(wrapper, from, to, duration);
	}, [wrapper, step]);
}

/** Animates an element from one fixed height to another, then back to auto. Returns a cancel function. */
function animateHeight(element: HTMLElement, from: number, to: number, duration: number): () => void {
	element.style.overflow = "hidden";
	element.style.height = `${from}px`;
	void element.offsetHeight; // start from the old height
	element.style.transition = `height ${duration}ms ${DIALOG_EASE}`;
	element.style.height = `${to}px`;
	const done = (event?: TransitionEvent) => {
		// Child transitions (fades, collapses) bubble up: only the element's own height ends it.
		if (event && (event.target !== element || event.propertyName !== "height")) return;
		clearTimeout(timer);
		element.removeEventListener("transitionend", done);
		element.style.height = "";
		element.style.transition = "";
		element.style.overflow = "";
	};
	element.addEventListener("transitionend", done);
	// Fallback in case transitionend never fires (tab hidden, interrupted).
	const timer = setTimeout(() => done(), duration + 100);
	return () => done();
}
