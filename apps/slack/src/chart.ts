import type { AgentTool } from "@phaseo/agent-sdk";
import type { UploadResult } from "./slack-files";
import { ToolInputError } from "./usage-tools";

// make_chart: the model passes a small chart spec (bar, line or pie), the Worker
// checks it, draws it as SVG, turns that into a PNG (chart-png.ts) and posts it
// in the thread. It is offered only when the installation has files:write.
//
// Drawing follows Phaseo's chart conventions: one value axis from zero, thin
// marks with 4px rounded data ends and 2px surface gaps, hairline grid, text in
// ink colours (never a series colour), a legend for two or more series, and
// selective direct labels (bar values when there are few bars, each line's last
// value). Series colours are the web app's accent (#0069a8) and then its model
// series palette, in an order that keeps neighbours apart for colour-blind
// readers (worst adjacent CVD ΔE 13.4 on white, pie wrap included). Text is
// drawn in the bundled Montserrat, so chart text must use the scripts it has
// (DRAWABLE_RANGES); anything else is refused, and the model is told to keep
// such text in its reply.

export const CHART_TYPES = ["bar", "line", "pie"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export type ChartSpec = {
	type: ChartType;
	title: string;
	labels: string[];
	series: Array<{ name: string; values: number[] }>;
	xLabel: string | null;
	yLabel: string | null;
	valuePrefix: string;
	valueSuffix: string;
};

const MAX_TITLE_CHARS = 80;
const MAX_LABEL_CHARS = 40;
const MAX_UNIT_CHARS = 6;
const MAX_SERIES = 6;
const MAX_LABELS: Record<ChartType, number> = { bar: 24, line: 60, pie: 6 };
const MAX_ABS_VALUE = 1e15;

export const SERIES_COLOURS = ["#0069a8", "#FA7048", "#18C8B8", "#6F8E3A", "#F35DA7", "#6867E8"] as const;
const INK = { primary: "#0b0b0b", secondary: "#52514e", grid: "#e1e0d9", baseline: "#c3c2b7", surface: "#ffffff" } as const;
export const FONT_FAMILY = "Montserrat";

/**
 * The code points Montserrat draws that chart text may use: Latin (with
 * Vietnamese), basic Cyrillic, common punctuation, currency signs and a few
 * symbols. Tests check every one against the bundled font.
 */
export const DRAWABLE_RANGES: ReadonlyArray<readonly [number, number]> = [
	[0x20, 0x7e], [0xa0, 0x17f], [0x400, 0x45f], [0x1ea0, 0x1ef9],
	[0x2010, 0x2010], [0x2012, 0x2015], [0x2018, 0x201a], [0x201c, 0x201e], [0x2020, 0x2022], [0x2026, 0x2026],
	[0x2030, 0x2030], [0x2032, 0x2033], [0x2039, 0x203a],
	[0x20a3, 0x20a4], [0x20a6, 0x20a7], [0x20a9, 0x20a9], [0x20ab, 0x20ae], [0x20b1, 0x20b2], [0x20b4, 0x20b5],
	[0x20b8, 0x20ba], [0x20bc, 0x20bd],
	[0x2122, 0x2122], [0x2190, 0x2199], [0x2212, 0x2212], [0x221e, 0x221e], [0x2248, 0x2248], [0x2260, 0x2260], [0x2264, 0x2265],
];

function drawable(text: string): boolean {
	for (const char of text) {
		const code = char.codePointAt(0)!;
		if (!DRAWABLE_RANGES.some(([start, end]) => code >= start && code <= end)) return false;
	}
	return true;
}

function text(value: unknown, field: string, max: number, required: boolean): string | null {
	if (value === undefined || value === null || (typeof value === "string" && !value.trim() && !required)) {
		if (required) throw new ToolInputError(`${field} is required`);
		return null;
	}
	if (typeof value !== "string") throw new ToolInputError(`${field} must be text`);
	const line = value.replace(/\s+/g, " ").trim();
	if (required && !line) throw new ToolInputError(`${field} is required`);
	if (line.length > max) throw new ToolInputError(`${field} must be at most ${max} characters`);
	if (!drawable(line)) {
		throw new ToolInputError(`${field} uses characters the chart font can't draw. Chart text can use Latin and Cyrillic letters, digits and common symbols; write it that way, or leave it out and put it in your reply`);
	}
	return line;
}

/** A value's prefix or suffix, keeping one space between it and the number when it had one ("$", " ms"). */
function unit(value: unknown, field: string, side: "prefix" | "suffix"): string {
	const line = text(value, field, MAX_UNIT_CHARS, false) ?? "";
	if (!line || typeof value !== "string") return line;
	if (side === "prefix") return /\s$/.test(value) ? `${line} ` : line;
	return /^\s/.test(value) ? ` ${line}` : line;
}

/** Checks a make_chart input. Throws ToolInputError, which the model sees, for anything it should fix. */
export function parseChartSpec(input: unknown): ChartSpec {
	const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
	const type = raw.type;
	if (typeof type !== "string" || !(CHART_TYPES as readonly string[]).includes(type)) throw new ToolInputError(`type must be one of ${CHART_TYPES.join(", ")}`);
	const chartType = type as ChartType;
	const title = text(raw.title, "title", MAX_TITLE_CHARS, true)!;
	if (!Array.isArray(raw.labels) || !raw.labels.length) throw new ToolInputError("labels must list at least one label");
	const maxLabels = MAX_LABELS[chartType];
	if (raw.labels.length > maxLabels) throw new ToolInputError(`a ${chartType} chart takes at most ${maxLabels} labels`);
	if (chartType === "pie" && raw.labels.length < 2) throw new ToolInputError("a pie chart needs at least 2 slices; for one number, say it in your reply");
	const labels = raw.labels.map((label, index) => text(typeof label === "number" ? String(label) : label, `labels[${index}]`, MAX_LABEL_CHARS, true)!);
	if (!Array.isArray(raw.series) || !raw.series.length) throw new ToolInputError("series must list at least one series");
	if (raw.series.length > MAX_SERIES) throw new ToolInputError(`series takes at most ${MAX_SERIES} series; combine the rest or make another chart`);
	if (chartType === "pie" && raw.series.length !== 1) throw new ToolInputError("a pie chart takes exactly one series");
	const series = raw.series.map((entry, index) => {
		const item = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
		// A lone series without a name is what the title says.
		const unnamed = item.name === undefined || item.name === null || item.name === "";
		const name = text(unnamed && (raw.series as unknown[]).length === 1 ? title : item.name, `series[${index}].name`, MAX_LABEL_CHARS, true)!;
		if (!Array.isArray(item.values) || item.values.length !== labels.length) throw new ToolInputError(`series[${index}].values must have one number for each of the ${labels.length} labels`);
		const values = item.values.map((value, position) => {
			if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MAX_ABS_VALUE) throw new ToolInputError(`series[${index}].values[${position}] must be a number`);
			return value;
		});
		return { name, values };
	});
	if (chartType === "pie") {
		const values = series[0].values;
		if (values.some((value) => value < 0)) throw new ToolInputError("pie slices can't be negative; use a bar chart");
		if (!values.some((value) => value > 0)) throw new ToolInputError("a pie chart needs a slice above zero");
	}
	return {
		type: chartType,
		title,
		labels,
		series,
		xLabel: chartType === "pie" ? null : text(raw.x_label, "x_label", MAX_LABEL_CHARS, false),
		yLabel: chartType === "pie" ? null : text(raw.y_label, "y_label", MAX_LABEL_CHARS, false),
		valuePrefix: unit(raw.value_prefix, "value_prefix", "prefix"),
		valueSuffix: unit(raw.value_suffix, "value_suffix", "suffix"),
	};
}

// Layout, in SVG pixels. Slack shows the PNG at about half this width.
export const WIDTH = 1200;
export const HEIGHT = 750;
const PAD = { top: 48, right: 56, bottom: 40, left: 56 };
const TITLE_SIZE = 34;
const TITLE_LINE = 42;
const LEGEND_SIZE = 20;
const LEGEND_ROW = 32;
const TICK_SIZE = 18;
const AXIS_SIZE = 18;
const VALUE_SIZE = 16;
const DATA_END_RADIUS = 4;
const SURFACE_GAP = 2;

function escapeXml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]!);
}

/** About how wide Montserrat sets a line; a little generous, so text never runs into its neighbours. */
function textWidth(value: string, size: number): number {
	let em = 0;
	for (const char of value) em += /[A-Z0-9MWmw@%]/.test(char) ? 0.72 : /[ .,:;'|!il1]/.test(char) ? 0.32 : 0.6;
	return em * size;
}

function shorten(value: string, size: number, width: number): string {
	if (textWidth(value, size) <= width) return value;
	let cut = value;
	while (cut.length > 1 && textWidth(`${cut}…`, size) > width) cut = cut.slice(0, -1);
	return `${cut.trimEnd()}…`;
}

/** Text on at most `max` lines of `width`, broken between words; what doesn't fit ends in an ellipsis. */
function wrapLines(value: string, size: number, width: number, max: number): string[] {
	const lines: string[] = [];
	let line = "";
	for (const word of value.split(" ")) {
		const next = line ? `${line} ${word}` : word;
		if (line && textWidth(next, size) > width) {
			lines.push(line);
			line = word;
		} else {
			line = next;
		}
	}
	lines.push(line);
	const kept = lines.length <= max ? lines : [...lines.slice(0, max - 1), lines.slice(max - 1).join(" ")];
	return kept.map((entry) => shorten(entry, size, width));
}

function svgText(x: number, y: number, value: string, attributes: Record<string, string | number>): string {
	const attrs = Object.entries(attributes).map(([name, attr]) => `${name}="${escapeXml(String(attr))}"`).join(" ");
	return `<text x="${round(x)}" y="${round(y)}" ${attrs}>${escapeXml(value)}</text>`;
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/** A value as the chart prints it: $1,250, 12.5%, 3.4M. */
export function formatValue(value: number, spec: Pick<ChartSpec, "valuePrefix" | "valueSuffix">, decimals = 2): string {
	const abs = Math.abs(value);
	const number = abs >= 100_000
		? compact.format(abs)
		: new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals }).format(abs);
	return `${value < 0 ? "−" : ""}${spec.valuePrefix}${number}${spec.valueSuffix}`;
}

/** A value axis from zero, with about five round steps. */
export function niceScale(values: number[]): { min: number; max: number; step: number; decimals: number } {
	let min = Math.min(0, ...values);
	let max = Math.max(0, ...values);
	if (min === max) max = min + 1;
	const rough = (max - min) / 5;
	const exponent = Math.floor(Math.log10(rough));
	const factor = [1, 2, 2.5, 5, 10].find((candidate) => candidate * 10 ** exponent >= rough) ?? 10;
	const step = factor * 10 ** exponent;
	min = Math.floor(min / step) * step;
	max = Math.ceil(max / step) * step;
	// A step of 2.5 × 10ⁿ needs one decimal more than 10ⁿ does.
	const decimals = Math.min(6, Math.max(0, -(factor === 10 ? exponent + 1 : exponent) + (factor === 2.5 ? 1 : 0)));
	return { min, max, step, decimals };
}

function legend(top: number, entries: Array<{ name: string; colour: string }>): { svg: string; height: number } {
	const parts: string[] = [];
	const width = WIDTH - PAD.left - PAD.right;
	let x = PAD.left;
	let row = 0;
	for (const entry of entries) {
		const name = shorten(entry.name, LEGEND_SIZE, width / 2);
		const itemWidth = 16 + 8 + textWidth(name, LEGEND_SIZE);
		if (x > PAD.left && x + itemWidth > PAD.left + width) {
			x = PAD.left;
			row += 1;
		}
		const y = top + row * LEGEND_ROW;
		parts.push(`<rect x="${round(x)}" y="${round(y - 15)}" width="16" height="16" rx="4" fill="${entry.colour}"/>`);
		parts.push(svgText(x + 24, y, name, { "font-size": LEGEND_SIZE, fill: INK.primary }));
		x += itemWidth + 28;
	}
	return { svg: parts.join(""), height: (row + 1) * LEGEND_ROW };
}

/** A bar from the baseline, its data end rounded (4px), the baseline end square. */
function barPath(x: number, width: number, baseline: number, end: number): string {
	const height = Math.abs(end - baseline);
	if (height < 0.5 || width <= 0) return "";
	const r = Math.min(DATA_END_RADIUS, width / 2, height);
	const up = end < baseline;
	const tip = end;
	const inner = up ? tip + r : tip - r;
	return `<path d="M${round(x)} ${round(baseline)}V${round(inner)}Q${round(x)} ${round(tip)} ${round(x + r)} ${round(tip)}H${round(x + width - r)}Q${round(x + width)} ${round(tip)} ${round(x + width)} ${round(inner)}V${round(baseline)}Z"`;
}

function axesChart(spec: ChartSpec, top: number): string {
	const parts: string[] = [];
	const scale = niceScale(spec.series.flatMap((series) => series.values));
	const ticks: number[] = [];
	for (let value = scale.min; value <= scale.max + scale.step / 2; value += scale.step) ticks.push(Math.round(value / scale.step) * scale.step);
	const tickLabels = ticks.map((tick) => formatValue(tick, spec, scale.decimals));
	const tickWidth = Math.max(...tickLabels.map((label) => textWidth(label, TICK_SIZE)));
	const left = PAD.left + (spec.yLabel ? AXIS_SIZE + 16 : 0) + tickWidth + 12;
	// With few lines, each line's last value is labelled to the right of its end.
	const endLabels = spec.type === "line" && spec.series.length <= 4
		? spec.series.map((series) => formatValue(series.values[series.values.length - 1], spec))
		: [];
	const right = WIDTH - PAD.right - (endLabels.length ? Math.max(...endLabels.map((label) => textWidth(label, VALUE_SIZE))) + 14 : 0);
	const count = spec.labels.length;
	const band = (right - left) / count;
	// Category labels: each on up to two lines under its bar or point while they fit; otherwise every nth, on one line.
	const wrapped = band >= 72;
	const every = wrapped ? 1 : Math.max(1, Math.ceil((Math.max(...spec.labels.map((label) => textWidth(shorten(label, TICK_SIZE, 160), TICK_SIZE))) + 16) / band));
	const categoryLines = spec.labels.map((label) => wrapped ? wrapLines(label, TICK_SIZE, band - 10, 2) : [shorten(label, TICK_SIZE, Math.max(band * every - 12, 40))]);
	const categoryRows = Math.max(...categoryLines.map((lines) => lines.length));
	const bottom = HEIGHT - PAD.bottom - (spec.xLabel ? AXIS_SIZE + 18 : 0) - categoryRows * (TICK_SIZE + 4) - 10;
	const plotTop = top + 8;
	const y = (value: number) => bottom - ((value - scale.min) / (scale.max - scale.min)) * (bottom - plotTop);

	// Hairline grid and tick labels; the zero line is the baseline.
	ticks.forEach((tick, index) => {
		const ty = y(tick);
		if (tick !== 0) parts.push(`<line x1="${round(left)}" x2="${round(right)}" y1="${round(ty)}" y2="${round(ty)}" stroke="${INK.grid}" stroke-width="1"/>`);
		parts.push(svgText(left - 12, ty + TICK_SIZE * 0.35, tickLabels[index], { "font-size": TICK_SIZE, fill: INK.secondary, "text-anchor": "end" }));
	});

	const centre = (index: number) => left + band * (index + 0.5);
	categoryLines.forEach((lines, index) => {
		if (index % every !== 0) return;
		lines.forEach((line, row) => {
			parts.push(svgText(centre(index), bottom + TICK_SIZE + 12 + row * (TICK_SIZE + 4), line, { "font-size": TICK_SIZE, fill: INK.secondary, "text-anchor": "middle" }));
		});
	});

	const marks: string[] = [];
	const labels: string[] = [];
	const zero = y(0);
	if (spec.type === "bar") {
		const groupWidth = band * 0.72;
		const seriesCount = spec.series.length;
		const barWidth = Math.max(2, (groupWidth - SURFACE_GAP * (seriesCount - 1)) / seriesCount);
		const showValues = count * seriesCount <= 16;
		spec.series.forEach((series, s) => {
			series.values.forEach((value, index) => {
				const x = centre(index) - groupWidth / 2 + s * (barWidth + SURFACE_GAP);
				const path = barPath(x, barWidth, zero, y(value));
				if (path) marks.push(`${path} fill="${SERIES_COLOURS[s]}"/>`);
				const label = formatValue(value, spec);
				if (showValues && textWidth(label, VALUE_SIZE) <= barWidth + band * 0.28) {
					const ly = value >= 0 ? y(value) - 8 : y(value) + VALUE_SIZE + 6;
					labels.push(svgText(x + barWidth / 2, ly, label, { "font-size": VALUE_SIZE, fill: INK.secondary, "text-anchor": "middle" }));
				}
			});
		});
	} else {
		const markers = count <= 24;
		const ends: Array<{ x: number; y: number }> = [];
		spec.series.forEach((series, s) => {
			const points = series.values.map((value, index) => [centre(index), y(value)] as const);
			if (points.length > 1) {
				marks.push(`<polyline points="${points.map(([px, py]) => `${round(px)},${round(py)}`).join(" ")}" fill="none" stroke="${SERIES_COLOURS[s]}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`);
			}
			if (markers || points.length === 1) {
				for (const [px, py] of points) marks.push(`<circle cx="${round(px)}" cy="${round(py)}" r="5" fill="${SERIES_COLOURS[s]}" stroke="${INK.surface}" stroke-width="2"/>`);
			}
			const last = points[points.length - 1];
			ends.push({ x: last[0], y: last[1] });
		});
		// Each end label beside its line's end, nudged apart so they never overlap.
		const placed = endLabels.map((label, index) => ({ label, ...ends[index] })).sort((a, b) => a.y - b.y);
		let previous = -Infinity;
		for (const end of placed) {
			const ly = Math.max(end.y + VALUE_SIZE * 0.35, previous + VALUE_SIZE + 4);
			previous = ly;
			labels.push(svgText(end.x + 12, ly, end.label, { "font-size": VALUE_SIZE, fill: INK.secondary }));
		}
	}
	parts.push(...marks);
	parts.push(`<line x1="${round(left)}" x2="${round(right)}" y1="${round(zero)}" y2="${round(zero)}" stroke="${INK.baseline}" stroke-width="1"/>`);
	parts.push(...labels);

	if (spec.yLabel) {
		const cy = (plotTop + bottom) / 2;
		parts.push(svgText(PAD.left + AXIS_SIZE, cy, shorten(spec.yLabel, AXIS_SIZE, bottom - plotTop), { "font-size": AXIS_SIZE, fill: INK.secondary, "text-anchor": "middle", transform: `rotate(-90 ${round(PAD.left + AXIS_SIZE)} ${round(cy)})` }));
	}
	if (spec.xLabel) {
		parts.push(svgText((left + right) / 2, HEIGHT - PAD.bottom, shorten(spec.xLabel, AXIS_SIZE, right - left), { "font-size": AXIS_SIZE, fill: INK.secondary, "text-anchor": "middle" }));
	}
	return parts.join("");
}

function pieChart(spec: ChartSpec, top: number): string {
	const parts: string[] = [];
	const values = spec.series[0].values;
	const total = values.reduce((sum, value) => sum + value, 0);
	const radius = Math.min((HEIGHT - PAD.bottom - top) / 2, 250);
	const cx = PAD.left + radius + 8;
	const cy = top + radius;
	let angle = -Math.PI / 2;
	values.forEach((value, index) => {
		if (value <= 0) return;
		const sweep = (value / total) * Math.PI * 2;
		const colour = SERIES_COLOURS[index];
		if (sweep >= Math.PI * 2 - 1e-9) {
			parts.push(`<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(radius)}" fill="${colour}"/>`);
		} else {
			const end = angle + sweep;
			const [x1, y1] = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
			const [x2, y2] = [cx + radius * Math.cos(end), cy + radius * Math.sin(end)];
			// A 2px surface gap between slices.
			parts.push(`<path d="M${round(cx)} ${round(cy)}L${round(x1)} ${round(y1)}A${round(radius)} ${round(radius)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${round(x2)} ${round(y2)}Z" fill="${colour}" stroke="${INK.surface}" stroke-width="${SURFACE_GAP}" stroke-linejoin="round"/>`);
		}
		angle += sweep;
	});
	// The legend beside it names each slice with its share and value, so no slice is told apart by colour alone.
	const x = cx + radius + 64;
	const width = WIDTH - PAD.right - x;
	const rowHeight = 46;
	const startY = cy - ((values.length - 1) * rowHeight) / 2;
	spec.labels.forEach((label, index) => {
		const ry = startY + index * rowHeight;
		const share = `${(Math.round((values[index] / total) * 1000) / 10).toLocaleString("en-US")}%`;
		const value = formatValue(values[index], spec);
		const detail = `${share} · ${value}`;
		parts.push(`<rect x="${round(x)}" y="${round(ry - 16)}" width="18" height="18" rx="4" fill="${SERIES_COLOURS[index]}"/>`);
		parts.push(svgText(x + 30, ry, shorten(label, LEGEND_SIZE + 2, width - 30 - textWidth(detail, LEGEND_SIZE) - 24), { "font-size": LEGEND_SIZE + 2, fill: INK.primary }));
		parts.push(svgText(WIDTH - PAD.right, ry, detail, { "font-size": LEGEND_SIZE, fill: INK.secondary, "text-anchor": "end" }));
	});
	return parts.join("");
}

/** The chart as an SVG document, WIDTH × HEIGHT, on a white surface. */
export function chartSvg(spec: ChartSpec): string {
	const lines = wrapLines(spec.title, TITLE_SIZE, WIDTH - PAD.left - PAD.right, 2);
	const parts: string[] = [
		`<rect width="${WIDTH}" height="${HEIGHT}" fill="${INK.surface}"/>`,
		...lines.map((line, index) => svgText(PAD.left, PAD.top + TITLE_SIZE * 0.8 + index * TITLE_LINE, line, { "font-size": TITLE_SIZE, "font-weight": 600, fill: INK.primary })),
	];
	let top = PAD.top + lines.length * TITLE_LINE + 20;
	if (spec.type !== "pie" && spec.series.length > 1) {
		const drawn = legend(top + LEGEND_SIZE, spec.series.map((series, index) => ({ name: series.name, colour: SERIES_COLOURS[index] })));
		parts.push(drawn.svg);
		top += drawn.height + 12;
	}
	parts.push(spec.type === "pie" ? pieChart(spec, top + 8) : axesChart(spec, top + 8));
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="${FONT_FAMILY}">${parts.join("")}</svg>`;
}

/** What screen readers say for the image: the chart's kind, title and data, up to Slack's 1,000 characters. */
export function chartAltText(spec: ChartSpec): string {
	const data = spec.series.map((series) => `${spec.series.length > 1 || spec.type !== "pie" ? `${series.name}: ` : ""}${series.values.map((value, index) => `${spec.labels[index]} ${formatValue(value, spec)}`).join(", ")}`).join("; ");
	const alt = `${spec.type[0].toUpperCase()}${spec.type.slice(1)} chart: ${spec.title}. ${data}.`;
	return alt.length <= 1_000 ? alt : `${alt.slice(0, 999)}…`;
}

/** A file name from the title: lowercase words joined by dashes. */
export function chartFilename(title: string): string {
	const slug = title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
	return `${slug || "chart"}.png`;
}

export const MAKE_CHART_TOOL_ID = "make_chart";

/**
 * The make_chart tool. `render` turns the SVG into a PNG; `post` uploads it to
 * the thread. A spec the model should fix comes back to it as an error.
 */
export function makeChartTool(options: {
	render: (svg: string) => Promise<Uint8Array>;
	post: (file: { filename: string; title: string; altText: string; bytes: Uint8Array }) => Promise<UploadResult>;
	notes: string[];
}): AgentTool<any, any> {
	return {
		id: MAKE_CHART_TOOL_ID,
		description: `Draw a chart and post it in this Slack thread as an image. Use it when a chart shows numbers better than a list: a bar chart to compare amounts, a line chart for change over time, a pie chart for parts of a whole (2 to 6 slices). Give at most ${MAX_SERIES} series, one number per label in each, and a short title. Chart text must use Latin or Cyrillic letters, digits and common symbols. The chart appears in the thread on its own, before or after your reply, so never say it is above or below; in your reply, say what it shows in a sentence or two rather than repeating every number.`,
		parameters: {
			type: "object",
			properties: {
				type: { type: "string", enum: [...CHART_TYPES], description: "bar, line or pie." },
				title: { type: "string", description: `What the chart shows, at most ${MAX_TITLE_CHARS} characters.` },
				labels: { type: "array", items: { type: "string" }, minItems: 1, maxItems: MAX_LABELS.line, description: `The categories or dates along the bottom (a pie's slices), at most ${MAX_LABELS.bar} for a bar chart, ${MAX_LABELS.line} for a line chart and ${MAX_LABELS.pie} for a pie, each at most ${MAX_LABEL_CHARS} characters.` },
				series: {
					type: "array",
					minItems: 1,
					maxItems: MAX_SERIES,
					description: "The data: one number per label in each series. A pie takes one series.",
					items: {
						type: "object",
						properties: {
							name: { type: "string", description: `The series' name, shown in the legend, at most ${MAX_LABEL_CHARS} characters.` },
							values: { type: "array", items: { type: "number" } },
						},
						required: ["name", "values"],
						additionalProperties: false,
					},
				},
				x_label: { type: "string", description: "Optional: what the labels are, such as Week." },
				y_label: { type: "string", description: "Optional: what the values are, such as Spend (USD)." },
				value_prefix: { type: "string", description: "Optional: printed before each value, such as $." },
				value_suffix: { type: "string", description: "Optional: printed after each value, such as %." },
			},
			required: ["type", "title", "labels", "series"],
			additionalProperties: false,
		},
		onError: "return-to-model",
		execute: async (input: unknown) => {
			const spec = parseChartSpec(input);
			const bytes = await options.render(chartSvg(spec));
			const posted = await options.post({ filename: chartFilename(spec.title), title: spec.title, altText: chartAltText(spec), bytes });
			if (posted.ok === false) {
				console.warn("[slack-agent] chart not posted", { error: posted.error });
				return { posted: false, error: "Slack didn't take the chart just now. Give the numbers in your reply instead." };
			}
			options.notes.push(`make_chart: posted a ${spec.type} chart, "${spec.title}"`);
			return { posted: true, file: chartFilename(spec.title) };
		},
	};
}
