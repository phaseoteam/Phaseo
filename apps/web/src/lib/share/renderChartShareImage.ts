/** Draws a chart from the page into a branded 1200x675 (16:9) Phaseo share card, at 2x. */

export type ChartShareTheme = "light" | "dark";

export type ChartShareImageInput = {
	node: HTMLElement;
	/** Optional first line above the title, such as `OpenAI: GPT-6.1 Terra`. */
	caption?: string | null;
	title: string;
	subtitle?: string | null;
	/** Footer link text, such as `phaseo.app/models/openai/gpt-6.1-terra`. */
	pagePath: string;
	/** Defaults to the page's theme. */
	theme?: ChartShareTheme;
	/** Footer note on the right, such as `Data as of 4 Nov 2026`, already translated. */
	footnote: string;
	/** Series names and colours, for charts whose legend sits outside the captured element. */
	legend?: Array<{ label: string; color: string }>;
	/** True when `node` was already rendered in `theme` (a fixed-size share render), so no themed copy is needed. */
	nodeIsThemed?: boolean;
};

const LEGEND_ROW_HEIGHT = 24;
const LEGEND_MAX_ROWS = 2;
const LEGEND_RESERVED_HEIGHT = LEGEND_MAX_ROWS * LEGEND_ROW_HEIGHT + 8;

const WIDTH = 1200;
const HEIGHT = 675;
const SCALE = 2;
const PAD = 48;
const CHART_TOP = 164;
const FOOTER_HEIGHT = 60;
const CHART_BOTTOM_GAP = 12;

/** CSS size of the chart area in the image. A chart rendered at exactly this size fills it at 1:1. */
export function getChartShareSlotSize(options: { hasLegend: boolean }): { width: number; height: number } {
	return {
		width: WIDTH - PAD * 2,
		height: HEIGHT - CHART_TOP - FOOTER_HEIGHT - CHART_BOTTOM_GAP - (options.hasLegend ? LEGEND_RESERVED_HEIGHT : 0),
	};
}

const THEMES = {
	light: { background: "#ffffff", border: "#e4e4e7", foreground: "#09090b", muted: "#71717a", wordmark: "/wordmark_light.svg" },
	dark: { background: "#0a0a0a", border: "#27272a", foreground: "#fafafa", muted: "#a1a1aa", wordmark: "/wordmark_dark.svg" },
} as const;

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.decoding = "async";
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Could not load ${src}`));
		image.src = src;
	});
}

function ellipsize(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
	if (context.measureText(text).width <= maxWidth) return text;
	let end = text.length;
	while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > maxWidth) end -= 1;
	return `${text.slice(0, end).trimEnd()}…`;
}

/**
 * Subtitles often start with a unit taken from page copy ("users per week"); capitalise the first letter so the image
 * reads as a heading. Uses the page language's casing rules; scripts without case are unchanged.
 */
export function capitaliseFirst(text: string, locale = typeof document === "undefined" ? undefined : document.documentElement.lang || undefined): string {
	const [first = "", ...rest] = Array.from(text);
	return first.toLocaleUpperCase(locale) + rest.join("");
}

export function currentShareTheme(): ChartShareTheme {
	return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

/**
 * html-to-image's own font embedding regex-scans every CSS rule on the page, which took over 80 s in dev.
 * The chart only uses the page font, so inline just those @font-face rules, read from the CSSOM.
 */
async function buildPageFontEmbedCss(fontFamily: string): Promise<string> {
	const families = new Set(fontFamily.split(",").map((name) => name.trim().replace(/^["']|["']$/g, "").toLowerCase()));
	const rules: CSSFontFaceRule[] = [];
	for (const sheet of Array.from(document.styleSheets)) {
		let cssRules: CSSRuleList;
		try {
			cssRules = sheet.cssRules;
		} catch {
			continue; // Cross-origin sheet.
		}
		for (const rule of Array.from(cssRules)) {
			if (!(rule instanceof CSSFontFaceRule)) continue;
			const family = rule.style.getPropertyValue("font-family").trim().replace(/^["']|["']$/g, "").toLowerCase();
			if (families.has(family)) rules.push(rule);
		}
	}
	const inlined = await Promise.all(
		rules.map(async (rule) => {
			let css = rule.cssText;
			const urls = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => match[1]);
			for (const url of new Set(urls)) {
				if (url.startsWith("data:")) continue;
				const response = await fetch(new URL(url, rule.parentStyleSheet?.href ?? document.baseURI));
				if (!response.ok) continue;
				css = css.split(url).join(await blobToDataUrl(await response.blob()));
			}
			return css;
		}),
	);
	return inlined.join("\n");
}

// Built once per page; later shares reuse it.
let fontEmbedCssPromise: Promise<string> | null = null;

/**
 * Captures the chart as SVG with html-to-image, then rasterises it here. html-to-image's own `toCanvas` waits for an
 * animation frame after decoding, which never comes while the tab is in the background, so a capture started just
 * before switching tabs (or in a hidden test browser) would hang.
 */
async function captureChart(node: HTMLElement, background: string): Promise<HTMLCanvasElement> {
	const { toSvg } = await import("html-to-image");
	fontEmbedCssPromise ??= buildPageFontEmbedCss(getComputedStyle(node).fontFamily).catch(() => {
		fontEmbedCssPromise = null;
		return "";
	});
	const fontEmbedCSS = await fontEmbedCssPromise;
	const { width, height } = node.getBoundingClientRect();
	// Small cards are upscaled into a 1100px-wide slot, so capture them at a higher ratio.
	const pixelRatio = Math.min(4, Math.max(2, Math.ceil((1104 * SCALE) / Math.max(1, width))));
	const svgUrl = await toSvg(node, {
		backgroundColor: background,
		cacheBust: false,
		fontEmbedCSS,
		// The node may be an off-screen host (`position: fixed; left: -100000px`); the snapshot root must sit at 0,0.
		style: { position: "static", left: "0", top: "0", transform: "none", margin: "0" },
		filter: (element) =>
			!(element instanceof HTMLElement && (element.getAttribute("role") === "tooltip" || element.hasAttribute("data-share-hide"))),
	});
	const image = new Image();
	image.decoding = "async";
	image.src = svgUrl;
	await image.decode();
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(width * pixelRatio));
	canvas.height = Math.max(1, Math.round(height * pixelRatio));
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas is not available");
	context.fillStyle = background;
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	return canvas;
}

/** Rules that set each theme's colour tokens, applied in this order. Palette variants are left out on purpose. */
const THEME_TOKEN_SELECTORS: Record<ChartShareTheme, string[]> = {
	light: [":root", ":root:not(.dark)"],
	dark: [":root", ".dark", ":root.dark"],
};
const themeTokenCache = new Map<ChartShareTheme, Array<[string, string]>>();

function collectStyleRules(rules: CSSRuleList, into: CSSStyleRule[]) {
	for (const rule of Array.from(rules)) {
		if (rule instanceof CSSStyleRule) into.push(rule);
		else if (rule instanceof CSSLayerBlockRule) collectStyleRules(rule.cssRules, into);
	}
}

/** Reads a theme's custom properties from the page's own CSS, so the copy matches the site, accent colours included. */
function readThemeTokens(theme: ChartShareTheme): Array<[string, string]> {
	const cached = themeTokenCache.get(theme);
	if (cached) return cached;
	const rules: CSSStyleRule[] = [];
	for (const sheet of Array.from(document.styleSheets)) {
		try {
			collectStyleRules(sheet.cssRules, rules);
		} catch {
			// Cross-origin sheet.
		}
	}
	const tokens = new Map<string, string>();
	for (const selector of THEME_TOKEN_SELECTORS[theme]) {
		for (const rule of rules) {
			if (!rule.selectorText.split(",").some((part) => part.trim() === selector)) continue;
			for (const name of Array.from(rule.style)) {
				if (name.startsWith("--")) tokens.set(name, rule.style.getPropertyValue(name).trim());
			}
		}
	}
	const result = [...tokens];
	themeTokenCache.set(theme, result);
	return result;
}

function usableBackground(value: string | null | undefined): string | null {
	return value && value !== "rgba(0, 0, 0, 0)" && value !== "transparent" ? value : null;
}

/**
 * Gives `element` the colour tokens of `theme`, so a chart rendered inside it draws in that theme whatever the page
 * uses. Tailwind `dark:` variants still follow the page, but the charts colour themselves through tokens.
 */
export function applyChartShareTheme(element: HTMLElement, theme: ChartShareTheme) {
	element.classList.toggle("dark", theme === "dark");
	for (const [name] of readThemeTokens(theme === "dark" ? "light" : "dark")) element.style.removeProperty(name);
	for (const [name, value] of readThemeTokens(theme)) element.style.setProperty(name, value);
	Object.assign(element.style, { colorScheme: theme, background: "var(--background)", color: "var(--foreground)" });
}

/**
 * Runs `capture` on the chart as it looks in `theme`. When that differs from the page's theme, captures an
 * off-screen copy inside a wrapper carrying the other theme's tokens. Used only for charts without a fixed-size
 * share render, which draw themselves in the chosen theme instead.
 */
async function withThemedChart<T>(node: HTMLElement, theme: ChartShareTheme, alreadyThemed: boolean, capture: (target: HTMLElement, background: string) => Promise<T>): Promise<T> {
	if (alreadyThemed) {
		return capture(node, usableBackground(getComputedStyle(node).backgroundColor) ?? THEMES[theme].background);
	}
	if (theme === currentShareTheme()) {
		return capture(node, usableBackground(getComputedStyle(document.body).backgroundColor) ?? THEMES[theme].background);
	}
	const wrapper = document.createElement("div");
	wrapper.setAttribute("aria-hidden", "true");
	applyChartShareTheme(wrapper, theme);
	Object.assign(wrapper.style, {
		position: "fixed",
		left: "-100000px",
		top: "0",
		width: `${node.getBoundingClientRect().width}px`,
		pointerEvents: "none",
	});
	const copy = node.cloneNode(true) as HTMLElement;
	wrapper.appendChild(copy);
	document.body.appendChild(wrapper);
	try {
		await Promise.all([...copy.querySelectorAll("img")].map((image) => image.decode().catch(() => undefined)));
		return await capture(copy, usableBackground(getComputedStyle(wrapper).backgroundColor) ?? THEMES[theme].background);
	} finally {
		wrapper.remove();
	}
}

export async function renderChartShareImage(input: ChartShareImageInput): Promise<Blob> {
	const themeName = input.theme ?? currentShareTheme();
	const theme = THEMES[themeName];
	await document.fonts?.ready;
	const fontFamily = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";

	const [{ chart, background }, wordmark] = await Promise.all([
		withThemedChart(input.node, themeName, Boolean(input.nodeIsThemed), async (target, background) => ({ chart: await captureChart(target, background), background })),
		loadImage(theme.wordmark).catch(() => null),
	]);

	const canvas = document.createElement("canvas");
	canvas.width = WIDTH * SCALE;
	canvas.height = HEIGHT * SCALE;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas is not available");
	context.scale(SCALE, SCALE);
	context.textBaseline = "alphabetic";

	context.fillStyle = background;
	context.fillRect(0, 0, WIDTH, HEIGHT);

	// Header: model, chart title, chart settings. Wordmark on the right.
	const wordmarkHeight = 26;
	const wordmarkWidth = wordmark ? (wordmark.naturalWidth / Math.max(1, wordmark.naturalHeight)) * wordmarkHeight : 0;
	const headerWidth = WIDTH - PAD * 2 - wordmarkWidth - 32;
	if (wordmark) context.drawImage(wordmark, WIDTH - PAD - wordmarkWidth, PAD + 2, wordmarkWidth, wordmarkHeight);

	// Without a caption, the title and subtitle move up into its space; the chart area stays where it is.
	const headerShift = input.caption ? 0 : 24;
	if (input.caption) {
		context.fillStyle = theme.muted;
		context.font = `500 20px ${fontFamily}`;
		context.fillText(ellipsize(context, input.caption, headerWidth), PAD, PAD + 20);
	}

	context.fillStyle = theme.foreground;
	context.font = `700 38px ${fontFamily}`;
	context.fillText(ellipsize(context, input.title, headerWidth), PAD, PAD + 66 - headerShift);

	if (input.subtitle) {
		context.fillStyle = theme.muted;
		context.font = `400 18px ${fontFamily}`;
		context.fillText(ellipsize(context, capitaliseFirst(input.subtitle), WIDTH - PAD * 2), PAD, PAD + 100 - headerShift);
	}

	// Optional legend, for charts whose labels live outside the captured element. Laid out first so the chart fits above it.
	const legendRows: Array<Array<{ label: string; color: string; x: number }>> = [];
	if (input.legend?.length) {
		context.font = `500 15px ${fontFamily}`;
		let row: Array<{ label: string; color: string; x: number }> = [];
		let x = PAD;
		for (const item of input.legend) {
			const label = ellipsize(context, item.label, 220);
			const width = 16 + context.measureText(label).width + 24;
			if (x + width > WIDTH - PAD && row.length) {
				legendRows.push(row);
				if (legendRows.length === LEGEND_MAX_ROWS) break;
				row = [];
				x = PAD;
			}
			row.push({ label, color: item.color, x });
			x += width;
		}
		if (row.length && legendRows.length < LEGEND_MAX_ROWS) legendRows.push(row);
	}
	// Always reserve the full legend block, so fixed-size share renders know their slot in advance.
	const legendHeight = input.legend?.length ? LEGEND_RESERVED_HEIGHT : 0;

	// The captured chart keeps its own card styling, so draw it straight onto the canvas, fitted without stretching.
	const slotWidth = WIDTH - PAD * 2;
	const slotHeight = HEIGHT - CHART_TOP - FOOTER_HEIGHT - CHART_BOTTOM_GAP - legendHeight;
	const ratio = Math.min(slotWidth / chart.width, slotHeight / chart.height);
	const drawWidth = chart.width * ratio;
	const drawHeight = chart.height * ratio;
	context.imageSmoothingQuality = "high";
	context.drawImage(chart, PAD + (slotWidth - drawWidth) / 2, CHART_TOP + (slotHeight - drawHeight) / 2, drawWidth, drawHeight);

	if (legendRows.length) {
		context.font = `500 15px ${fontFamily}`;
		const legendTop = CHART_TOP + slotHeight + 8;
		legendRows.forEach((row, rowIndex) => {
			const y = legendTop + rowIndex * LEGEND_ROW_HEIGHT;
			for (const item of row) {
				context.fillStyle = item.color;
				context.beginPath();
				context.roundRect(item.x, y + 4, 10, 10, 2);
				context.fill();
				context.fillStyle = theme.foreground;
				context.fillText(item.label, item.x + 16, y + 14);
			}
		});
	}

	// Thin rule above the footer.
	context.fillStyle = theme.border;
	context.fillRect(PAD, HEIGHT - FOOTER_HEIGHT + 4, WIDTH - PAD * 2, 1);

	// Footer: page link on the left, capture date on the right.
	const footerY = HEIGHT - PAD + 14;
	const dateLabel = input.footnote;
	context.font = `400 16px ${fontFamily}`;
	context.fillStyle = theme.muted;
	const dateWidth = context.measureText(dateLabel).width;
	context.textAlign = "right";
	context.fillText(dateLabel, WIDTH - PAD, footerY);
	context.textAlign = "left";
	context.fillStyle = theme.foreground;
	context.font = `500 16px ${fontFamily}`;
	context.fillText(ellipsize(context, input.pagePath, WIDTH - PAD * 2 - dateWidth - 32), PAD, footerY);

	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image"))), "image/png");
	});
}
