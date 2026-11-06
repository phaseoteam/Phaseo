import { useSyncExternalStore } from "react";
import { htmlThemeKeys, validHtmlTheme, type HtmlTheme } from "../../shared/htmlRender";

/** Theme changes: the light or dark class, and the custom theme's style sheet in the head. */
const watch = (listener: () => void) => {
	const observer = new MutationObserver(listener);
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
	observer.observe(document.head, { childList: true, subtree: true, characterData: true });
	return () => observer.disconnect();
};
const read = () => {
	const style = getComputedStyle(document.documentElement);
	return JSON.stringify(validHtmlTheme(Object.fromEntries(htmlThemeKeys.map(key => [key, style.getPropertyValue(`--${key}`).trim()]))));
};

/** The window's theme colours as pages take them, kept current as the theme or a custom theme's colours change. */
export function usePageTheme(): HtmlTheme {
	return JSON.parse(useSyncExternalStore(watch, read, () => "{}")) as HtmlTheme;
}

/** The same colours under the names MCP Apps use for host styles. */
export function appStyleVariables(theme: HtmlTheme): Record<string, string> {
	const names: Record<string, keyof HtmlTheme> = {
		"--color-background-primary": "background", "--color-background-secondary": "card", "--color-background-tertiary": "muted",
		"--color-text-primary": "foreground", "--color-text-secondary": "muted-foreground", "--color-border-primary": "border", "--color-ring-primary": "primary",
	};
	return Object.fromEntries(Object.entries(names).flatMap(([name, key]) => theme[key] ? [[name, theme[key]!]] : []));
}
