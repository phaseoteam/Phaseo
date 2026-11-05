import { expect, it } from "vitest";
import { htmlRenderDocument, htmlRenderFromUrl, htmlRenderUrl, validHtmlTheme } from "./htmlRender";

it("takes only plain colours for the theme's own keys", () => {
	expect(validHtmlTheme({ background: "oklch(0.21 0.01 260)", primary: "#ff5500", foreground: "rgb(10 20 30 / 90%)", border: "red;}body{display:none", accent: "url(https://evil.example/x)", unknown: "#fff" }))
		.toEqual({ background: "oklch(0.21 0.01 260)", primary: "#ff5500", foreground: "rgb(10 20 30 / 90%)" });
	expect(validHtmlTheme("#fff")).toEqual({});
});

it("carries the window's theme to the page and puts it over the built-in palette", () => {
	const url = htmlRenderUrl("<p>Hi</p>", "dark", { primary: "#ff5500", background: "oklch(0.2 0 0)" });
	const page = htmlRenderFromUrl(url)!;
	expect(page.theme).toEqual({ primary: "#ff5500", background: "oklch(0.2 0 0)" });
	const document = htmlRenderDocument(page.page, page.appearance, page.theme);
	expect(document).toContain("--primary:#ff5500");
	expect(document).toContain("--background:oklch(0.2 0 0)");
	expect(document).toContain("--foreground:#ececec");
	expect(htmlRenderFromUrl(htmlRenderUrl("<p>Hi</p>", "light"))!.theme).toEqual({});
	expect(document).toContain("phaseoOpenLink");
	expect(document).toContain("phaseoHtmlZoom");
});
