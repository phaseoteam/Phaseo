import { useCallback, useSyncExternalStore } from "react";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
	SPECIAL_THEME_ATTRIBUTE,
	SPECIAL_THEME_AVAILABLE_ATTRIBUTE,
	setSpecialThemeActive,
	type SpecialThemeId,
} from "@/lib/specialTheme";

export type BaseThemeMode = "light" | "dark" | "system";
export type ThemeChoice = BaseThemeMode | SpecialThemeId;

const BASE_MODES: BaseThemeMode[] = ["light", "dark", "system"];

function subscribe(onChange: () => void) {
	const observer = new MutationObserver(onChange);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: [SPECIAL_THEME_ATTRIBUTE, SPECIAL_THEME_AVAILABLE_ATTRIBUTE],
	});
	return () => observer.disconnect();
}

// One string so useSyncExternalStore can compare snapshots by value.
function getSnapshot() {
	const root = document.documentElement;
	return `${root.getAttribute(SPECIAL_THEME_AVAILABLE_ATTRIBUTE) ?? ""}|${root.getAttribute(SPECIAL_THEME_ATTRIBUTE) ?? ""}`;
}

/**
 * The theme pickers' options and selection: light, dark and system, plus a
 * time-boxed special theme (see lib/specialTheme) while one is offered.
 * Picking a base mode turns the special theme off; picking it turns it back on
 * over the current light or dark mode.
 */
export function useThemeChoice() {
	const { theme, setTheme } = useTheme();
	const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => "|");
	const [available, active] = snapshot.split("|") as [string, string];
	const special = (available || null) as SpecialThemeId | null;

	const baseMode: BaseThemeMode =
		theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
	const current: ThemeChoice = active ? (active as SpecialThemeId) : baseMode;
	const modes: ThemeChoice[] = special ? [...BASE_MODES, special] : BASE_MODES;

	const choose = useCallback(
		(choice: ThemeChoice) => {
			if (choice === "light" || choice === "dark" || choice === "system") {
				if (special) setSpecialThemeActive(false);
				setTheme(choice);
				return;
			}
			setSpecialThemeActive(true);
		},
		[setTheme, special],
	);

	return { current, modes, choose, special };
}
