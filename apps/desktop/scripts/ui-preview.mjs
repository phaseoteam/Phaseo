// Render the desktop app with an owned fixture workspace and save screenshots.
// Usage: pnpm run build && electron scripts/ui-preview.mjs [--out=dir] [--theme=dark|light] [--states=a,b]
// With --demo the window stays open on the fixture workspace, chats stream canned
// replies from a local stand-in for the gateway, and DevTools listens on port 9333.
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { demoId, fixtureModels, seedPreviewWorkspace, writeDemoCredential } from "./fixtures/previewWorkspace.mjs";
import { openFixtureStore } from "./fixtures/workspaceFixture.mjs";
import { javascriptLiteral } from "./javascript-literal.mjs";

const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = path.resolve(argument("out", "output/ui-preview"));
const theme = argument("theme", process.argv.includes("--demo") ? "system" : "dark");
const only = argument("states", "")?.split(",").filter(Boolean);
const demo = process.argv.includes("--demo");
process.on("unhandledRejection", reason => { console.error("Unhandled preview rejection", reason); app.exit(1); });
if (demo) app.commandLine.appendSwitch("remote-debugging-port", argument("port", "9333"));
// The demo is driven over DevTools while other windows cover it; keep it rendering so layout observers still run.
if (demo) app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");

const profile = mkdtempSync(path.join(tmpdir(), "phaseo-ui-preview-"));
app.setPath("userData", profile);
mkdirSync(path.join(profile, "workspace"), { recursive: true });
mkdirSync(out, { recursive: true });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const demoReply = (model, question) => {
	const name = model.split("/").at(-1).replace(/-/g, " ").replace(/\b([a-z])/g, letter => letter.toUpperCase()).replace(/\bGpt\b/g, "GPT");
	const opening = { openai: "Short version:", google: "Here's how I'd think about it.", anthropic: "Good question. Let me break it down." }[model.split("/")[0]] ?? "Here's an overview.";
	return `${opening} This is a **demo reply from ${name}**, streamed by a local stand-in for the Phaseo gateway, so no tokens were spent.\n\nYou asked: _${question.slice(0, 160)}_\n\n1. **Streaming** – text arrives word by word, just like a real model.\n2. **Markdown** – lists, \`inline code\` and code blocks render as they stream.\n3. **Compare** – send one message to several models and read the answers side by side.\n\n\`\`\`ts\nconst reply = await phaseo.chat({ model: "${model}", messages });\n\`\`\`\n\nAnything else you'd like to try?`;
};
// The demo serves the live public catalog in the /v1/models shape, like the gateway's parameter_details normalisation.
const parameterDetail = value => value == null ? { supported: true } : typeof value === "boolean" ? { supported: value } : Array.isArray(value) ? { supported: true, values: value.filter(entry => entry != null) } : typeof value === "object" ? { supported: true, ...Object.fromEntries(Object.entries(value).filter(([, entry]) => entry != null)) } : { supported: true, default: value };
const parameterDetails = params => Array.isArray(params)
	? Object.fromEntries(params.flatMap(entry => {
		if (typeof entry === "string") return [[entry, { supported: true }]];
		const { param_id, name, id, ...detail } = entry ?? {}; const key = param_id ?? name ?? id;
		return typeof key === "string" && key.trim() ? [[key.trim(), parameterDetail(detail)]] : [];
	}))
	: params && typeof params === "object" ? Object.fromEntries(Object.entries(params).filter(([name]) => name !== "request").map(([name, value]) => [name, parameterDetail(value)])) : {};
const nativeCatalog = payload => {
	const rows = (Array.isArray(payload?.models) ? payload.models : []).filter(row => typeof row?.modelId === "string" && row.isAvailable !== false && row.capabilities?.includes("text.generate"));
	const grouped = new Map();
	for (const row of rows) grouped.set(row.modelId, [...grouped.get(row.modelId) ?? [], row]);
	return [...grouped].map(([id, providers]) => {
		const offers = providers.map(row => {
			const parameter_details = parameterDetails(row.capabilityParamsById?.["text.generate"]);
			const meter = price => typeof price === "number" ? { provider_id: row.providerId, unit: "token", unit_size: 1_000_000, price_per_unit: String(price), currency: "USD" } : null;
			return { provider: { id: row.providerId, name: row.providerName ?? null }, routable: true, endpoints: ["text.generate"], capabilities: { parameters: Object.keys(parameter_details), parameter_details }, pricing: { pricing_plan: "standard", meters: { input_tokens: meter(row.inputPricePerMillion), output_tokens: meter(row.outputPricePerMillion) } } };
		});
		const [first] = providers, parameter_details = Object.assign({}, ...offers.map(offer => offer.capabilities.parameter_details));
		return { id, name: first.modelName || id, organization: first.organisationId ? { id: first.organisationId, name: first.organisationName ?? null } : null, lifecycle: { status: first.modelStatus === "deprecated" ? "deprecated" : "active", released_at: first.releaseDate?.slice(0, 10) ?? null }, ...(Array.isArray(first.inputModalities) ? { modalities: { input: first.inputModalities, output: first.outputModalities ?? ["text"] } } : {}), capabilities: { endpoints: ["text.generate"], parameters: Object.keys(parameter_details), parameter_details }, offers };
	}).sort((left, right) => (right.lifecycle.released_at ?? "").localeCompare(left.lifecycle.released_at ?? ""));
};
let liveCatalog;
const catalog = () => liveCatalog ??= fetch("https://phaseo.app/api/_web/gateway/models?available_only=true", { signal: AbortSignal.timeout(20_000) })
	.then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
	.then(payload => { const models = nativeCatalog(payload); if (!models.length) throw new Error("no text models"); console.log(`Serving ${models.length} live catalog models.`); return models; })
	// A failed fetch is retried on the next request rather than pinning the demo to the fixtures.
	.catch(error => { console.warn(`Live catalog unavailable (${error.message}); serving the fixture models.`); liveCatalog = undefined; return undefined; });
let gatewayPort = 0;
if (demo) {
	const server = createServer(async (request, response) => {
		if (request.method === "GET" && request.url?.startsWith("/v1/models")) {
			const live = await catalog();
			response.writeHead(200, { "Content-Type": "application/json" });
			if (!live) { response.end(JSON.stringify({ object: "list", data: models.map(model => ({ id: model.id, name: model.name, organization: { id: model.organisationId, name: model.organisationName }, lifecycle: { released_at: model.releaseDate } })) })); return; }
			const url = new URL(request.url, "http://127.0.0.1"), offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0), limit = Math.min(250, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "250", 10) || 250));
			response.end(JSON.stringify({ ok: true, offset, limit, total: live.length, models: live.slice(offset, offset + limit) }));
			return;
		}
		// Code chats on Phaseo stream through /responses: answer with the canned reply as Responses events.
		if (request.method === "POST" && request.url?.endsWith("/responses")) {
			let body = "";
			request.on("data", chunk => { body += chunk; });
			request.on("end", async () => {
				const { model, input } = JSON.parse(body);
				const textOf = content => typeof content === "string" ? content : Array.isArray(content) ? content.map(part => part?.text ?? "").join("") : "";
				const question = textOf((Array.isArray(input) ? [...input].reverse().find(item => item?.role === "user") : { content: input })?.content);
				const reply = demoReply(model, question || "your message");
				response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
				await sleep(500);
				const send = packet => response.write(`event: ${packet.type}\ndata: ${JSON.stringify(packet)}\n\n`);
				for (const piece of reply.match(/\S+\s*|\n+/g)) { send({ type: "response.output_text.delta", output_index: 0, content_index: 0, delta: piece }); await sleep(28); }
				const item = { type: "message", id: "msg_demo", role: "assistant", status: "completed", content: [{ type: "output_text", text: reply }] };
				send({ type: "response.output_item.done", output_index: 0, item });
				// Priced like the gateway, at $3/M input and $15/M output.
				const prompt = Math.ceil(body.length / 4), completion = Math.ceil(reply.length / 4);
				const usage = { input_tokens: prompt, output_tokens: completion, total_tokens: prompt + completion, pricing_breakdown: { total_nanos: prompt * 3000 + completion * 15000, currency: "USD" } };
				send({ type: "response.completed", response: { id: `resp_demo_${Date.now()}`, object: "response", model, status: "completed", output: [item], usage } });
				response.end();
			});
			return;
		}
		if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) { response.writeHead(404).end(); return; }
		let body = "";
		request.on("data", chunk => { body += chunk; });
		request.on("end", async () => {
			const { model, messages, tools, stream } = JSON.parse(body);
			const question = [...messages].reverse().find(message => message.role === "user")?.content;
			const last = messages.at(-1), lastText = typeof last?.content === "string" ? last.content : "";
			// Autopilot's model (one non-streamed call): answer with the first option, approve plans, and send one follow-up before calling a task done.
			if (stream === false && String(messages[0]?.content ?? "").startsWith("You are Autopilot")) {
				const ask = String(lastText), option = /"value": "([^"]*)"/.exec(ask)?.[1], id = /"id": "([^"]*)"/.exec(ask)?.[1];
				const verdict = ask.includes("The agent asks:") ? (id && option !== undefined ? { decision: "answer", answers: { [id]: [option] }, reason: "The first option fits the task." } : { decision: "escalate", reason: "Only you can answer this one." })
					: ask.includes("proposes this plan") ? { decision: "accept", reason: "The plan covers the task." }
					: ask.includes("asks to:") ? { decision: "accept", reason: "Needed for the task." }
					: ask.includes("finished a turn") ? (/has sent 0 follow-ups/.test(ask) ? { status: "continue", message: "Double-check the result, then summarise what changed.", reason: "Not verified yet." } : { status: "done", summary: "The demo task is done and checked." })
					: { decision: "escalate", reason: "This demo can't answer forms." };
				const usage = { prompt_tokens: Math.ceil(body.length / 4), completion_tokens: 40, total_tokens: Math.ceil(body.length / 4) + 40, pricing: { total_nanos: Math.ceil(body.length / 4) * 3000 + 40 * 15000, currency: "USD" } };
				await sleep(400);
				response.writeHead(200, { "Content-Type": "application/json" });
				response.end(JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(verdict) }, finish_reason: "stop" }], usage }));
				return;
			}
			// The title model's other non-streamed calls (chat titles, Write message): a short canned answer, so no tokens are spent.
			if (stream === false) {
				const asks = JSON.stringify(messages).toLowerCase();
				const content = asks.includes("commit message") ? "Tighten the October draft\n\nDemo message from the local stand-in gateway; no tokens were spent." : "Demo title";
				await sleep(400);
				response.writeHead(200, { "Content-Type": "application/json" });
				response.end(JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: { prompt_tokens: Math.ceil(body.length / 4), completion_tokens: 12, total_tokens: Math.ceil(body.length / 4) + 12 } }));
				return;
			}
			response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
			await sleep(500);
			const send = packet => response.write(`data: ${JSON.stringify(packet)}\n\n`);
			// Orchestration demo: asked for agents, the stand-in delegates two background tasks to its own model.
			if (last?.role === "user" && /\bagents?\b/i.test(lastText) && !lastText.startsWith("Delegated agent") && tools?.some(tool => tool.function?.name === "delegate_task")) {
				const tasks = [["Research pricing", "List three facts about how model gateways price tokens."], ["Draft summary", "Write a two-sentence summary of why teams use a model gateway."]];
				tasks.forEach(([title, prompt], index) => send({ choices: [{ index: 0, delta: { tool_calls: [{ index, id: `call_${index}`, type: "function", function: { name: "delegate_task", arguments: JSON.stringify({ requestId: `demo-${index}-${Date.now()}`, title, prompt, background: true, harness: "phaseo", model }) } }] } }] }));
				send({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }); response.write("data: [DONE]\n\n"); response.end(); return;
			}
			const reply = last?.role === "tool" ? "I've started two agents in the background, one researching pricing and one drafting a summary. I'll pull their results together when they report back."
				: lastText.startsWith("Delegated agent") ? `Both agents have reported back. Here's the combined picture:\n\n- **Pricing research** came back with three facts about token pricing.\n- **Summary draft** gave a two-sentence overview.\n\nWant me to merge them into one note?`
				: demoReply(model, typeof question === "string" ? question : "your message");
			for (const piece of reply.match(/\S+\s*|\n+/g)) {
				response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: piece } }] })}\n\n`);
				await sleep(28);
			}
			// Priced like the gateway: a usage frame after the finish, at $3/M input and $15/M output.
			const prompt = Math.ceil(body.length / 4), completion = Math.ceil(reply.length / 4);
			const usage = { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion, pricing: { total_nanos: prompt * 3000 + completion * 15000, currency: "USD" } };
			response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`);
			response.end();
		});
	});
	await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
	gatewayPort = server.address().port;
	// Store the fixture account's key the way the app does on Windows (DPAPI with the app's entropy).
	writeDemoCredential(profile);
}

const now = Date.now();
await seedPreviewWorkspace(profile, {
	demo, gatewayPort, gateway: argument("gateway", ""), repo: argument("repo", ""),
	// --stress[=chats] adds a year of history (default 2,000 chats, a tenth archived) and four very long chats, to check loading times.
	stress: process.argv.includes("--stress") ? 2000 : Number(argument("stress", "0")),
	// --claude-transcripts <folder> and --codex-transcripts <folder> add transcript folders, as Settings' Usage sources would.
	transcripts: { claude: argument("claude-transcripts", ""), codex: argument("codex-transcripts", "") },
	now,
});
const at = minutes => new Date(now - minutes * 60_000).toISOString();
const models = fixtureModels(now);

await import("../dist/main/index.mjs");
const replace = (channel, handler) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); };

app.whenReady().then(async () => {
	nativeTheme.themeSource = theme;
	if (!demo) { replace("workspace:models", () => models); replace("workspace:refresh-models", () => models); }
	// Screenshots hide local agents so they look the same on every machine; the demo uses real detection.
	if (!demo) { replace("workspace:installations", () => []); replace("workspace:connected-harnesses", () => []); }
	// Usage priced at sample catalogue rates and with sample pull request counts, so captures never call the gateway or GitHub.
	if (!demo) {
		const rates = { "claude-opus-5-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }, "claude-sonnet-5-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }, "gpt-6-1": { input: 2, output: 12, cacheRead: 0.2 } };
		const matchKey = id => id.toLowerCase().replace(/^[^/]+\//, "").replace(/-\d{8}$/, "").replace(/[._]/g, "-");
		let usageStore;
		replace("workspace:usage-report", async (_event, period) => {
			usageStore ??= await openFixtureStore(path.join(profile, "workspace", "workspace.sqlite"));
			const report = usageStore.usageReport(period, model => rates[matchKey(model)]);
			return { ...report, activity: { ...report.activity, pullRequests: { opened: period === "today" ? 3 : 11, merged: period === "today" ? 2 : 9 } } };
		});
	}
	let window;
	for (let attempt = 0; attempt < 200 && !(window = BrowserWindow.getAllWindows()[0]); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
	if (!window) throw new Error("The desktop window did not open.");
	window.setContentSize(1440, 900);
	if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
	const run = code => window.webContents.executeJavaScript(code, true);
	const settle = (ms = 900) => new Promise(resolve => setTimeout(resolve, ms));
	if (demo) {
		// The first page starts a limits check on load; once its quick writes land, clearing leaves nothing that says "just checked".
		await settle(2000);
		await run(`localStorage.clear(); localStorage.setItem("phaseo.desktop.workspaceMode", '"chat"');`);
		window.webContents.reload();
		window.webContents.setBackgroundThrottling(false);
		window.center(); window.show(); window.focus();
		console.log(`Demo running. Gateway stand-in on port ${gatewayPort}; DevTools on ${argument("port", "9333")}. Close the window to finish.`);
		return;
	}
	const states = {
		"chat-home": { storage: { "phaseo.desktop.workspaceMode": "chat" } },
		"chat-thread": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.selectedTask": demoId("pricing") } },
		"code-thread": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.selectedTask": demoId("usage-fix"), "phaseo.desktop.rightPanel": "changes" } },
		"code-home": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.newChatProject": "phaseo" } },
		"work-log": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.selectedTask": demoId("usage-fix") }, script: `[...document.querySelectorAll('main button[aria-expanded]')].find(button => /Worked/.test(button.textContent))?.click()` },
		"model-picker": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.favouriteModels": ["phaseo:anthropic/claude-opus-5.5", "phaseo:openai/gpt-6"] }, script: `document.querySelector('[aria-label="Choose model"]').click()` },
		"model-search": { storage: { "phaseo.desktop.workspaceMode": "chat" }, script: `(async () => { document.querySelector('[aria-label="Choose model"]').click(); await new Promise(r => setTimeout(r, 400)); const input = document.querySelector('[aria-label="Search models"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, 'gem'); input.dispatchEvent(new Event('input', { bubbles: true })); })()` },
		// Workspace rules hide models: the picker says how many, and a search for a hidden one says so.
		"model-access": { storage: { "phaseo.desktop.workspaceMode": "chat" }, access: { restricted: true, hiddenModelCount: 214, hiddenModels: [{ id: "deepseek/deepseek-v4", name: "DeepSeek V4" }, { id: "moonshotai/kimi-k3.1-pro", name: "Kimi K3.1 Pro" }], limitedModelCount: 18 }, script: `document.querySelector('[aria-label="Choose model"]').click()` },
		"model-access-search": { storage: { "phaseo.desktop.workspaceMode": "chat" }, access: { restricted: true, hiddenModelCount: 214, hiddenModels: [{ id: "deepseek/deepseek-v4", name: "DeepSeek V4" }], limitedModelCount: 0 }, script: `(async () => { document.querySelector('[aria-label="Choose model"]').click(); await new Promise(r => setTimeout(r, 400)); const input = document.querySelector('[aria-label="Search models"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, 'deepseek'); input.dispatchEvent(new Event('input', { bubbles: true })); })()` },
		"model-compare": { storage: { "phaseo.desktop.workspaceMode": "chat" }, script: `(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('[aria-label="Choose model"]').click(); await wait(500); for (const name of ['GPT-6', 'Gemini 3.5 Pro']) { const item = [...document.querySelectorAll('#model-picker-list [role=option]')].find(node => node.textContent.trim().endsWith(name)); item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ctrlKey: true })); item.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); await wait(250); } document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()` },
		"code-files": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.selectedTask": demoId("usage-fix"), "phaseo.desktop.rightPanel": "changes", "phaseo.desktop.filesTab": "files" } },
		"compare-hover": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.compareGroups": [{ id: "compare-1", title: "What does a 10k-token prompt with a 2k-token answer cost?", taskIds: ["pricing", "pricing-gpt", "pricing-gemini"].map(demoId), createdAt: at(30) }] }, hover: "aside [data-slot=tooltip-trigger]:nth-child(2)" },
		"compare": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.selectedCompare": "compare-1", "phaseo.desktop.compareGroups": [{ id: "compare-1", title: "What does a 10k-token prompt with a 2k-token answer cost?", taskIds: ["pricing", "pricing-gpt", "pricing-gemini"].map(demoId), createdAt: at(30) }] } },
		"settings": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.selectedTask": demoId("pricing") }, script: `document.querySelector('[aria-label="Settings"]').click()` },
		// The footer: the profile as an avatar with its menu open, beside Usage, Scheduled tasks and Settings.
		"profile-menu": { storage: { "phaseo.desktop.workspaceMode": "code" }, script: `(async () => { const b = document.querySelector('aside button[aria-label^="Profile"]'); const o = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true }; b.dispatchEvent(new PointerEvent("pointerdown", o)); b.dispatchEvent(new MouseEvent("mousedown", o)); b.dispatchEvent(new PointerEvent("pointerup", { ...o, buttons: 0 })); b.dispatchEvent(new MouseEvent("mouseup", { ...o, buttons: 0 })); b.dispatchEvent(new MouseEvent("click", { ...o, buttons: 0 })); })()` },
		"usage": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.usagePeriod": "today", "phaseo.desktop.usageView": "cost" }, script: `document.querySelector('aside button[aria-label="Usage"]')?.click()` },
		"usage-month": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.usagePeriod": "30d", "phaseo.desktop.usageView": "cost" }, script: `document.querySelector('aside button[aria-label="Usage"]')?.click()` },
		"usage-tokens": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.usagePeriod": "7d", "phaseo.desktop.usageView": "tokens" }, script: `document.querySelector('aside button[aria-label="Usage"]')?.click()` },
		"inbox": { storage: { "phaseo.desktop.workspaceMode": "code" }, script: `[...document.querySelectorAll('aside button')].find(button => button.textContent.startsWith('Inbox'))?.click()` },
		// Sample subscription limits, read as just checked so the rings don't start the real agents.
		"rings": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.usageLimits": { checkedAt: Date.now(),
			// Two more Claude accounts on a usage hub, so the weekly ring splits into one arc per account.
			hubs: [{ id: "hub-1", label: "Home hub", url: "http://127.0.0.1:8317", createdAt: new Date().toISOString() }],
			snapshots: { "hub-1": { hubId: "hub-1", checkedAt: new Date().toISOString(), skipped: 0, accounts: [
				{ id: "work.json", provider: "claude", email: "work@example.com", status: { checkedAt: new Date().toISOString(), authenticated: true, plan: "Claude Max", usage: [{ id: "claude", name: "Claude", primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 9000 }, secondary: { usedPercent: 60, windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 180000 }, spendControlReached: null }] } },
				{ id: "spare.json", provider: "claude", email: "spare@example.com", status: { checkedAt: new Date().toISOString(), authenticated: true, plan: "Claude Pro", usage: [{ id: "claude", name: "Claude", primary: { usedPercent: 70, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 4000 }, secondary: { usedPercent: 95, windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 50000 }, spendControlReached: null }] } },
			] } },
			statuses: {
			claude: { checkedAt: new Date().toISOString(), authenticated: true, plan: "Claude Max", identity: "you@example.com", usage: [{ id: "claude", name: "Claude", primary: { usedPercent: 38, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 8040 }, secondary: { usedPercent: 61, windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 266400 }, spendControlReached: null }] },
			codex: { checkedAt: new Date().toISOString(), authenticated: true, plan: "ChatGPT Pro", identity: "you@example.com", usage: [{ id: "codex", name: "Codex", primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 11200 }, secondary: { usedPercent: 93, windowDurationMins: 10080, resetsAt: Math.floor(Date.now() / 1000) + 97200 }, spendControlReached: null }] },
		} } }, script: `document.querySelector('[aria-label^="Usage limits"]')?.click()` },
		// Six plans across two providers: the row shows the three that matter and a count; the popover lists all six.
		"rings-many": (() => {
			const hours = hours => Math.floor(Date.now() / 1000) + hours * 3600;
			const claude = (id, plan, fiveHour, fable) => ({ id: `${id}.json`, provider: "claude", email: `${id}@example.com`, status: { checkedAt: new Date().toISOString(), authenticated: true, plan, usage: [{ id: "claude", name: "Claude", primary: { usedPercent: fiveHour, windowDurationMins: 300, resetsAt: hours(2) }, secondary: null, spendControlReached: null }, ...fable === undefined ? [] : [{ id: "claude:Fable", name: "Fable weekly", primary: { usedPercent: fable, windowDurationMins: 10080, resetsAt: hours(90) }, secondary: null, spendControlReached: null }]] } });
			const accounts = [claude("premium-1", "Team premium 5x", 20, 10), claude("premium-2", "Team premium 5x", 35, 30), claude("standard-1", "Team standard", 92), claude("standard-2", "Team standard", 80), claude("max", "Claude Max 20x", 15, 5), claude("pro", "Claude Pro", 40),
				{ id: "plus.json", provider: "codex", email: "plus@example.com", status: { checkedAt: new Date().toISOString(), authenticated: true, plan: "ChatGPT Plus", usage: [{ id: "codex", name: "Codex", primary: { usedPercent: 30, windowDurationMins: 300, resetsAt: hours(3) }, secondary: { usedPercent: 45, windowDurationMins: 10080, resetsAt: hours(100) }, spendControlReached: null }] } }];
			return { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.usageLimits": { checkedAt: Date.now(),
				hubs: [{ id: "hub-1", label: "Team hub", url: "http://127.0.0.1:8317", createdAt: new Date().toISOString() }],
				snapshots: { "hub-1": { hubId: "hub-1", checkedAt: new Date().toISOString(), skipped: 0, accounts } },
				statuses: { codex: { checkedAt: new Date().toISOString(), authenticated: true, plan: "ChatGPT Pro", identity: "you@example.com", usage: [{ id: "codex", name: "Codex", primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: hours(4) }, secondary: { usedPercent: 6, windowDurationMins: 10080, resetsAt: hours(140) }, spendControlReached: null }] } },
			} }, script: `(async () => { document.querySelector('[aria-label^="Usage limits"]')?.click(); await new Promise(r => setTimeout(r, 400)); document.querySelector('section[aria-label^="Claude Max 20x"] button[aria-expanded]')?.click(); })()` };
		})(),
		"settings-experimental": { storage: { "phaseo.desktop.workspaceMode": "code" }, script: `(async () => { document.querySelector('[aria-label="Settings"]').click(); await new Promise(r => setTimeout(r, 500)); [...document.querySelectorAll('nav[aria-label="Settings sections"] button')].find(button => button.textContent.trim() === 'Experimental')?.click(); })()` },
		"palette": { storage: { "phaseo.desktop.workspaceMode": "chat" }, script: `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))` },
	};
	// Usage's Limits view on the rings' sample limits, and the foot of the month view (what got done and where it went).
	states["usage-limits"] = { storage: { ...states.rings.storage, "phaseo.desktop.usageView": "limits" }, script: `(async () => { for (let tries = 0; tries < 20 && !document.querySelector('[data-usage-page]'); tries++) { document.querySelector('aside button[aria-label="Usage"]')?.click(); await new Promise(resolve => setTimeout(resolve, 250)); } await new Promise(resolve => setTimeout(resolve, 1500)); })()` };
	states["usage-foot"] = { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.usagePeriod": "30d", "phaseo.desktop.usageView": "cost" }, script: `(async () => { document.querySelector('aside button[aria-label="Usage"]')?.click(); await new Promise(resolve => setTimeout(resolve, 1200)); document.querySelector('[data-usage-page] [data-slot="scroll-area-viewport"]')?.scrollTo(0, 100000); })()` };
	// Captures never read real subscriptions: limits count as just checked with none found, so the rings stay idle.
	// The first page may already have started a check; one reload with this in place leaves nothing in flight.
	const noLimits = { "phaseo.desktop.usageLimits": { checkedAt: Date.now(), statuses: {}, hubs: [], snapshots: {} } };
	await run(`localStorage.setItem("phaseo.desktop.usageLimits", ${JSON.stringify(JSON.stringify(noLimits["phaseo.desktop.usageLimits"]))});`);
	window.webContents.reload();
	await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
	for (const [name, state] of Object.entries(states)) {
		if (only.length && !only.includes(name)) continue;
		// What workspace rules hide (from /v1/models/me), only in the states that show it.
		replace("workspace:model-access", () => state.access);
		await run(`localStorage.clear(); ${Object.entries({ ...noLimits, ...state.storage }).map(([key, value]) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))});`).join(" ")}`);
		window.webContents.reload();
		await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
		await settle(1400);
		if (state.script) { await run(state.script); await settle(); }
		if (state.hover) {
			const point = await run(`(() => { const r = document.querySelector(${javascriptLiteral(state.hover)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
			window.focus(); window.webContents.focus();
			window.webContents.sendInputEvent({ type: "mouseMove", x: point.x - 30, y: point.y });
			await settle(200);
			window.webContents.sendInputEvent({ type: "mouseMove", ...point });
			await settle(600);
		}
		if (state.inspect) console.log(name, await run(state.inspect));
		writeFileSync(path.join(out, `${name}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
		console.log("captured", name);
	}
	app.exit(0);
});
