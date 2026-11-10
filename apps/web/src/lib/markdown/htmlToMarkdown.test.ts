import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "./htmlToMarkdown";

const page = (body: string, head = "") =>
	`<!doctype html><html><head><title>GPT-5.5 | Phaseo</title><meta name="description" content="Pricing &amp; providers">${head}</head><body>${body}</body></html>`;

describe("htmlToMarkdown", () => {
	it("writes front matter from the title, description and canonical URL", () => {
		const { markdown } = htmlToMarkdown(page("<main><h1>GPT-5.5</h1></main>", '<link rel="canonical" href="/models/openai/gpt-5-5">'), "https://phaseo.app/models/openai/gpt-5-5?x=1");
		expect(markdown).toBe(`---\ntitle: "GPT-5.5 | Phaseo"\ndescription: "Pricing & providers"\nurl: https://phaseo.app/models/openai/gpt-5-5\n---\n\n# GPT-5.5\n`);
	});

	it("keeps only <main> and drops navigation, scripts, forms and hidden content", () => {
		const { markdown } = htmlToMarkdown(
			page(`<header><nav><a href="/">Home</a></nav></header>
				<main>
					<p>Visible <span hidden>secret</span><span aria-hidden="true">icon</span></p>
					<script>window.x = 1</script><style>.a{}</style><svg><text>svg</text></svg>
					<form><button>Buy</button></form>
					<div style="display: none">gone</div>
				</main>
				<footer>Footer</footer>`),
			"https://phaseo.app/x",
		);
		expect(markdown.split("---\n\n")[1]).toBe("Visible\n");
	});

	it("falls back to <body> when there is no <main>", () => {
		const { markdown } = htmlToMarkdown(page("<div><p>Body text</p></div>"), "https://phaseo.app/x");
		expect(markdown).toContain("\n\nBody text\n");
	});

	it("renders headings, emphasis, links, code and images", () => {
		const { markdown } = htmlToMarkdown(
			page(`<main><h2>Pricing <small>per 1M</small></h2><p><strong>Input</strong> costs <em>$2.50</em>. See <a href="/pricing">pricing</a>, <a href="#top">top</a>, <a href="javascript:void(0)">js</a>. Use <code>model: "x"</code>.</p><img src="/a.png" alt="Chart"><img src="/logo.png" alt=""></main>`),
			"https://phaseo.app/models/a/b",
		);
		const body = markdown.split("---\n\n")[1];
		expect(body).toBe('## Pricing per 1M\n\n**Input** costs _$2.50_. See [pricing](https://phaseo.app/pricing), top, js. Use `model: "x"`.\n\n![Chart](https://phaseo.app/a.png)\n');
	});

	it("separates neighbouring inline elements that would run together", () => {
		const { markdown } = htmlToMarkdown(page(`<main><div><span>Input</span><span>$2.50</span></div><p>gpt<b>-5</b></p></main>`), "https://phaseo.app/x");
		expect(markdown.split("---\n\n")[1]).toBe("Input $2.50\n\ngpt**-5**\n");
	});

	it("renders nested lists", () => {
		const { markdown } = htmlToMarkdown(page(`<main><ul><li>One<ul><li>Nested</li></ul></li><li><p>Two</p></li></ul><ol start="3"><li>Three</li><li>Four</li></ol></main>`), "https://phaseo.app/x");
		expect(markdown.split("---\n\n")[1]).toBe("- One\n  - Nested\n- Two\n\n3. Three\n4. Four\n");
	});

	it("renders tables as GFM tables", () => {
		const { markdown } = htmlToMarkdown(
			page(`<main><table><thead><tr><th>Provider</th><th>Input</th></tr></thead><tbody><tr><td><a href="/api-providers/openai">OpenAI</a></td><td>$2.50 | $1</td></tr><tr><td>Azure</td></tr></tbody></table></main>`),
			"https://phaseo.app/x",
		);
		expect(markdown.split("---\n\n")[1]).toBe("| Provider | Input |\n| --- | --- |\n| [OpenAI](https://phaseo.app/api-providers/openai) | $2.50 \\| $1 |\n| Azure | |\n");
	});

	it("keeps code blocks verbatim", () => {
		const { markdown } = htmlToMarkdown(page(`<main><pre><code class="language-ts">const a = 1;\n  if (a) {\n    go();\n  }</code></pre></main>`), "https://phaseo.app/x");
		expect(markdown.split("---\n\n")[1]).toBe("```ts\nconst a = 1;\n  if (a) {\n    go();\n  }\n```\n");
	});

	it("escapes Markdown characters in text and decodes entities", () => {
		const { markdown } = htmlToMarkdown(page(`<main><p>a_b *c* [d] &lt;tag&gt; &amp;</p></main>`), "https://phaseo.app/x");
		expect(markdown.split("---\n\n")[1]).toBe("a\\_b \\*c\\* \\[d\\] \\<tag\\> &\n");
	});

	it("reads Tailwind display classes for a desktop viewport in light mode", () => {
		const { markdown } = htmlToMarkdown(
			page(`<main><h1 class="md:hidden">Mobile title</h1><h1 class="hidden md:block">Title</h1><p class="block dark:hidden">Light</p><p class="hidden dark:block">Dark</p><div data-slot="skeleton">Loading</div></main>`),
			"https://phaseo.app/x",
		);
		expect(markdown.split("---\n\n")[1]).toBe("# Title\n\nLight\n");
	});

	it("swaps streamed Suspense content in for its fallback", () => {
		const html = page(
			`<main><!--$?--><template id="B:0"></template><p>Loading…</p><!--/$--><p>Static</p><template id="P:1"></template></main>` +
				`<div hidden id="S:0"><h2>Providers</h2><!--$?--><template id="B:2"></template><p>Inner loading</p><!--/$--></div>` +
				`<script>$RC("B:0","S:0")</script>` +
				`<div hidden id="S:2"><p>OpenAI $5</p></div><script>$RC("B:2","S:2")</script>` +
				`<div hidden id="S:1"><p>Placeholder content</p></div><script>$RS("S:1","P:1")</script>`,
		);
		const { markdown } = htmlToMarkdown(html, "https://phaseo.app/x");
		expect(markdown.split("---\n\n")[1]).toBe("## Providers\n\nOpenAI $5\n\nStatic\n\nPlaceholder content\n");
	});

	it("drops SVG images, spaces neighbouring links and skips empty table rows", () => {
		const { markdown } = htmlToMarkdown(
			page(`<main><p><img src="/logos/openai.svg" alt="OpenAI logo">OpenAI</p><p><a href="/chat">Chat</a><a href="/compare">Compare</a></p><table><tr><th><button>Provider</button></th></tr><tr><td></td></tr><tr><td>OpenAI</td></tr></table></main>`),
			"https://phaseo.app/x",
		);
		expect(markdown.split("---\n\n")[1]).toBe("OpenAI\n\n[Chat](https://phaseo.app/chat) [Compare](https://phaseo.app/compare)\n\n| Provider |\n| --- |\n| OpenAI |\n");
	});

	it("keeps hard line breaks and blockquotes", () => {
		const { markdown } = htmlToMarkdown(page(`<main><p>Line one<br>Line two</p><blockquote><p>Quoted</p><p>More</p></blockquote></main>`), "https://phaseo.app/x");
		expect(markdown.split("---\n\n")[1]).toBe("Line one  \nLine two\n\n> Quoted\n>\n> More\n");
	});
});
