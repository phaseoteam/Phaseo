import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageContent } from "./MessageContent";

describe("conversation file links", () => {
	it("renders project file positions as editor actions while preserving web links and inert unsafe schemes", () => {
		const html = renderToStaticMarkup(createElement(MessageContent, { projectId: "fixture", text: "[File](file:///E:/project/main.ts#L2C3) [Web](https://example.invalid/docs) [Unsafe](javascript:alert(1))" }));
		expect(html).toContain('class="message-file-link"');
		expect(html).toContain('aria-label="Open E:/project/main.ts at line 2 in editor"');
		expect(html).toContain('href="https://example.invalid/docs"');
		expect(html).not.toContain('href="file:');
		expect(html).not.toContain("javascript:");
		expect(html).toContain("Unsafe</span>");
	});
	it("leaves file references inert when the conversation has no project", () => {
		const html = renderToStaticMarkup(createElement(MessageContent, { text: "[File](src/main.ts:2:3)" }));
		expect(html).toContain("File</span>");
		expect(html).not.toContain("<button");
	});
	it("repairs only opted-in assistant rendering and preserves descriptive file labels", () => {
		const text = "Inspect [the request handler](<E:/project/main.ts:7) next.";
		const html = renderToStaticMarkup(createElement(MessageContent, { projectId: "fixture", text, repairLocalLinks: true }));
		expect(html).toContain('aria-label="Open E:/project/main.ts at line 7 in editor"');
		expect(html).toContain(">the request handler</button>");
		const original = renderToStaticMarkup(createElement(MessageContent, { projectId: "fixture", text }));
		expect(original).not.toContain('class="message-file-link"');
		expect(text).toBe("Inspect [the request handler](<E:/project/main.ts:7) next.");
	});
});
