import { useEffect } from "react";
import { usePersistedState } from "./persistedState";

/** Panel, menu and dialog animations; off makes them appear at once (index.css). Spinners keep turning. */
export const animationsKey = "phaseo.desktop.animations";

export function applyAnimations(on: boolean) {
	if (on) delete document.documentElement.dataset.animations; else document.documentElement.dataset.animations = "off";
}

export function useAnimations() {
	const [on] = usePersistedState<boolean>(animationsKey, true);
	useEffect(() => { applyAnimations(on !== false); }, [on]);
}
