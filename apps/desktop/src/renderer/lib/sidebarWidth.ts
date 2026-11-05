import { useCallback, useState } from "react";
import { readPersistedValue, writePersistedValue } from "./persistedState";

/** Chat, Code and Factory each keep their own sidebar width; Settings uses the one of the mode beneath it. */
export type SidebarSurface = "chat" | "code" | "factory";
export const sidebarWidths = { min: 200, max: 480, default: 256 };
/** The one width every surface shared before; each surface starts from it until it is resized on its own. */
const sharedKey = "phaseo.desktop.sidebarWidth";
export const sidebarWidthKey = (surface: SidebarSurface) => `${sharedKey}.${surface}`;

export const sidebarSurface = (mode: "chat" | "code", codeView?: string): SidebarSurface => mode === "chat" ? "chat" : codeView === "factory" ? "factory" : "code";
export const clampSidebarWidth = (value: number) => Math.round(Math.min(sidebarWidths.max, Math.max(sidebarWidths.min, Number.isFinite(value) ? value : sidebarWidths.default)));
export const readSidebarWidth = (surface: SidebarSurface) => clampSidebarWidth(readPersistedValue(sidebarWidthKey(surface), readPersistedValue(sharedKey, sidebarWidths.default)));

/** The surface's width, read again when the surface changes, and saved under its own key. */
export function useSidebarWidth(surface: SidebarSurface) {
	const [state, setState] = useState(() => ({ surface, width: readSidebarWidth(surface) }));
	const width = state.surface === surface ? state.width : readSidebarWidth(surface);
	const setWidth = useCallback((value: number) => { const next = clampSidebarWidth(value); setState({ surface, width: next }); writePersistedValue(sidebarWidthKey(surface), next); }, [surface]);
	return [width, setWidth] as const;
}
