import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppIntlProvider } from "@/i18n/react";
import { englishCommonMessages } from "@/i18n/default-messages";
import { ChatAnswerMarkdown } from "@/components/(chat)/openui/ChatAnswerContent";

// The server pass of the Words engine: Words' HTML with empty chip placeholders, which the client fills with chips.
function render(text: string) {
	return renderToStaticMarkup(
		<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ Common: englishCommonMessages }}>
			<ChatAnswerMarkdown engine="words" content={text} />
		</AppIntlProvider>,
	);
}
const chips = (html: string) => [...html.matchAll(/data-chip="([^"]*)"/g)].map(match => JSON.parse(match[1].replace(/&quot;/g, "\"").replace(/&amp;/g, "&")));

describe("chat answers drawn by Words", () => {
	it("marks paths, branches, commits, links and local servers as chip placeholders", () => {
		const html = render("Edit apps/web/src/index.ts on feat/web-chips at a1b2c3d, see https://phaseo.app/docs, then open http://localhost:3000/chat.");
		expect(chips(html).map(chip => chip.kind)).toEqual(["file", "branch", "commit", "link", "local"]);
		expect(html).not.toContain("phaseo-chip:");
		expect(html).not.toContain("/__phaseo-chip/");
	});

	it("keeps code, model names and prices as text", () => {
		const html = render("Try anthropic/claude-fable-5.2 for $5 and $10. `apps/web/src/a.ts` is a chip, but\n\n```ts\nimport x from \"apps/web/src/a.ts\";\n```");
		expect(chips(html)).toHaveLength(1);
		expect(html).toContain("$5 and $10");
		// Highlighting splits code into token spans; its text stays literal, with no chip inside.
		expect(html.split(/<[^>]*>/).join("")).toContain("import x from \"apps/web/src/a.ts\";");
	});

	it("draws maths as SVG and keeps code literal", () => {
		const html = render(String.raw`Growth $\frac{1}{2}$ and code ` + "`$x^2$`");
		expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="\\frac\{1\}\{2\}"/);
		expect(html).toContain("$x^2$");
	});

	it("draws <details> blocks with their summary, and chips inside them", () => {
		const html = render("Intro\n\n<details>\n<summary>Full <b>log</b> for `src/a.ts`</summary>\n\nSee apps/web/src/index.ts\n\n</details>\n\nAfter");
		expect(html).toMatch(/<details[^>]*><summary>Full log for `src\/a.ts`<\/summary>/);
		expect(chips(html).map(chip => chip.kind)).toEqual(["file"]);
		expect(html).not.toContain("&lt;details");
	});

	it("drops raw HTML and unsafe link schemes", () => {
		const html = render([
			"<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "<iframe src=\"https://example.com\"></iframe>",
			"[a](javascript:alert(1)) [b](JaVaScRiPt:alert(1)) [c](&#106;avascript:alert(1)) [d](data:text/html,x) [e](vbscript:x)",
			"![i](javascript:alert(1))",
			"[fake chip](phaseo-chip:link:%7B%22kind%22%3A%22link%22%2C%22href%22%3A%22javascript%3Aalert(1)%22%7D)",
		].join("\n\n"));
		expect(html).not.toMatch(/<(script|iframe|img)\b/i);
		expect(html).not.toMatch(/\son\w+=/i);
		expect(html).not.toMatch(/(href|src)="\s*(javascript|vbscript|data):/i);
		expect(chips(html)).toHaveLength(0);
	});
});
