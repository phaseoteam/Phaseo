// Compare anonymous page renders between a reference site (apps/web on
// phaseo.app) and web-start, in headless Chromium.
// usage: node scripts/parity-check.mjs [--ref https://phaseo.app] [--new http://localhost:3201] [--out report.json] <path> [path...]
// Reports status, title, visible-text overlap, console/page errors (incl.
// hydration errors) and whether the in-page error boundary rendered.
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
	const i = args.indexOf(name);
	if (i < 0) return fallback;
	const value = args[i + 1];
	args.splice(i, 2);
	return value;
};
const refBase = opt("--ref", "https://phaseo.app");
const newBase = opt("--new", "http://localhost:3201");
const outFile = opt("--out", null);
const paths = args;

const ERROR_SCREEN = /500\s*:|Something went wrong|could not load this page/i;
const IGNORE_CONSOLE = [/Failed to load resource: the server responded with a status of 404/, /t3\.gstatic\.com/, /posthog|statsig|googletagmanager/i];

async function capture(browser, url) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB" });
	const page = await context.newPage();
	const errors = [];
	page.on("console", (m) => { if (m.type() === "error" && !IGNORE_CONSOLE.some((r) => r.test(m.text()))) errors.push(m.text().slice(0, 300)); });
	page.on("pageerror", (e) => errors.push(`pageerror: ${String(e.message).slice(0, 300)}`));
	let status = 0;
	try {
		const response = await page.goto(url, { waitUntil: "load", timeout: 60_000 });
		status = response?.status() ?? 0;
		await page.waitForTimeout(4_000);
	} catch (error) {
		errors.push(`goto: ${error.message.slice(0, 200)}`);
	}
	const data = await page.evaluate(() => ({
		title: document.title,
		text: document.body?.innerText ?? "",
		hiddenSegments: document.querySelectorAll('div[hidden][id^="S:"]').length,
	})).catch(() => ({ title: "", text: "", hiddenSegments: 0 }));
	await context.close();
	const lines = data.text.split("\n").map((l) => l.trim()).filter((l) => l.length > 2);
	return { status, title: data.title, lines, errorScreen: ERROR_SCREEN.test(data.text), errors };
}

const browser = await chromium.launch();
const results = [];
for (const path of paths) {
	const [ref, next] = [await capture(browser, refBase + path), await capture(browser, newBase + path)];
	const refSet = new Set(ref.lines);
	const nextSet = new Set(next.lines);
	const shared = [...refSet].filter((l) => nextSet.has(l)).length;
	const coverage = refSet.size ? shared / refSet.size : 1;
	const row = {
		path,
		status: `${ref.status}/${next.status}`,
		titleMatch: ref.title === next.title,
		textCoverage: Math.round(coverage * 100),
		errorScreen: next.errorScreen,
		errors: next.errors.slice(0, 3),
		missing: [...refSet].filter((l) => !nextSet.has(l)).slice(0, 6),
		refTitle: ref.title,
		newTitle: next.title,
	};
	results.push(row);
	const flag = row.status.split("/")[0] !== row.status.split("/")[1] || row.errorScreen || row.errors.length || row.textCoverage < 90 ? "!!" : "ok";
	console.log(`${flag} ${path.padEnd(52)} ${row.status.padEnd(8)} text ${String(row.textCoverage).padStart(3)}% title ${row.titleMatch ? "=" : "≠"} ${row.errorScreen ? "ERROR-SCREEN " : ""}${row.errors.length ? `errors:${row.errors.length}` : ""}`);
}
await browser.close();
if (outFile) fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
const bad = results.filter((r) => r.status.split("/")[0] !== r.status.split("/")[1] || r.errorScreen || r.errors.length || r.textCoverage < 90);
console.log(`\n${results.length - bad.length}/${results.length} pages at parity`);
