import { describe, expect, it } from "vitest";
import { builtInThemes, contrastText, importTheme, parseTheme, serializeTheme, shareCode, themeColours } from "./themes";

describe("themes", () => {
	it("derives every token from canvas and accent, with overrides winning", () => {
		const colours = themeColours({ canvas: "#101010", accent: "#ff8800", tokens: { border: "#333333" } }, "dark");
		expect(colours.background).toBe("#101010"); expect(colours.primary).toBe("#ff8800"); expect(colours.ring).toBe("#ff8800");
		expect(colours.border).toBe("#333333"); expect(colours["primary-foreground"]).toBe("#111111");
		expect(contrastText("#1e3a8a")).toBe("#ffffff");
	});
	it("round-trips through JSON and share codes, keeping only valid colours", () => {
		const theme = { ...builtInThemes.find(value => value.id === "claude")!, name: "My Claude ✓", builtIn: undefined };
		expect(importTheme(serializeTheme(theme))).toMatchObject({ name: "My Claude ✓", light: theme.light, dark: theme.dark });
		const code = shareCode(theme);
		expect(code).toMatch(/^phaseo-theme:[A-Za-z0-9_-]+$/);
		expect(importTheme(code)).toMatchObject({ name: "My Claude ✓", dark: theme.dark });
		expect(parseTheme({ name: "X", dark: { canvas: "#000000", accent: "#ffffff", tokens: { border: "url(evil)", nonsense: "#fff", muted: "#222222" } } }).dark).toEqual({ canvas: "#000000", accent: "#ffffff", tokens: { muted: "#222222" } });
	});
	it("imports canvas and accent themes and VS Code themes and rejects other files", () => {
		expect(parseTheme({ version: 1, name: "Night", appearance: "dark", colors: { canvas: "#0b0b0f", accent: "#7c3aed", text: "#eeeeee" } })).toMatchObject({ dark: { canvas: "#0b0b0f", accent: "#7c3aed", tokens: { foreground: "#eeeeee" } } });
		expect(parseTheme({ name: "Solar", type: "light", colors: { "editor.background": "#fdf6e3", "editor.foreground": "#657b83", focusBorder: "#268bd2" } })).toMatchObject({ light: { canvas: "#fdf6e3", accent: "#268bd2", tokens: { foreground: "#657b83" } } });
		expect(() => importTheme("{\"hello\":1}")).toThrow("isn't a Phaseo theme, a VS Code colour theme or a theme with a canvas and accent colour");
		expect(() => importTheme("not json")).toThrow("Paste a theme share code");
		expect(() => importTheme("phaseo-theme:%%%")).toThrow("damaged");
	});
});
