// Isolated fallback runner for hosts where playwright-cli's daemon cannot start.
const { createRequire } = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium } = createRequire(require.resolve("@playwright/test"))("playwright");
require("./realtime-audio-smoke.cjs");
(async () => {
	const browser = await chromium.launch({ channel: "msedge", headless: true });
	try {
		const page = await browser.newPage();
		const code = fs.readFileSync(path.resolve(__dirname, "../output/playwright/realtime-audio-smoke.js"), "utf8");
		await vm.runInNewContext(`(${code})`, { console })(page);
	} finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
