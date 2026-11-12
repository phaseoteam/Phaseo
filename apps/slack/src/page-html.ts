import { html as spec, parse, serialize, type DefaultTreeAdapterTypes } from "parse5";

// What a shared page may hold: static HTML and CSS (text, tables, lists,
// <details>, data: images and inline SVG charts). publish_page stores the page
// as cleanPageHtml returns it, and the viewer cleans it again before serving it.
//
// The page is parsed with parse5, which builds the tree the HTML standard
// specifies, as the browser builds it for the page's frame: no quirks mode (a
// srcdoc document never has one) and scripting off (its sandbox has no
// allow-scripts, so <noscript> holds markup). Everything not allowed below is
// removed:
//   - elements a page can't use are dropped with their content: scripts,
//     <link>, <meta>, <base>, frames, objects, media, form controls, <template>,
//     MathML, and in SVG <script>, <foreignObject>, animations and images;
//   - any other HTML element that isn't listed is replaced by its content;
//   - only listed attributes are kept, so no on* handlers, href, srcset, action,
//     ping, background and so on. <img> keeps a src only when it is a data:
//     PNG, JPEG, GIF or WebP image, and is dropped without one;
//   - style attributes, SVG attributes (which are CSS too) and <style> elements
//     are dropped when their CSS could load anything: url() other than a data:
//     image or a #fragment of the page, @import, image-set() and the like, read
//     after CSS escapes and comments. A <style>'s leading @import rules (web
//     fonts, usually) are taken out first, so the rest of it can stay.
//
// The cleaned tree is serialised, and the result cleaned again until it doesn't
// change, so what the browser parses is what was checked. A page that doesn't
// settle, or nests too deeply to check, is refused, and so is one with nothing
// left to show.

type Node = DefaultTreeAdapterTypes.Node;
type ChildNode = DefaultTreeAdapterTypes.ChildNode;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;
type Element = DefaultTreeAdapterTypes.Element;
type TextNode = DefaultTreeAdapterTypes.TextNode;

export type CleanedPage =
	/** removed: the elements (<script>), attributes (onclick) and @import rules taken out, for the model. */
	| { status: "ok"; html: string; removed: string[] }
	| { status: "empty" | "too_deep" | "unstable" };

const NS = spec.NS;
/** Cleans until the page doesn't change; two passes usually do. */
const MAX_PASSES = 3;
/** Deeper than any report needs, and well within the call stack. */
export const MAX_PAGE_DEPTH = 200;
/** Attributes kept per element: re-cleaning a stored page on every view stays cheap (the parser checks duplicate attributes pairwise). */
export const MAX_ATTRIBUTES_PER_ELEMENT = 64;
const MAX_REMOVED_LISTED = 20;

const words = (list: string) => new Set(list.split(/\s+/).filter(Boolean));

/** HTML attributes any kept element may have, besides aria-* and data-*. */
const HTML_GLOBAL_ATTRIBUTES = words("id class title lang dir style hidden role translate align valign width height bgcolor xmlns");

/** The HTML elements kept, with the attributes they may have besides the global ones. */
const HTML_ELEMENTS: Record<string, Set<string>> = Object.fromEntries(Object.entries({
	"html head body title main header footer nav section article aside address hgroup search h1 h2 h3 h4 h5 h6 p div span br hr wbr pre blockquote figure figcaption": "",
	"a abbr b bdi bdo cite code dfn em i kbd mark q rp rt ruby s samp small strong sub sup u var big center strike tt dl dt dd menu caption thead tbody tfoot tr summary": "",
	"data meter progress": "value min max low high optimum",
	"del ins time": "datetime",
	font: "color face size",
	ul: "type",
	ol: "start reversed type",
	li: "value type",
	table: "border cellpadding cellspacing summary frame rules",
	"colgroup col": "span",
	"th td": "colspan rowspan headers scope abbr nowrap",
	details: "open",
	img: "src alt loading decoding",
	style: "media type",
}).flatMap(([names, attributes]) => [...words(names)].map((name) => [name, words(attributes)] as const)));

/** HTML elements dropped with everything in them. Any other HTML element not kept is replaced by its content. */
const HTML_DROPPED = words(`
	script noscript template iframe frame frameset noframes object embed applet param portal fencedframe
	link meta base input button select option optgroup datalist textarea keygen selectedcontent
	video audio source track map area xmp plaintext noembed
`);

/** The SVG elements kept: shapes, text, gradients, patterns, clipping, masks, markers and filters (but not feImage). */
const SVG_ELEMENTS = words(`
	svg g defs symbol title desc a style rect circle ellipse line polyline polygon path text tspan
	lineargradient radialgradient stop pattern clippath mask marker filter
	feblend fecolormatrix fecomponenttransfer fecomposite feconvolvematrix fediffuselighting fedisplacementmap
	fedistantlight fedropshadow feflood fefunca fefuncb fefuncg fefuncr fegaussianblur femerge femergenode
	femorphology feoffset fepointlight fespecularlighting fespotlight fetile feturbulence
`);

/** Attributes any kept SVG element may have, besides aria-* and data-* (lowercase; the parser gives some in camelCase). */
const SVG_ATTRIBUTES = words(`
	id class style lang xml:lang xml:space xmlns xmlns:xlink version role focusable transform
	viewbox preserveaspectratio x y x1 y1 x2 y2 cx cy r rx ry fx fy fr width height d points pathlength
	dx dy rotate textlength lengthadjust text-anchor dominant-baseline alignment-baseline baseline-shift
	font-family font-size font-size-adjust font-stretch font-style font-variant font-weight letter-spacing
	word-spacing text-decoration writing-mode direction unicode-bidi
	fill fill-opacity fill-rule stroke stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin
	stroke-miterlimit stroke-opacity stroke-width opacity color display visibility overflow
	clip clip-path clip-rule clippathunits mask maskunits maskcontentunits
	marker-start marker-mid marker-end markerwidth markerheight markerunits refx refy orient
	offset stop-color stop-opacity gradientunits gradienttransform spreadmethod
	patternunits patterncontentunits patterntransform filter filterunits primitiveunits
	stddeviation in in2 result operator k1 k2 k3 k4 mode type values tablevalues slope intercept amplitude
	exponent flood-color flood-opacity lighting-color basefrequency numoctaves seed stitchtiles scale
	xchannelselector ychannelselector radius order kernelmatrix divisor bias targetx targety edgemode
	preservealpha surfacescale diffuseconstant specularconstant specularexponent kernelunitlength
	azimuth elevation z pointsatx pointsaty pointsatz limitingconeangle
	shape-rendering text-rendering image-rendering color-interpolation color-interpolation-filters
	paint-order vector-effect isolation mix-blend-mode
`);

const DATA_OR_ARIA = /^(?:data|aria)-[a-z0-9_.-]+$/;
/** The only images a page may show: embedded PNG, JPEG, GIF or WebP. */
const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp)[;,]/i;
/** What a URL parser trims from both ends of a URL: C0 controls and spaces. */
const URL_TRIM = /^[\x00-\x20]+|[\x00-\x20]+$/g;

/**
 * CSS without its comments, as the tokenizer reads it: a comment opener inside a
 * quoted string is part of the string (a string ends at its closing quote, or
 * at a newline), and a backslash escapes the next character.
 */
export function withoutCssComments(css: string): string {
	let out = "";
	let quote: string | null = null;
	for (let index = 0; index < css.length; index += 1) {
		const char = css[index];
		if (quote) {
			out += char;
			if (char === "\\" && index + 1 < css.length) out += css[++index];
			else if (char === quote || char === "\n" || char === "\r" || char === "\f") quote = null;
		} else if (char === "/" && css[index + 1] === "*") {
			const end = css.indexOf("*/", index + 2);
			index = end === -1 ? css.length : end + 1;
		} else {
			if (char === "\\" && index + 1 < css.length) out += char + css[++index];
			else {
				if (char === '"' || char === "'") quote = char;
				out += char;
			}
		}
	}
	return out;
}

/** CSS as the browser reads it, for the checks: comments removed (which can only join tokens), escapes decoded, lowercase, no whitespace. */
function plainCss(css: string): string {
	return withoutCssComments(css)
		.replace(/\\(?:([0-9a-fA-F]{1,6})[ \t\n\r\f]?|([^\n\r\f0-9a-fA-F])|[\n\r\f])/g, (_, hex: string | undefined, char: string | undefined) => {
			if (!hex) return char ?? "";
			const code = Number.parseInt(hex, 16);
			return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "�" : String.fromCodePoint(code);
		})
		.toLowerCase()
		.replace(/\s+/g, "");
}

/** Functions and rules that load something, or ran script in old browsers. url() is checked on its own. */
const CSS_BLOCKED = /@import|expression\(|-moz-binding|behaviou?r:|javascript:|image-set\(|cross-fade\(|element\(|(?:^|[^a-z0-9_-])(?:image|src)\(/;

/** Whether CSS can't load anything: every url() is a data: image or a #fragment of the page, and nothing in CSS_BLOCKED. */
export function cssIsStatic(css: string): boolean {
	const plain = plainCss(css);
	if (CSS_BLOCKED.test(plain)) return false;
	for (const match of plain.matchAll(/url\(/g)) {
		const target = plain.slice(match.index + 4, match.index + 40).replace(/^["']/, "");
		if (!target.startsWith("#") && !DATA_IMAGE.test(target)) return false;
	}
	return true;
}

/** Whitespace, comments and @import rules at the start of a stylesheet. */
const LEADING_IMPORTS = /^(?:\s|\/\*[\s\S]*?\*\/|@import\b(?:"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|[^;"'])*(?:;|$))+/i;

/**
 * A <style>'s CSS without its leading @import rules, or null when it holds more
 * than text or could still load anything. What is left is the end of the
 * original text, so it can't close the <style> early.
 */
function staticStyle(element: Element, removed: Set<string>): string | null {
	if (!element.childNodes.every((child) => child.nodeName === "#text")) return null;
	const css = element.childNodes.map((child) => (child as TextNode).value).join("");
	const lead = css.match(LEADING_IMPORTS)?.[0] ?? "";
	const rest = /@import/i.test(lead) ? css.slice(lead.length) : css;
	if (!cssIsStatic(rest)) return null;
	if (rest !== css) removed.add("@import");
	return rest;
}

function attributeName(attribute: { name: string; prefix?: string }): string {
	return (attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name).toLowerCase();
}

/** Keeps the allowed attributes whose values are safe, and notes the others. */
function cleanAttributes(element: Element, allowed: (name: string) => boolean, isCss: (name: string) => boolean, removed: Set<string>): void {
	element.attrs = element.attrs.filter((attribute) => {
		const name = attributeName(attribute);
		const keep = allowed(name)
			&& (!isCss(name) || cssIsStatic(attribute.value))
			&& (name !== "src" || DATA_IMAGE.test(attribute.value.replace(URL_TRIM, "")));
		if (!keep) removed.add(name);
		return keep;
	});
	if (element.attrs.length > MAX_ATTRIBUTES_PER_ELEMENT) {
		element.attrs = element.attrs.slice(0, MAX_ATTRIBUTES_PER_ELEMENT);
		removed.add(`attributes past the first ${MAX_ATTRIBUTES_PER_ELEMENT}`);
	}
}

/** Gives a kept <style> its checked CSS, or says it must go. */
function keepStyle(element: Element, removed: Set<string>): boolean {
	const css = staticStyle(element, removed);
	if (css === null) return false;
	element.childNodes = css ? [{ nodeName: "#text", value: css, parentNode: element } satisfies TextNode] : [];
	return true;
}

class TooDeep extends Error {}

function cleanHtml(element: Element, depth: number, removed: Set<string>): ChildNode[] {
	const name = element.tagName;
	// <meta charset> and viewport mean nothing in the frame; only a meta with http-equiv is worth a mention.
	if (name === "meta" && !element.attrs.some((attribute) => attribute.name === "http-equiv")) return [];
	if (HTML_DROPPED.has(name) || (name === "style" && !keepStyle(element, removed))) {
		removed.add(`<${name}>`);
		return [];
	}
	cleanChildren(element, depth + 1, removed, name === "title" || name === "style");
	const attributes = Object.hasOwn(HTML_ELEMENTS, name) ? HTML_ELEMENTS[name] : undefined;
	if (!attributes) return element.childNodes;
	cleanAttributes(element, (attribute) => HTML_GLOBAL_ATTRIBUTES.has(attribute) || attributes.has(attribute) || DATA_OR_ARIA.test(attribute), (attribute) => attribute === "style", removed);
	if (name === "img" && !element.attrs.some((attribute) => attribute.name === "src")) {
		removed.add("<img>");
		return [];
	}
	return [element];
}

function cleanSvg(element: Element, depth: number, removed: Set<string>): ChildNode[] {
	const name = element.tagName.toLowerCase();
	if (!SVG_ELEMENTS.has(name) || (name === "style" && !keepStyle(element, removed))) {
		removed.add(`<${element.tagName}>`);
		return [];
	}
	// title and desc may hold HTML (they are integration points): only their text is kept.
	cleanChildren(element, depth + 1, removed, name === "title" || name === "desc" || name === "style");
	cleanAttributes(element, (attribute) => SVG_ATTRIBUTES.has(attribute) || DATA_OR_ARIA.test(attribute), () => true, removed);
	return [element];
}

/** Cleans a node's children in place. textOnly: any element in it is dropped. */
function cleanChildren(parent: ParentNode, depth: number, removed: Set<string>, textOnly = false): void {
	if (depth > MAX_PAGE_DEPTH) throw new TooDeep();
	const kept: ChildNode[] = [];
	for (const child of parent.childNodes) {
		for (const node of cleanNode(child, parent, depth, removed, textOnly)) {
			node.parentNode = parent;
			kept.push(node);
		}
	}
	parent.childNodes = kept;
}

function cleanNode(node: ChildNode, parent: ParentNode, depth: number, removed: Set<string>, textOnly: boolean): ChildNode[] {
	if (node.nodeName === "#text") return [node];
	if (node.nodeName === "#comment") return [];
	if (node.nodeName === "#documentType") return parent.nodeName === "#document" ? [node] : [];
	const element = node as Element;
	if (textOnly) {
		removed.add(`<${element.tagName}>`);
		return [];
	}
	// HTML inside SVG can only come through an integration point (title and desc are text-only here, foreignObject is dropped).
	const inSvg = "namespaceURI" in parent && parent.namespaceURI === NS.SVG;
	if (element.namespaceURI === NS.HTML && !inSvg) return cleanHtml(element, depth, removed);
	if (element.namespaceURI === NS.SVG) return cleanSvg(element, depth, removed);
	removed.add(`<${element.tagName}>`);
	return [];
}

/** Whether the page shows anything: some text, an image or an SVG. */
function hasContent(node: Node): boolean {
	if (node.nodeName === "#text") return /\S/.test((node as TextNode).value);
	if (node.nodeName === "img" || node.nodeName === "svg") return true;
	if (node.nodeName === "style" || node.nodeName === "title") return false;
	return "childNodes" in node && node.childNodes.some(hasContent);
}

/** The page as it may be stored and served, or why it can't be. */
export function cleanPageHtml(html: string): CleanedPage {
	const removed = new Set<string>();
	let current = html;
	for (let pass = 0; pass < MAX_PASSES; pass += 1) {
		// A doctype first, as a srcdoc document is never in quirks mode; the page's own is then ignored.
		const document = parse(`<!doctype html>${current}`, { scriptingEnabled: false });
		try {
			cleanChildren(document, 0, removed);
		} catch (error) {
			if (error instanceof TooDeep) return { status: "too_deep" };
			throw error;
		}
		const cleaned = serialize(document, { scriptingEnabled: false });
		if (cleaned === current) {
			return document.childNodes.some(hasContent) ? { status: "ok", html: cleaned, removed: [...removed].sort().slice(0, MAX_REMOVED_LISTED) } : { status: "empty" };
		}
		current = cleaned;
	}
	return { status: "unstable" };
}
