// The performance report as one self-contained HTML page: headline tiles, a before/after dot chart per section and
// unit (or median bars with a p95 whisker when there is no baseline), distributions of key and frame times, and a
// table view of every number. run.mjs writes it beside report.md; to rebuild one from saved reports:
//   node scripts/perf/report-html.mjs <report.json> [--baseline=<earlier report.json>] [--out=<file.html>]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compare } from "./report.mjs";

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
const units = { ms: "ms", MB: "MB", KB: "KB", "%": "%", frames: "frames", count: "" };
const format = (value, unit) => value === undefined ? "–" : `${value >= 100 ? Math.round(value).toLocaleString("en-US") : value}${unit === "count" ? "" : unit === "%" ? "%" : ` ${units[unit] ?? unit}`}`;
// A round axis maximum and its ticks.
const ticks = max => {
	if (!(max > 0)) return { top: 1, steps: [0, 1] };
	const rough = max / 4, power = 10 ** Math.floor(Math.log10(rough)), step = [1, 2, 2.5, 5, 10].map(value => value * power).find(value => value >= rough);
	const top = Math.ceil(max / step) * step;
	return { top, steps: Array.from({ length: Math.round(top / step) + 1 }, (_, index) => +(index * step).toFixed(6)) };
};

function deltaLabel(metric) {
	if (!metric.verdict) return "";
	const sign = metric.delta > 0 ? "+" : "";
	const text = `${sign}${format(metric.delta, metric.unit)} (${sign}${metric.deltaPercent}%)`;
	if (metric.verdict === "better") return `<span class="delta good"><span aria-hidden="true">▼</span> ${escape(text)} better</span>`;
	if (metric.verdict === "worse") return `<span class="delta bad"><span aria-hidden="true">▲</span> ${escape(text)} worse</span>`;
	return `<span class="delta same">${escape(text)}</span>`;
}

/** One chart: rows of a section that share a unit, on one axis. */
function chart(rows, unit) {
	const withBaseline = rows.some(metric => metric.baseline);
	const max = Math.max(...rows.flatMap(metric => [metric.summary.median, withBaseline ? metric.baseline?.median ?? 0 : metric.summary.p95]));
	const { top, steps } = ticks(max);
	const at = value => `${Math.max(0, Math.min(100, value / top * 100)).toFixed(2)}%`;
	const axis = `<div class="axis" aria-hidden="true">${steps.map(step => `<span style="left:${at(step)}">${escape(format(step, unit))}</span>`).join("")}</div>`;
	const body = rows.map(metric => {
		const s = metric.summary, tip = escape(JSON.stringify({ name: metric.name, note: metric.note, unit, median: s.median, p95: s.p95, min: s.min, max: s.max, n: s.n, before: metric.baseline?.median, delta: metric.verdict ? `${metric.delta > 0 ? "+" : ""}${format(metric.delta, unit)} (${metric.deltaPercent > 0 ? "+" : ""}${metric.deltaPercent}%)` : undefined, verdict: metric.verdict }));
		let marks;
		if (withBaseline && metric.baseline) {
			const a = metric.baseline.median, b = s.median, left = Math.min(a, b), right = Math.max(a, b);
			marks = `<span class="link" style="left:${at(left)};width:calc(${at(right)} - ${at(left)})"></span><span class="dot before" style="left:${at(a)}"></span><span class="dot now" style="left:${at(b)}"></span>`;
		} else {
			marks = `<span class="bar" style="width:${at(s.median)}"></span>${s.n > 1 ? `<span class="whisker" style="left:${at(s.median)};width:calc(${at(s.p95)} - ${at(s.median)})"></span>` : ""}`;
		}
		return `<div class="row" tabindex="0" data-tip="${tip}">
			<div class="label"><span class="name">${escape(metric.name)}</span>${metric.note ? `<span class="note">${escape(metric.note)}</span>` : ""}</div>
			<div class="track">${steps.map(step => `<span class="grid" style="left:${at(step)}"></span>`).join("")}${marks}</div>
			<div class="value"><span class="figure">${escape(format(s.median, unit))}</span>${deltaLabel(metric)}${s.n === 1 && metric.verdict ? `<span class="note">1 run</span>` : ""}</div>
		</div>`;
	}).join("");
	return `<div class="chart">${`<div class="row axis-row"><div></div>${axis}<div></div></div>`}${body}</div>`;
}

/** A histogram of raw samples, before and after side by side on the same bins. */
function histogram(title, now, before, unit, cap, slow) {
	const values = [...now, ...before ?? []].filter(Number.isFinite);
	if (!values.length) return "";
	const limit = cap ?? Math.max(...values), bins = 24, width = limit / bins;
	const count = list => { const out = Array(bins).fill(0); for (const value of list) out[Math.min(bins - 1, Math.max(0, Math.floor(value / width)))]++; return out.map(n => n / Math.max(1, list.length)); };
	const series = [["now", "This run", now], ...before ? [["before", "Before", before]] : []].map(([key, label, list]) => ({ key, label, list, shares: count(list) }));
	const peak = Math.max(...series.flatMap(entry => entry.shares));
	const panel = entry => `<figure class="hist">
		<figcaption><span class="swatch ${entry.key}"></span>${escape(entry.label)} <span class="note">${entry.list.length} samples · median ${escape(format(+[...entry.list].sort((a, b) => a - b)[Math.floor(entry.list.length / 2)].toFixed(1), unit))}</span></figcaption>
		<div class="bins">${entry.shares.map((share, index) => `<span class="bin ${entry.key}" style="height:${share ? `max(3px, ${(share / peak * 100).toFixed(1)}%)` : "0"}" data-tip="${escape(JSON.stringify({ name: `${(index * width).toFixed(1)}–${((index + 1) * width).toFixed(1)} ${unit}${index === bins - 1 && cap ? " and over" : ""}`, share: `${(share * 100).toFixed(1)}% of samples` }))}"></span>`).join("")}</div>
		${slow ? `<p class="tail">${entry.list.filter(value => value > slow).length} over ${slow} ms (${(entry.list.filter(value => value > slow).length / Math.max(1, entry.list.length) * 100).toFixed(1)}%)</p>` : ""}
		<div class="bin-axis"><span>0</span><span>${escape(format(+(limit / 2).toFixed(1), unit))}</span><span>${escape(format(+limit.toFixed(1), unit))}${cap ? "+" : ""}</span></div>
	</figure>`;
	return `<div class="hist-group"><h3>${escape(title)}</h3><div class="hist-row">${series.map(panel).join("")}</div></div>`;
}

export function html(report, compared, baseline) {
	const rows = (compared ?? report.metrics).filter(metric => !(metric.group.startsWith("Store") && metric.name === "seed"));
	const rank = group => [/^Interactions/, /^Main process reads/, /^Parallel streaming/, /^Startup/, /^Memory/, /^Store/, /^Bundle/].findIndex(pattern => pattern.test(group));
	const groups = [...new Set(rows.map(metric => metric.group))].sort((a, b) => (rank(a) < 0 ? 99 : rank(a)) - (rank(b) < 0 ? 99 : rank(b)));
	// Startup at a glance: when each profile became interactive, on a fresh copy and on a reused profile.
	const glance = rows.filter(metric => metric.group.startsWith("Startup") && metric.name === "Interactive" && metric.summary)
		.map(metric => ({ ...metric, name: metric.group.replace(/^Startup \((.*)\), (.*)$/, (_, profile, kind) => `${profile[0].toUpperCase()}${profile.slice(1)}, ${kind}`) }));
	const worse = compared?.filter(metric => metric.verdict === "worse") ?? [], better = compared?.filter(metric => metric.verdict === "better") ?? [];
	// Headline tiles: the largest relative improvements outside startup (startup moves with machine state; see the note).
	const headline = (compared ?? []).filter(metric => metric.verdict === "better" && !metric.group.startsWith("Startup") && metric.unit === "ms").sort((a, b) => a.deltaPercent - b.deltaPercent).slice(0, 4);
	const tiles = compared ? `<section class="tiles">
		<div class="tile"><span class="tile-label">Compared with the baseline</span><span class="tile-figure">${better.length} better</span><span class="tile-sub">${worse.length} worse · ${rows.length - better.length - worse.length} about the same</span></div>
		${headline.map(metric => `<div class="tile"><span class="tile-label">${escape(metric.name)}</span><span class="tile-figure">${escape(format(metric.summary.median, metric.unit))}</span><span class="tile-sub">was ${escape(format(metric.baseline.median, metric.unit))} · <span class="delta good"><span aria-hidden="true">▼</span> ${Math.abs(metric.deltaPercent)}%</span></span></div>`).join("")}
	</section>` : "";
	const section = group => {
		const inGroup = rows.filter(metric => metric.group === group && metric.summary);
		const byUnit = [...new Set(inGroup.map(metric => metric.unit))];
		const table = `<details><summary>Table view</summary><table><thead><tr><th>Metric</th><th>Median</th><th>p95</th><th>Min</th><th>Max</th><th>n</th>${compared ? "<th>Before</th><th>Change</th>" : ""}</tr></thead><tbody>${inGroup.map(metric => `<tr><td>${escape(metric.name)}${metric.note ? ` <span class="note">(${escape(metric.note)})</span>` : ""}</td><td>${escape(format(metric.summary.median, metric.unit))}</td><td>${metric.summary.p95}</td><td>${metric.summary.min}</td><td>${metric.summary.max}</td><td>${metric.summary.n}</td>${compared ? `<td>${metric.baseline ? escape(format(metric.baseline.median, metric.unit)) : "–"}</td><td>${deltaLabel(metric) || "–"}</td>` : ""}</tr>`).join("")}</tbody></table></details>`;
		const charts = byUnit.map(unit => chart(inGroup.filter(metric => metric.unit === unit), unit)).join("");
		// Startup steps sit folded under the summary: they are long, and they move with the machine.
		if (group.startsWith("Startup")) return `<details class="group fold"><summary><h2>${escape(group)}</h2></summary>${charts}${table}</details>`;
		return `<section class="group"><h2>${escape(group)}</h2>${charts}${table}</section>`;
	};
	const startupSummary = glance.length ? `<section class="group"><h2>Startup: time to interactive</h2><p class="lede">From the moment Electron is spawned until the workspace has loaded and the sidebar and main pane have drawn. Each profile's steps are below.</p>${chart(glance, "ms")}</section>` : "";
	const sections = groups.map(group => (group === groups.find(value => value.startsWith("Startup")) ? startupSummary : "") + section(group)).join("");
	const now = report.raw?.interactions, then = baseline?.raw?.interactions;
	const distributions = now ? `<section class="group"><h2>Distributions</h2><p class="lede">Every keystroke and every frame, not just the median. Most of the mass should sit far left; a tail to the right is what people feel as stutter.</p>
		${histogram("Typing: key to next frame", now.typing?.keyLatencies ?? [], then?.typing?.keyLatencies, "ms", 40, 16)}
		${histogram("Scrolling the 2,000-turn chat: frame time", now.scrollLongChat?.gaps ?? [], then?.scrollLongChat?.gaps, "ms", 50, 33)}
	</section>` : "";
	const legend = compared ? `<div class="legend" role="list"><span role="listitem"><span class="dot now static"></span>This run (median)</span><span role="listitem"><span class="dot before static"></span>Before (median)</span><span role="listitem"><span class="delta good">▼ better</span></span><span role="listitem"><span class="delta bad">▲ worse</span></span></div>`
		: `<div class="legend" role="list"><span role="listitem"><span class="swatch now"></span>Median</span><span role="listitem"><span class="whisker-key"></span>to p95</span></div>`;
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Desktop performance</title>
<style>
:root { color-scheme: light; --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7; --ring: rgba(11,11,11,0.10);
	--now: #2a78d6; --before: #eb6834; --good: #006300; --bad: #d03b3b; }
@media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) { color-scheme: dark; --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781; --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10); --now: #3987e5; --before: #d95926; --good: #0ca30c; --bad: #e66767; } }
:root[data-theme="dark"] { color-scheme: dark; --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7; --muted: #898781; --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10); --now: #3987e5; --before: #d95926; --good: #0ca30c; --bad: #e66767; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1120px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 0 0 12px; } h3 { font-size: 13px; font-weight: 600; margin: 0 0 8px; color: var(--ink-2); }
.meta { color: var(--ink-2); margin: 0 0 20px; display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; }
.notice { border: 1px solid var(--ring); border-left: 3px solid var(--muted); background: var(--surface); border-radius: 6px; padding: 10px 12px; color: var(--ink-2); margin: 0 0 20px; font-size: 13px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 24px; }
.tile { background: var(--surface); border: 1px solid var(--ring); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tile-label { color: var(--ink-2); font-size: 12.5px; } .tile-figure { font-size: 26px; font-weight: 650; } .tile-sub { color: var(--ink-2); font-size: 12.5px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0 0 16px; color: var(--ink-2); font-size: 12.5px; } .legend > span { display: inline-flex; align-items: center; gap: 6px; }
.group { background: var(--surface); border: 1px solid var(--ring); border-radius: 8px; padding: 16px; margin-bottom: 16px; }
.lede { color: var(--ink-2); margin: -4px 0 14px; font-size: 13px; }
.chart { margin-bottom: 12px; }
.row { display: grid; grid-template-columns: minmax(150px, 34%) 1fr minmax(120px, 18%); gap: 12px; align-items: center; min-height: 30px; border-radius: 4px; padding: 2px 4px; }
.row:not(.axis-row):hover, .row:focus-visible { background: color-mix(in oklab, var(--ink) 5%, transparent); outline: none; }
.label { display: flex; flex-direction: column; min-width: 0; } .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .note { color: var(--muted); font-size: 11.5px; }
.label .note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track { position: relative; height: 20px; }
.axis { position: relative; height: 16px; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.axis span { position: absolute; transform: translateX(-50%); white-space: nowrap; } .axis span:first-child { transform: none; } .axis span:last-child { transform: translateX(-100%); }
.grid { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--grid); }
.grid:first-child { background: var(--axis); }
.link { position: absolute; top: 9px; height: 2px; background: var(--axis); }
.dot { position: absolute; top: 4px; width: 12px; height: 12px; margin-left: -6px; border-radius: 50%; box-shadow: 0 0 0 2px var(--surface); }
.dot.now { background: var(--now); } .dot.before { background: var(--surface); border: 2px solid var(--before); }
.dot.static { position: static; margin: 0; display: inline-block; box-shadow: none; }
.bar { position: absolute; top: 4px; left: 0; height: 12px; background: var(--now); border-radius: 0 4px 4px 0; }
.whisker { position: absolute; top: 9px; height: 2px; background: var(--ink-2); } .whisker-key { display: inline-block; width: 18px; height: 2px; background: var(--ink-2); }
.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; } .swatch.now { background: var(--now); } .swatch.before { background: var(--before); }
.value { display: flex; flex-direction: column; align-items: flex-end; text-align: right; font-variant-numeric: tabular-nums; } .figure { font-weight: 600; }
.delta { font-size: 11.5px; white-space: nowrap; } .delta.good { color: var(--good); } .delta.bad { color: var(--bad); } .delta.same { color: var(--muted); }
details { margin-top: 8px; } summary { cursor: pointer; color: var(--ink-2); font-size: 12.5px; }
details.group.fold { padding: 12px 16px; } details.group.fold > summary { list-style: none; display: flex; align-items: center; gap: 8px; }
details.group.fold > summary::before { content: "▸"; color: var(--muted); } details.group.fold[open] > summary::before { content: "▾"; }
details.group.fold > summary h2 { margin: 0; font-size: 14px; color: var(--ink); } details.group.fold[open] > summary { margin-bottom: 12px; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12.5px; font-variant-numeric: tabular-nums; } th, td { text-align: right; padding: 5px 6px; border-bottom: 1px solid var(--grid); } th:first-child, td:first-child { text-align: left; } th { color: var(--ink-2); font-weight: 600; }
.hist-group { margin-bottom: 16px; } .hist-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.hist { margin: 0; } .hist figcaption { font-size: 12.5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.bins { display: flex; align-items: flex-end; gap: 2px; height: 110px; border-bottom: 1px solid var(--axis); }
.bins .bin[style*="height:0"] { min-height: 0; }
.bin { flex: 1; min-height: 1px; border-radius: 3px 3px 0 0; } .bin.now { background: var(--now); } .bin.before { background: var(--before); }
.bin:hover { filter: brightness(1.15); }
.tail { margin: 4px 0 0; font-size: 11.5px; color: var(--ink-2); }
.bin-axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); margin-top: 4px; font-variant-numeric: tabular-nums; }
#tip { position: fixed; pointer-events: none; z-index: 10; background: var(--surface); color: var(--ink); border: 1px solid var(--ring); border-radius: 6px; padding: 8px 10px; font-size: 12px; box-shadow: 0 6px 20px rgba(0,0,0,0.18); max-width: 300px; display: none; font-variant-numeric: tabular-nums; }
#tip b { display: block; margin-bottom: 4px; } #tip .k { color: var(--ink-2); }
@media (max-width: 640px) { .row { grid-template-columns: 1fr; gap: 2px; padding: 6px 4px; } .axis-row { display: none; } .value { flex-direction: row; gap: 8px; align-items: baseline; justify-content: flex-start; } }
</style></head>
<body><main>
<h1>Desktop performance</h1>
<p class="meta"><span>${escape(report.startedAt?.slice(0, 16).replace("T", " "))} UTC</span><span>Commit ${escape(report.commit)}</span><span>${escape(report.machine)}</span><span>${report.options?.runs ?? "?"} launches per startup profile</span>${report.baselineFile ? `<span>Compared with ${escape(path.basename(path.dirname(report.baselineFile)))}</span>` : ""}</p>
${compared ? `<p class="notice">Startup times move with the machine's state (file cache, other apps): two runs of unchanged startup code an hour apart differed by 25–40%. Treat startup changes smaller than that as noise unless both builds were run back to back. Interaction rows with n = 1 vary by 10–40%.</p>` : ""}
${tiles}
${legend}
${sections.includes("<h2>Parallel streaming") ? sections.replace('<section class="group"><h2>Parallel streaming', () => distributions + '<section class="group"><h2>Parallel streaming') : sections + distributions}
${report.notes?.length ? `<section class="group"><h2>Notes</h2><ul>${report.notes.map(note => `<li>${escape(note)}</li>`).join("")}</ul></section>` : ""}
</main>
<div id="tip" role="tooltip"></div>
<script>
const tip = document.getElementById("tip");
const show = (target, x, y) => {
	const data = JSON.parse(target.dataset.tip), lines = [];
	if (data.note) lines.push('<span class="k">' + esc(data.note) + '</span>');
	if (data.median !== undefined) lines.push('<span class="k">Median</span> ' + data.median + ' ' + (data.unit === "count" ? "" : data.unit) + ' · <span class="k">p95</span> ' + data.p95 + ' · <span class="k">n</span> ' + data.n, '<span class="k">Min</span> ' + data.min + ' · <span class="k">Max</span> ' + data.max);
	if (data.before !== undefined) lines.push('<span class="k">Before</span> ' + data.before + (data.delta ? ' · ' + esc(data.delta) + (data.verdict && data.verdict !== "same" ? ' ' + data.verdict : '') : ''));
	if (data.share) lines.push(esc(data.share));
	tip.innerHTML = '<b>' + esc(data.name) + '</b>' + lines.join('<br>');
	tip.style.display = "block";
	const box = tip.getBoundingClientRect();
	tip.style.left = Math.min(innerWidth - box.width - 8, x + 14) + "px";
	tip.style.top = Math.max(8, Math.min(innerHeight - box.height - 8, y + 14)) + "px";
};
const esc = value => String(value ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
document.addEventListener("pointermove", event => { const target = event.target.closest("[data-tip]"); if (target) show(target, event.clientX, event.clientY); else tip.style.display = "none"; });
document.addEventListener("focusin", event => { const target = event.target.closest("[data-tip]"); if (!target) return; const box = target.getBoundingClientRect(); show(target, box.left + box.width / 2, box.bottom); });
document.addEventListener("focusout", () => { tip.style.display = "none"; });
</script>
</body></html>
`;
}

// As a command: rebuild the page from saved reports.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const [file] = process.argv.slice(2).filter(value => !value.startsWith("--"));
	const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
	if (!file) { console.error("usage: node scripts/perf/report-html.mjs <report.json> [--baseline=<report.json>] [--out=<file.html>]"); process.exit(1); }
	const report = JSON.parse(readFileSync(file, "utf8"));
	// --baseline is relative to here; one recorded in the report is relative to apps/desktop, where run.mjs runs.
	const baselineFile = option("baseline") ?? report.baselineFile;
	const baselinePath = option("baseline") ? path.resolve(option("baseline")) : baselineFile ? path.resolve(import.meta.dirname, "../..", baselineFile) : undefined;
	const baseline = baselinePath ? JSON.parse(readFileSync(baselinePath, "utf8")) : undefined;
	const out = option("out") ?? path.join(path.dirname(file), "report.html");
	writeFileSync(out, html({ ...report, ...(baselineFile ? { baselineFile } : {}) }, baseline ? compare(report, baseline, report.options?.threshold ?? 10) : undefined, baseline));
	console.log(out);
}
