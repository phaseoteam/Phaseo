import { usePersistedState } from "./persistedState";

/** How the model button shows the reasoning level: its word, dots, or both. Kept on this device. */
export type EffortDisplay = "word" | "dots" | "both";
export const effortDisplayKey = "phaseo.desktop.effortDisplay";
export const effortDisplays: readonly EffortDisplay[] = ["word", "dots", "both"];
export const defaultEffortDisplay: EffortDisplay = "both";

export function useEffortDisplay() {
	const [value, setValue] = usePersistedState<EffortDisplay>(effortDisplayKey, defaultEffortDisplay);
	return [effortDisplays.includes(value) ? value : defaultEffortDisplay, setValue] as const;
}
