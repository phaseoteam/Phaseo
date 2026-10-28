// Captures the built app with demo data, in both themes, without leaving anything running.
// Usage: electron scripts/screenshot.mjs [outDir]
import { app } from "electron";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.PHASEO_FACTORY_CAPTURE = "1";
process.env.PHASEO_FACTORY_DEMO = "1";
process.env.PHASEO_FACTORY_USER_DATA = mkdtempSync(path.join(os.tmpdir(), "phaseo-factory-shots-"));

const outDir = path.resolve(process.argv.find((arg, index) => index > 1 && !arg.startsWith("-") && !arg.endsWith(".mjs")) ?? "screenshots");
mkdirSync(outDir, { recursive: true });

const SHOTS = [
	{ name: "work-item", hash: "#/work/phaseo-app/phaseo/3131" },
	{ name: "work-runs", hash: "#/work/phaseo-app/phaseo/3131?tab=runs" },
	{ name: "work-pull", hash: "#/work/phaseo-app/phaseo/3128" },
	{ name: "work-reproduce", hash: "#/work/phaseo-app/phaseo/3122" },
	{ name: "work-new", hash: "#/work/phaseo-app/phaseo/3117" },
	{ name: "work-handoff", hash: "#/work/phaseo-app/phaseo/3126" },
	{ name: "work-proof", hash: "#/work/phaseo-app/phaseo/3133" },
	{ name: "work-proof-more", hash: "#/work/phaseo-app/phaseo/3133", scroll: 520 },
	{ name: "new-issue", hash: "#/new", fill: { "[aria-label=Title]": "Weekly token totals read 0 for decimal usage", textarea: ["The Usage page shows 0 tokens for this week. Usage values come back as decimal strings (\"1234.0\") and the weekly sum drops them.\n\nSteps: open /usage on a workspace with traffic this week.", "The Usage page shows this week's real token total\nA test covers decimal-string usage values"] }, dropImages: 2, scroll: 200 },
	{ name: "work-images", hash: "#/work/phaseo-app/phaseo/3117", scroll: 140 },
	{ name: "agents-repo", hash: "#/agents", scroll: 420 },
	{ name: "work-skills", hash: "#/work/phaseo-app/skills/14" },
	{ name: "playbooks-proof", hash: "#/playbooks", scroll: 560 },
	{ name: "playbooks-pull", hash: "#/playbooks?tab=pull", scroll: 560 },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** capturePage now and then never settles on a hidden window; repaint and try again. */
async function snap(window, attempts = 4) {
	for (let attempt = 1; ; attempt++) {
		const image = await Promise.race([window.webContents.capturePage(), wait(8_000).then(() => null)]);
		if (image) return image;
		if (attempt === attempts) throw new Error("capturePage kept stalling");
		window.webContents.invalidate();
		await wait(500);
	}
}

// No top-level await: Electron holds back "ready" until the entry module finishes evaluating.
async function capture() {
	const { startFactory, createWindow } = await import("../dist/main/index.mjs");
	await startFactory({ createMainWindow: false });
	const window = createWindow({ show: false, width: 1440, height: 900 });
	await new Promise((resolve) => window.webContents.once("did-finish-load", resolve));
	window.showInactive();
	await wait(800);

	for (const theme of ["dark", "light"]) {
		await window.webContents.executeJavaScript(`window.factory.updateSettings({ theme: ${JSON.stringify(theme)} })`);
		for (const shot of SHOTS) {
			await window.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(shot.hash)}`);
			await wait(900);
			if (shot.click) await window.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(shot.click)})?.click()`);
			if (shot.click) await wait(300);
			// Typed the way React sees it: through the native setter, then an input event.
			if (shot.fill) await window.webContents.executeJavaScript(`(() => {
				const fill = (el, value) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); };
				for (const [selector, values] of Object.entries(${JSON.stringify(shot.fill)})) [...document.querySelectorAll(selector)].forEach((el, index) => [values].flat()[index] !== undefined && fill(el, [values].flat()[index]));
			})()`);
			if (shot.fill) await wait(200);
			// Drawn screenshots dropped on the image field, the way a person would drag them in.
			if (shot.dropImages) await window.webContents.executeJavaScript(`(async () => {
				const transfer = new DataTransfer();
				for (let index = 0; index < ${shot.dropImages}; index++) {
					const canvas = Object.assign(document.createElement("canvas"), { width: 1280, height: 800 });
					const context = canvas.getContext("2d");
					context.fillStyle = "#ffffff"; context.fillRect(0, 0, 1280, 800);
					context.fillStyle = "#f4f4f5"; context.fillRect(0, 0, 1280, 56);
					context.fillStyle = "#09090b"; context.font = "bold 44px sans-serif"; context.fillText(index ? "Daily usage" : "Usage · This week", 60, 150);
					context.strokeStyle = "#dc2626"; context.lineWidth = 6; context.strokeRect(50, 200, 260, 120);
					context.font = "bold 72px sans-serif"; context.fillText("0", 80, 290);
					const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
					transfer.items.add(new File([blob], "screenshot-" + (index + 1) + ".png", { type: "image/png" }));
				}
				const zone = [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Add images")).parentElement;
				zone.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
			})()`);
			if (shot.dropImages) await wait(400);
			if (shot.scroll) await window.webContents.executeJavaScript(`[...document.querySelectorAll("[data-slot=scroll-area-viewport]")].at(-1).scrollTop = ${shot.scroll}`);
			// Wait for two frames so the capture shows this route, not the last one.
			await window.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
			window.webContents.invalidate();
			await wait(300);
			const image = await snap(window);
			const file = path.join(outDir, `${shot.name}-${theme}.png`);
			writeFileSync(file, image.toPNG());
			console.log(file);
		}
	}
}

capture().then(() => app.exit(0), (error) => {
	console.error(error);
	app.exit(1);
});
