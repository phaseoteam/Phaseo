// Summaries, the Markdown report and the comparison with a baseline run.

export const summary = values => {
	const sorted = values.filter(value => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
	if (!sorted.length) return undefined;
	const pick = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
	const round = value => Math.round(value * 10) / 10;
	return { n: sorted.length, median: round(pick(0.5)), p95: round(pick(0.95)), min: round(sorted[0]), max: round(sorted.at(-1)), mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length) };
};

/**
 * A metric is { group, name, unit, summary, better: "lower" | "higher" }. Metrics are compared by `${group} / ${name}`.
 * A change counts as a regression when it is worse by more than `percent` and by more than the unit's floor, so a
 * 3 ms step from 10 ms to 13 ms is not flagged as 30% worse.
 */
const floors = { ms: 15, MB: 20, "%": 1, KB: 5, count: 1, frames: 2 };
export function compare(current, baseline, percent = 10) {
	const before = new Map(baseline.metrics.map(metric => [`${metric.group} / ${metric.name}`, metric]));
	return current.metrics.map(metric => {
		const old = before.get(`${metric.group} / ${metric.name}`);
		if (!old?.summary || !metric.summary) return { ...metric };
		const was = old.summary.median, now = metric.summary.median, delta = now - was, share = was ? delta / was * 100 : Math.sign(delta) * 100;
		const worse = metric.better === "higher" ? -delta : delta;
		const verdict = worse > (floors[metric.unit] ?? 0) && Math.abs(share) > percent ? "worse" : -worse > (floors[metric.unit] ?? 0) && Math.abs(share) > percent ? "better" : "same";
		return { ...metric, baseline: old.summary, delta: Math.round(delta * 10) / 10, deltaPercent: Math.round(share), verdict };
	});
}

const cell = value => value === undefined ? "–" : String(value);
export function markdown(report, compared) {
	const lines = [`# Desktop performance report`, "", `- When: ${report.startedAt}`, `- Commit: ${report.commit}`, `- Machine: ${report.machine}`, `- Runs: ${report.options.runs} launches per startup profile`, `- Home folder: ${report.options.realHome ? "this machine's (transcripts and agent settings read)" : "empty, per launch"}${report.baselineFile ? `\n- Compared with: ${report.baselineFile}` : ""}`, ""];
	const rows = compared ?? report.metrics;
	if (compared) {
		const worse = compared.filter(metric => metric.verdict === "worse"), better = compared.filter(metric => metric.verdict === "better");
		lines.push(`**${worse.length} worse, ${better.length} better** (a change counts when it moves by over ${report.options.threshold}% and past a small floor per unit).`, "");
	}
	for (const group of [...new Set(rows.map(metric => metric.group))]) {
		lines.push(`## ${group}`, "");
		const withBaseline = rows.some(metric => metric.group === group && metric.baseline);
		lines.push(withBaseline ? "| Metric | Median | p95 | Min | Max | n | Before | Change |" : "| Metric | Median | p95 | Min | Max | n |", withBaseline ? "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |" : "| --- | ---: | ---: | ---: | ---: | ---: |");
		for (const metric of rows.filter(value => value.group === group)) {
			const s = metric.summary ?? {}, unit = metric.unit === "count" ? "" : ` ${metric.unit}`;
			const base = [`${metric.name}${metric.note ? ` (${metric.note})` : ""}`, `${cell(s.median)}${s.median === undefined ? "" : unit}`, cell(s.p95), cell(s.min), cell(s.max), cell(s.n)];
			if (withBaseline) base.push(metric.baseline ? `${metric.baseline.median}${unit}` : "–", metric.verdict ? `${metric.delta > 0 ? "+" : ""}${metric.delta}${unit} (${metric.deltaPercent > 0 ? "+" : ""}${metric.deltaPercent}%)${metric.verdict === "worse" ? " ⚠ worse" : metric.verdict === "better" ? " ✓ better" : ""}` : "–");
			lines.push(`| ${base.join(" | ")} |`);
		}
		lines.push("");
	}
	if (report.notes?.length) lines.push("## Notes", "", ...report.notes.map(note => `- ${note}`), "");
	return lines.join("\n");
}
