// Runs the real room component/UI with synthetic microphone audio and mocked APIs.
// No authentication, actual session creation, OpenAI traffic or billing writes.
const { createRequire } = require("node:module");
const path = require("node:path");
const fs = require("node:fs/promises");
const assert = require("node:assert/strict");
const { chromium } = createRequire(require.resolve("@playwright/test"))("playwright");
const esbuild = createRequire(require.resolve("wrangler"))("esbuild");
const appRoot = path.resolve(__dirname, "..");

async function bundleRoom() {
	const stubs = {
		"@/components/ui/sidebar": "const toggleSidebar=()=>{};export const useSidebar=()=>({toggleSidebar,state:'expanded'});",
		"@/lib/web-api/client": "export const fetchChatWebApi=(path,init)=>fetch(path,init);",
		"@/components/Logo": "export const Logo=()=>null;",
		"next/dynamic": "export default ()=>()=>null;",
	};
	const result = await esbuild.build({
		absWorkingDir: appRoot, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
		define: { "process.env.NODE_ENV": '"development"' },
		stdin: { resolveDir: appRoot, loader: "tsx", contents: `import {createRoot} from 'react-dom/client';
import {RealtimeRoom} from './src/components/(chat)/rooms/RealtimeRoom';
import {TooltipProvider} from './src/components/ui/tooltip';
createRoot(document.getElementById('root')).render(<TooltipProvider><RealtimeRoom models={[]}/></TooltipProvider>);` },
		plugins: [{ name: "offline-boundaries", setup(build) {
			build.onResolve({ filter: /^(next\/dynamic|@\/)/ }, args => stubs[args.path] ? { path: args.path, namespace: "offline" } : undefined);
			build.onLoad({ filter: /.*/, namespace: "offline" }, args => ({ contents: stubs[args.path], loader: "js" }));
		} }],
	});
	return result.outputFiles[0].text;
}

async function exercise(browser, bundle, css, mode) {
	const page = await browser.newPage();
	const errors = []; const unexpected = [];
	const counters = { created: 0, frames: 0, closed: 0, disconnected: 0, preflightAtCreation: false };
	page.on("pageerror", error => errors.push(error.message));
	await page.addInitScript(({ mode }) => {
		window.testAudioContexts = []; window.testOutputEnded = 0;
		const NativeAudioContext = window.AudioContext;
		window.AudioContext = class extends NativeAudioContext {
			constructor(options) {
				super(options); window.testAudioContexts.push(this);
				if (mode === "blocked") {
					Object.defineProperty(this, "state", { get: () => "suspended" });
					this.resume = () => new Promise(() => {});
				}
			}
			createBufferSource() {
				const source = super.createBufferSource();
				source.addEventListener("ended", () => window.testOutputEnded++);
				return source;
			}
		};
		Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
			if (mode === "denied") throw new DOMException("Microphone access denied", "NotAllowedError");
			const context = new NativeAudioContext({ sampleRate: 24_000 });
			const destination = context.createMediaStreamDestination();
			const oscillator = context.createOscillator(); const gain = context.createGain();
			gain.gain.value = 0.2; oscillator.connect(gain); gain.connect(destination); oscillator.start(); await context.resume();
			window.testMicrophone = { context, oscillator, stream: destination.stream };
			return destination.stream;
		} });
	}, { mode });
	await page.route("**/*", async route => {
		const url = new URL(route.request().url());
		if (url.pathname === "/offline-room") return route.fulfill({ contentType: "text/html", body: '<link rel="stylesheet" href="/offline-room.css"><style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style><div id="root"></div><script src="/offline-room.js"></script>' });
		if (url.pathname === "/offline-room.css") return route.fulfill({ contentType: "text/css", body: css });
		if (url.pathname === "/offline-room.js") return route.fulfill({ contentType: "application/javascript", body: bundle });
		if (url.pathname === "/api/chat/live/session" && route.request().method() === "POST") {
			counters.created++;
			counters.preflightAtCreation = await page.getByText("Audio preflight passed", { exact: true }).count() > 0;
			return route.fulfill({ json: { session_id: "rt_offline", provider: "openai", model: "gpt-live-1", voice: "marin", connect: { transport: "websocket", url: "ws://localhost:3101/offline/relay" } } });
		}
		if (url.pathname === "/api/chat/live/session/rt_offline" && route.request().method() === "GET") return route.fulfill({ json: {
			session_id: "rt_offline", status: counters.closed ? "completed" : "connected", reserved_nanos: 0,
			captured_nanos: 0, released_nanos: 0, estimated_cost_nanos: 0, final_cost_nanos: counters.closed ? 0 : null,
			currency: "USD", pricing_lines: [], usage: { input_tokens: 12000, output_tokens: 3000,
				live_responses: Array.from({ length: 30 }, (_, index) => ({ id: `resp_offline_${index}_${"x".repeat(60)}`, status: "response.completed", service_tier: "default", usage: { input_tokens: 400, output_tokens: 100 } })) },
		} });
		unexpected.push(`${route.request().method()} ${url}`); return route.abort();
	});
	await page.routeWebSocket("**/*", socket => {
		assert.equal(socket.url(), "ws://localhost:3101/offline/relay");
		socket.onClose(() => { counters.disconnected++; });
		socket.send(JSON.stringify({ type: "relay.connected", provider: "openai" }));
		socket.send(JSON.stringify({ type: "session.started", session: { id: "offline_provider" } }));
		socket.onMessage(raw => {
			const message = JSON.parse(String(raw));
			if (message.type === "client.close") {
				counters.closed++;
				socket.send(JSON.stringify({ type: "session.closed", usage: { seconds: 0 } })); return;
			}
			assert.equal(message.type, "client.audio"); assert.ok(message.rms > 0);
			if (++counters.frames === 1) {
				socket.send(JSON.stringify({ type: "session.input_transcript.delta", delta: "Offline microphone input." }));
				socket.send(JSON.stringify({ type: "session.output_transcript.delta", delta: "Offline response received." }));
				socket.send(JSON.stringify({ type: "session.output_audio.delta", delta: message.audio }));
			}
		});
	});
	try {
		await page.goto("http://localhost:3101/offline-room");
		await page.getByText("Choose a realtime model", { exact: true }).waitFor();
		console.log((await page.locator("main").ariaSnapshot()).slice(0, 900));
		await page.getByRole("button", { name: /OpenAI GPT Live 1/ }).click();
		if (mode === "working") {
			await page.getByRole("button", { name: "Delegation settings", exact: true }).click();
			const settings = page.getByRole("region", { name: "Realtime settings content", exact: true });
			await settings.waitFor();
			for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 480 }]) {
				await page.setViewportSize(viewport);
				const layout = await settings.evaluate(node => {
					node.scrollTop = node.scrollHeight;
					return { slot: node.dataset.slot, scrolls: node.scrollTop > 0, bounds: node.closest('[role="dialog"]').getBoundingClientRect().toJSON() };
				});
				assert.equal(layout.slot, "scroll-area-viewport");
				assert.ok(layout.scrolls, "Delegation settings must scroll inside ShadCN Scroll Area");
				assert.ok(layout.bounds.top >= 0 && layout.bounds.bottom <= viewport.height, "Settings must fit the viewport");
				console.log(JSON.stringify({ settingsViewport: viewport, layout, passed: true }));
			}
			await page.keyboard.press("Escape");
			await page.setViewportSize({ width: 1280, height: 720 });
		}
		await page.getByRole("button", { name: "Start realtime session" }).click();
		if (mode === "working" || mode === "stalled") {
			await page.getByText("Offline response received.", { exact: true }).waitFor();
			await page.waitForFunction(() => window.testOutputEnded > 0);
			await page.getByText("Microphone signal detected", { exact: true }).waitFor();
			assert.ok(counters.preflightAtCreation, "The room must preflight audio before creating a session");
			if (mode === "stalled") {
				await page.evaluate(() => window.testAudioContexts[0].suspend());
				await page.getByText(/Audio capture stopped/).first().waitFor();
			} else await page.getByRole("button", { name: "Stop session", exact: true }).click();
			await page.getByRole("button", { name: "Start realtime session" }).waitFor();
			assert.equal(counters.created, 1);
			assert.equal(counters.closed, mode === "working" ? 1 : 0);
			assert.equal(counters.disconnected, 1);
			assert.ok(await page.evaluate(() => window.testAudioContexts.every(context => context.state === "closed")));
			if (mode === "working") {
				const toggle = page.getByRole("button", { name: "Delegation usage", exact: true });
				await toggle.waitFor();
				await toggle.click();
				const details = page.getByRole("region", { name: "Delegation usage details", exact: true });
				await details.waitFor();
				for (const viewport of [{ width: 1280, height: 720 }, { width: 1280, height: 500 }, { width: 390, height: 844 }]) {
					await page.setViewportSize(viewport);
					const sizes = await page.evaluate(() => {
						const overview = document.querySelector('[aria-label="Session overview"]');
						const details = document.querySelector('[aria-label="Delegation usage details"]');
						const button = [...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Start realtime session');
						details.scrollTop = details.scrollHeight;
						overview.scrollTop = overview.scrollHeight;
						return { height: details.clientHeight, scrolls: details.scrollTop > 0, overviewScrolls: overview.scrollTop > 0,
							button: button.getBoundingClientRect().toJSON(), pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight };
					});
					assert.ok(sizes.height <= 256 && sizes.scrolls, 'Delegation details must have a bounded, scrollable body');
					assert.ok(sizes.overviewScrolls, 'The overview must scroll when the expanded content does not fit');
					assert.ok(sizes.button.y >= 0 && sizes.button.bottom <= viewport.height, 'Call controls must stay inside the viewport');
					assert.ok(sizes.pageWidth <= viewport.width && sizes.pageHeight <= viewport.height, 'The room must not expand the page');
					console.log(JSON.stringify({ viewport, layout: sizes, passed: true }));
				}
				await toggle.focus(); await page.keyboard.press("Enter");
				assert.equal(await toggle.getAttribute("aria-expanded"), "false");
				await page.keyboard.press("Space");
				assert.equal(await toggle.getAttribute("aria-expanded"), "true");
				await page.setViewportSize({ width: 1280, height: 720 });
				await page.getByRole("region", { name: "Session overview", exact: true }).evaluate(node => { node.scrollTop = 240; });
				await fs.mkdir(path.join(appRoot, "output/playwright"), { recursive: true });
				await page.screenshot({ path: path.join(appRoot, "output/playwright/realtime-usage.png") });
			}
		} else {
			await page.getByText(mode === "denied" ? /Microphone permission is blocked/ : /Audio could not start/).first().waitFor();
			assert.equal(counters.created, 0); assert.equal(counters.frames, 0);
		}
		assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
		console.log(JSON.stringify({ mode, ...counters, errors, unexpected, passed: true }));
	} catch (error) {
		console.error((await page.locator("body").ariaSnapshot()).slice(-7000), { errors, unexpected, counters });
		throw error;
	} finally {
		await page.evaluate(async () => { window.testMicrophone?.oscillator.stop(); await window.testMicrophone?.context.close(); });
		await page.close();
	}
}

(async () => {
	const bundle = await bundleRoom();
	const cssFile = path.join(appRoot, "src/app/globals.css");
	const { css } = await require("postcss")([require("@tailwindcss/postcss")()]).process(await fs.readFile(cssFile, "utf8"), { from: cssFile });
	const browser = await chromium.launch({ channel: "msedge", headless: true });
	try { for (const mode of ["working", "denied", "blocked", "stalled"]) await exercise(browser, bundle, css, mode); }
	finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
