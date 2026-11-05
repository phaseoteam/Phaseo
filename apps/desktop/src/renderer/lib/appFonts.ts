import { useEffect } from "react";
import { usePersistedState } from "./persistedState";

/** Font families for the interface and for code (diffs, terminals, code blocks); unset keeps the app's own. */
export type AppFonts = { interface?: string; code?: string };
export const appFontsKey = "phaseo.desktop.fonts";

/** A family list as CSS takes it; nothing that could end the declaration. */
function family(value: unknown, name: string) {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value !== "string" || value.trim().length > 200 || /[;{}<>\\]/.test(value)) throw new Error(`${name} must be a font family list such as "Inter, sans-serif", without ; { } < > or \\.`);
	return value.trim() || undefined;
}
export function validAppFonts(value: unknown): AppFonts {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("fonts must be { interface?, code? }.");
	const input = value as Record<string, unknown>, sans = family(input.interface, "interface"), mono = family(input.code, "code");
	return { ...sans ? { interface: sans } : {}, ...mono ? { code: mono } : {} };
}

/** index.css reads these, falling back to the app's own fonts; the generic family keeps text readable if a font is missing. */
export function applyAppFonts(fonts: AppFonts) {
	const style = document.documentElement.style;
	if (fonts.interface) style.setProperty("--app-font-sans", `${fonts.interface}, ui-sans-serif, system-ui, sans-serif`); else style.removeProperty("--app-font-sans");
	if (fonts.code) style.setProperty("--app-font-mono", `${fonts.code}, ui-monospace, monospace`); else style.removeProperty("--app-font-mono");
}

export function useAppFonts() {
	const [fonts] = usePersistedState<AppFonts>(appFontsKey, {});
	useEffect(() => { try { applyAppFonts(validAppFonts(fonts)); } catch { applyAppFonts({}); } }, [fonts]);
}
