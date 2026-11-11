import { describe, expect, it } from "vitest";
import { htmlRenderDocument, htmlRenderFromUrl, htmlRenderLimits, htmlRenderPolicy, htmlRenderUrl, validateHtmlPreview, validateHtmlRender } from "./htmlRender";

describe("agent HTML pages", () => {
	it("checks pages, titles and sizes", () => {
		expect(validateHtmlRender({ html: "<p>Hi</p>", title: " Sales ", height: 5000 })).toEqual({ html: "<p>Hi</p>", title: "Sales", height: htmlRenderLimits.maxHeight });
		expect(() => validateHtmlRender({ html: " ", title: "A", height: 100 })).toThrow("Pass html");
		expect(() => validateHtmlRender({ html: "<p>", title: "", height: 100 })).toThrow(/Invalid title/);
		expect(() => validateHtmlRender({ html: "<p>", title: "A" })).toThrow(/Invalid height/);
		expect(() => validateHtmlRender({ html: "x".repeat(htmlRenderLimits.bytes + 1), title: "A", height: 100 })).toThrow(/over 256 KB/);
		expect(() => validateHtmlRender({ html: "<style>body{min-height:100vh}</style>", title: "A", height: 100 })).toThrow(/vh units/);
		expect(validateHtmlPreview({ html: "<p>" })).toEqual({ html: "<p>", width: htmlRenderLimits.columnWidth, appearance: "dark" });
		expect(validateHtmlPreview({ html: "<p>", width: 10, appearance: "light" })).toMatchObject({ width: htmlRenderLimits.minWidth, appearance: "light" });
		expect(() => validateHtmlPreview({ html: "<p>", appearance: "sepia" })).toThrow(/Invalid appearance/);
	});
	it("carries the page in its address, unchanged, including text outside Latin-1", () => {
		const page = "<h1>Résumé — 数据 📈</h1>".repeat(50);
		const url = htmlRenderUrl(page, "light");
		expect(url.startsWith("phaseo-html://page/light?h=")).toBe(true);
		expect(url.split("?h=")[1]).not.toMatch(/[+/=]/);
		expect(htmlRenderFromUrl(url)).toEqual({ page, appearance: "light" });
		for (const bad of ["https://page/dark?h=AAAA", "phaseo-html://page/sepia?h=AAAA", "phaseo-html://page/dark", "nonsense"]) expect(htmlRenderFromUrl(bad)).toBeUndefined();
	});
	it("puts the theme before the page's own styles and keeps the page off the app's origin", () => {
		const served = htmlRenderDocument("<html><head><style>p{}</style></head><body><p>x</p></body></html>", "dark");
		expect(served.indexOf("--chart-1")).toBeLessThan(served.indexOf("p{}"));
		expect(served).toContain("phaseoHtmlHeight");
		expect(htmlRenderDocument("<p>x</p>", "light").startsWith("<style>:root{color-scheme:light")).toBe(true);
		expect(htmlRenderPolicy).toContain("sandbox allow-scripts");
		expect(htmlRenderPolicy).toContain("connect-src 'none'");
	});
});
