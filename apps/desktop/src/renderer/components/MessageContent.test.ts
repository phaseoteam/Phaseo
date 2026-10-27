import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { imageSource, MessageContent } from "./MessageContent";
import { MessageText } from "./MessageChips";

const render = (text: string, projectId?: string, repairLocalLinks = false) => renderToStaticMarkup(createElement(MessageContent, { text, projectId, repairLocalLinks }));
const chat = "3cc43115-02f3-406a-8101-604a3af05e44";

describe("conversation file links", () => {
	it("renders project file positions as editor chips while preserving web links and inert unsafe schemes", () => {
		const html = render("[File](file:///E:/project/main.ts#L2C3) [Web](https://example.invalid/docs) [Unsafe](javascript:alert(1))", "fixture");
		expect(html).toContain('<button type="button" title="E:/project/main.ts:2:3"');
		expect(html).toContain('href="https://example.invalid/docs"');
		expect(html).toContain(">Web</span></a>");
		expect(html).not.toContain('href="file:');
		expect(html).not.toContain("javascript:");
		expect(html).toContain("<span>Unsafe</span>");
	});
	it("leaves file references inert when the conversation has no project", () => {
		const html = render("[File](src/main.ts:2:3)");
		expect(html).toContain(">File</span></span>");
		expect(html).toContain('title="src/main.ts:2:3"');
		expect(html).not.toContain("<button");
	});
	it("repairs only opted-in assistant rendering and preserves descriptive file labels", () => {
		const text = "Inspect [the request handler](<E:/project/main.ts:7) next.";
		const html = render(text, "fixture", true);
		expect(html).toContain('title="E:/project/main.ts:7"');
		expect(html).toContain(">the request handler</span></button>");
		const original = render(text, "fixture");
		// Unrepaired, the broken link stays text and only its path is chipped.
		expect(original).not.toContain(">the request handler</span></button>");
		expect(original).toContain(">main.ts:7</span></button>");
		expect(text).toBe("Inspect [the request handler](<E:/project/main.ts:7) next.");
	});
});

describe("message chips in responses", () => {
	it("labels bare links by GitHub reference or host, and file links by basename", () => {
		const html = render("See https://github.com/a/b/pull/12 and <https://www.example.com/docs> and [src/lib/a.ts:4](src/lib/a.ts:4).", "fixture");
		expect(html).toContain(">PR #12</span></a>");
		expect(html).toContain(">example.com</span></a>");
		expect(html).toContain('title="src/lib/a.ts:4"');
		expect(html).toContain(">a.ts:4</span></button>");
	});
	it("chips bare paths, inline-code paths and chat tokens but not code blocks or other inline code", () => {
		const html = render(`Edit apps/web/src/page.tsx:3, \`src/main.ts\` and \`npm run build\`, then ask @[Fix usage](chat:${chat}).\n\n\`\`\`\nsrc/other.ts\n\`\`\``, "fixture");
		expect(html).toContain('title="apps/web/src/page.tsx:3"');
		expect(html).toContain(">page.tsx:3</span>");
		expect(html).toContain(">main.ts</span>");
		expect(html).toContain("<code>npm run build</code>");
		expect(html).toContain(">Fix usage</span></span>");
		expect(html).not.toContain("@<");
		expect(html).toContain("src/other.ts\n</code>");
		expect(html).not.toContain("data-chip");
	});
	it("leaves versions, emails and prose slashes as text", () => {
		const html = render("Bump to 1.2.3, mail me@example.com, use and/or React/Next.js.");
		expect(html).toBe('<div class="message-markdown"><p>Bump to 1.2.3, mail <a href="mailto:me@example.com">me@example.com</a>, use and/or React/Next.js.</p></div>'.replace('<a href="mailto:me@example.com">me@example.com</a>', "<span>me@example.com</span>"));
	});
});

describe("user message text", () => {
	it("keeps text and whitespace around chips", () => {
		const html = renderToStaticMarkup(createElement(MessageText, { text: `Compare @src/usage.ts with @[Fix usage](chat:${chat})\nat https://example.com/x and \`docs/a.md\``, projectId: "fixture" }));
		expect(html).toContain("Compare <button");
		expect(html).toContain('title="src/usage.ts"');
		expect(html).toContain(">usage.ts</span></button> with <span");
		expect(html).toContain(">Fix usage</span></span>\nat <a");
		expect(html).toContain(">example.com</span></a> and `docs/a.md`");
	});
});

describe("rich replies", () => {
	it("renders GitHub alerts as callouts and leaves other quotes alone", () => {
		const html = render("> [!WARNING]\n> Back up **first**.\n\n> Just a quote");
		expect(html).toContain('<div role="note" class="message-alert" data-alert="warning">');
		expect(html).toContain("Warning</p>");
		expect(html).toContain("<p>Back up <strong>first</strong>.</p>");
		expect(html).not.toContain("[!WARNING]");
		expect(html).toContain("<blockquote>\n<p>Just a quote</p>\n</blockquote>");
	});
	it("renders details blocks with Markdown inside but keeps other raw HTML as text", () => {
		const html = render("<details open>\n<summary>More <b>info</b></summary>\n\nHidden *text*\n\n</details>\n\n<b>bold</b>");
		expect(html).toMatch(/<details class="message-details" open="">.*<summary>.*More info<\/summary><p>Hidden <em>text<\/em><\/p><\/details>/s);
		expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
	});
	it("typesets maths but keeps prices as text", () => {
		const html = render("Area $\\pi r^2$ costs $5 and $10.\n\n$$\na+b\n$$");
		expect(html).toContain('aria-label="Inline equation" data-markdown-copy="$\\pi r^2$"');
		expect(html).toContain("costs $5 and $10.");
		expect(html).toContain('aria-label="Equation"');
	});
	it("shows web images and leaves project images to load, with mermaid fences as diagrams", () => {
		const html = render("![Chart](https://example.com/chart.png)\n\n```mermaid\ngraph TD; A-->B\n```");
		expect(html).toContain('aria-label="Open image: Chart"><img data-message-image="" data-href="https://example.com/chart.png" src="https://example.com/chart.png"');
		expect(html).toContain('aria-label="Show code"');
		expect(html).toContain('<pre class="message-diagram-pending">graph TD; A--&gt;B</pre>');
	});
	it("offers wrapping on code blocks and copying on tables", () => {
		const html = render("```ts\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |");
		expect(html).toContain('aria-label="Wrap long lines"');
		expect(html).toContain('aria-label="Copy table"');
	});
});

describe("reply image sources", () => {
	it("loads web and inline images directly and reads anything else from the project", () => {
		expect(imageSource("https://example.com/a.png")).toEqual({ kind: "direct", src: "https://example.com/a.png" });
		expect(imageSource("data:image/png;base64,AAAA")).toEqual({ kind: "direct", src: "data:image/png;base64,AAAA" });
		expect(imageSource("out/plot%20one.png?raw=1")).toEqual({ kind: "project", path: "out/plot one.png" });
		expect(imageSource("file:///E:/repo/out.png")).toEqual({ kind: "project", path: "E:/repo/out.png" });
		expect(imageSource("http://example.com/a.png")).toBeUndefined();
		expect(imageSource("javascript:alert(1)")).toBeUndefined();
	});
});
