// Where a .cpuprofile spent its time: the top functions by self time and by total time, and time per source file.
//   node scripts/perf/profile-summary.mjs <file.cpuprofile> [--top=25]
import { readFileSync } from "node:fs";

const [file] = process.argv.slice(2).filter(value => !value.startsWith("--"));
const top = Number(process.argv.find(value => value.startsWith("--top="))?.slice(6) ?? 25);
const profile = JSON.parse(readFileSync(file, "utf8"));
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const parents = new Map();
for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);

// Sample time per node: each sample lasts until the next one.
const self = new Map();
profile.samples.forEach((id, index) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[index + 1] ?? 0) / 1000));
const total = (profile.endTime - profile.startTime) / 1000;
const name = node => { const frame = node.callFrame, source = frame.url ? frame.url.replace(/^.*[\\/](node_modules[\\/](?:\.pnpm[\\/])?)?/, "") : ""; return `${frame.functionName || "(anonymous)"} ${source ? `${source}:${frame.lineNumber + 1}` : ""}`.trim(); };

const bySelf = new Map(), byTotal = new Map(), byFile = new Map();
for (const [id, ms] of self) {
	const node = nodes.get(id), key = name(node);
	bySelf.set(key, (bySelf.get(key) ?? 0) + ms);
	const url = node.callFrame.url || `(${node.callFrame.functionName || "native"})`;
	byFile.set(url, (byFile.get(url) ?? 0) + ms);
	// Total: every distinct function on the stack, once per sample.
	const seen = new Set();
	for (let at = id; at !== undefined; at = parents.get(at)) { const ancestor = name(nodes.get(at)); if (seen.has(ancestor)) continue; seen.add(ancestor); byTotal.set(ancestor, (byTotal.get(ancestor) ?? 0) + ms); }
}
const print = (title, map) => {
	console.log(`\n${title}`);
	for (const [key, ms] of [...map].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${ms.toFixed(1).padStart(9)} ms  ${(ms / total * 100).toFixed(1).padStart(5)}%  ${key.slice(0, 160)}`);
};
console.log(`${file}: ${total.toFixed(0)} ms profiled, ${profile.samples.length} samples`);
print("Self time", bySelf);
print("Total time (inclusive)", byTotal);
print("Self time by file", byFile);
