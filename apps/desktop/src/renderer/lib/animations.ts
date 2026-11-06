import { useEffect } from "react";
import { usePersistedState } from "./persistedState";

/** Panel, menu and dialog animations; off makes them appear at once (index.css). Spinners keep turning. */
export const animationsKey = "phaseo.desktop.animations";
export const panelAnimationDurationKey = "phaseo.desktop.panelAnimationDurationMs";
export const defaultPanelAnimationDuration = 200;
export const maxPanelAnimationDuration = 600;

export function validPanelAnimationDuration(value: unknown): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maxPanelAnimationDuration) throw new Error(`panelAnimationDurationMs must be an integer from 0 to ${maxPanelAnimationDuration}.`);
	return value;
}

export function usePanelAnimationDuration() {
	const [value, setValue] = usePersistedState<number>(panelAnimationDurationKey, defaultPanelAnimationDuration);
	let duration = defaultPanelAnimationDuration;
	try { duration = validPanelAnimationDuration(value); } catch { /* A stale device preference keeps the default. */ }
	return [duration, setValue] as const;
}

export function applyAnimations(on: boolean) {
	if (on) delete document.documentElement.dataset.animations; else document.documentElement.dataset.animations = "off";
}

export function useAnimations() {
	const [on] = usePersistedState<boolean>(animationsKey, true);
	const [duration] = usePanelAnimationDuration();
	useEffect(() => { applyAnimations(on !== false); }, [on]);
	useEffect(() => { document.documentElement.style.setProperty("--panel-animation-duration", `${duration}ms`); }, [duration]);
}
