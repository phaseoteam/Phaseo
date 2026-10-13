// Render the desktop app with an owned fixture workspace and save screenshots.
// Usage: pnpm run build && electron scripts/ui-preview.mjs [--out=dir] [--theme=dark|light] [--states=a,b]
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const out = path.resolve(argument("out", "output/ui-preview"));
const theme = argument("theme", "dark");
const only = argument("states", "")?.split(",").filter(Boolean);
process.on("unhandledRejection", reason => { console.error("Unhandled preview rejection", reason); app.exit(1); });

const profile = mkdtempSync(path.join(tmpdir(), "phaseo-ui-preview-"));
app.setPath("userData", profile);
mkdirSync(path.join(profile, "workspace"), { recursive: true });
mkdirSync(out, { recursive: true });

const now = Date.now();
const at = minutes => new Date(now - minutes * 60_000).toISOString();
const db = new DatabaseSync(path.join(profile, "workspace", "workspace.sqlite"));
db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE accounts (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
for (const [id, name, branch] of [["phaseo", "phaseo", "main"], ["blog", "blog", "draft/october"]]) {
	const directory = path.join(profile, "projects", id);
	mkdirSync(path.join(directory, "src"), { recursive: true });
	writeFileSync(path.join(directory, "README.md"), `# ${name}\n`);
	writeFileSync(path.join(directory, "src", "usage.ts"), "export const usage = 1;\n");
	execFileSync("git", ["init", "-b", branch], { cwd: directory, stdio: "ignore" });
	execFileSync("git", ["add", "."], { cwd: directory, stdio: "ignore" });
	execFileSync("git", ["-c", "user.name=Preview", "-c", "user.email=preview@example.com", "commit", "-m", "Initial commit"], { cwd: directory, stdio: "ignore" });
	// Leave uncommitted work so the changes panel has something to show.
	writeFileSync(path.join(directory, "src", "usage.ts"), "export const usage = 1;\nexport const byGrant = (clientId: string, userId: string) => ({ clientId, userId });\n");
	writeFileSync(path.join(directory, "src", "usage.test.ts"), "import { byGrant } from \"./usage\";\n");
	db.prepare("INSERT INTO projects VALUES (?, ?)").run(id, JSON.stringify({ id, name, directory, createdAt: at(10_000) }));
}
db.prepare("INSERT INTO accounts VALUES (?, ?)").run("phaseo-account", JSON.stringify({ id: "phaseo-account", name: "Phaseo", harness: "phaseo", kind: "api", endpoint: "https://api.phaseo.app/v1", configured: true }));

const task = (id, fields) => db.prepare("INSERT INTO tasks VALUES (?, ?)").run(id, JSON.stringify({ id, harness: "phaseo", accountId: "phaseo-account", model: "anthropic/claude-opus-5.5", mode: "chat", status: "completed", pinned: false, archived: false, queue: [], messages: [], activities: [], createdAt: at(fields.age ?? 5), updatedAt: at(fields.age ?? 5), ...fields }));
const user = (id, text, age, seconds = 41) => ({ id, role: "user", text, createdAt: at(age), startedAt: at(age), completedAt: new Date(Date.parse(at(age)) + seconds * 1000).toISOString() });
const reply = (id, text, age) => ({ id, role: "assistant", text, createdAt: at(age) });

task("usage-fix", {
	title: "Fix usage undercount after re-sign-in", projectId: "phaseo", mode: "code", status: "waiting", age: 1,
	messages: [
		user("u1", "Usage drops to zero after I sign in again each week. Can you scope the desktop usage query by the OAuth grant instead of the current key?", 3),
		reply("a1", "The route filtered on `key_id`, so each weekly re-sign-in started a new key and hid earlier requests. It now filters on the OAuth client and user, which covers every key the grant has issued.\n\n```ts\nconst rows = await supabase\n  .from(\"gateway_requests\")\n  .select(USAGE_COLUMNS)\n  .eq(\"oauth_client_id\", identity.clientId)\n  .eq(\"oauth_user_id\", identity.userId);\n```\n\nI added a test with two rotated keys. Shall I run it?", 2),
	],
	activities: [
		{ id: "u1:r", type: "reasoning", title: "Reasoning", text: "The usage endpoint keys off the API key id. Delegated OAuth keys rotate weekly, so I should scope by grant.", timelineOrder: 1 },
		{ id: "u1:t1", type: "tool", title: "read_project_file", text: "apps/api/src/routes/desktop-usage.ts", status: "completed", timelineOrder: 2 },
		{ id: "u1:t2", type: "tool", title: "Search", text: "oauth_client_id · 9 results", status: "completed", timelineOrder: 3 },
		{ id: "u1:t3", type: "tool", title: "write_project_file", text: "apps/api/src/routes/desktop-usage.ts (+14 −6)", status: "completed", timelineOrder: 4 },
		{ id: "u1:t4", type: "tool", title: "write_project_file", text: "apps/api/src/routes/desktop-usage.test.ts (+4 −1)", status: "completed", timelineOrder: 5 },
		{ id: "u1:usage", type: "usage", title: "Usage", text: JSON.stringify({ input_tokens: 2410, output_tokens: 712 }) },
	],
	approvals: [{ id: "approval-1", method: "run_project_command", description: "pnpm --filter @phaseo/gateway-api exec vitest run src/routes/desktop-usage.test.ts" }],
});
task("revoke", { title: "Revoke key on sign-out", projectId: "phaseo", mode: "code", status: "running", age: 4 });
task("ci", { title: "Desktop CI workflow", projectId: "phaseo", mode: "code", age: 70 });
task("icymi", { title: "ICYMI October outline", projectId: "blog", mode: "code", age: 2900 });
task("pricing", {
	title: "Compare Opus 5.5 and GPT-6 pricing", age: 30,
	messages: [user("p1", "What does a 10k-token prompt with a 2k-token answer cost on Claude Opus 5.5 compared with GPT-6?", 32, 6), reply("p2", "On Phaseo list prices:\n\n| Model | Input | Output | Total |\n| --- | --- | --- | --- |\n| Claude Opus 5.5 | $0.050 | $0.050 | **$0.100** |\n| GPT-6 | $0.030 | $0.024 | **$0.054** |\n\nGPT-6 is about 46% cheaper for this shape of request. Opus 5.5 tends to need fewer retries on long, multi-step work, so the gap narrows on agentic tasks.", 31)],
	activities: [{ id: "p1:usage", type: "usage", title: "Usage", text: JSON.stringify({ input_tokens: 61, output_tokens: 188 }) }],
});
task("pricing-gpt", {
	title: "Compare Opus 5.5 and GPT-6 pricing", model: "openai/gpt-6", age: 30,
	messages: [user("g1", "What does a 10k-token prompt with a 2k-token answer cost on Claude Opus 5.5 compared with GPT-6?", 32, 4), reply("g2", "Using current Phaseo prices:\n\n- **Claude Opus 5.5:** 10k × $5/M + 2k × $25/M = **$0.10**\n- **GPT-6:** 10k × $3/M + 2k × $12/M = **$0.054**\n\nSo GPT-6 costs a little over half as much for this request.", 31)],
});
task("pricing-gemini", {
	title: "Compare Opus 5.5 and GPT-6 pricing", model: "google/gemini-3.5-pro", age: 30,
	messages: [user("m1", "What does a 10k-token prompt with a 2k-token answer cost on Claude Opus 5.5 compared with GPT-6?", 32, 3), reply("m2", "| | Claude Opus 5.5 | GPT-6 |\n| --- | --- | --- |\n| 10k input | $0.050 | $0.030 |\n| 2k output | $0.050 | $0.024 |\n| **Total** | **$0.100** | **$0.054** |\n\nGPT-6 is roughly 46% cheaper here.", 31)],
});
task("rfc", { title: "Summarise the rate limit RFC", age: 95, pinned: true });
task("notes", { title: "Draft release notes for SDK 3.1", model: "openai/gpt-6", age: 60 * 26 });
task("french", { title: "Translate onboarding email to French", model: "google/gemini-3.5-flash", age: 60 * 50 });
task("pgvector", { title: "Explain pgvector index options", age: 60 * 24 * 4 });
task("offsite", { title: "Plan a Lisbon offsite agenda", model: "openai/gpt-6", age: 60 * 24 * 12 });
db.close();

const models = [
	["anthropic/claude-opus-5.5", "Claude Opus 5.5", "anthropic", "Anthropic", 6],
	["meta/muse-wonder-1.0", "Muse Wonder", "meta", "Meta", 1],
	["openai/gpt-6", "GPT-6", "openai", "OpenAI", 20],
	["anthropic/claude-sonnet-5.5", "Claude Sonnet 5.5", "anthropic", "Anthropic", 34],
	["google/gemini-3.5-pro", "Gemini 3.5 Pro", "google", "Google", 40],
	["google/gemini-3.5-flash", "Gemini 3.5 Flash", "google", "Google", 40],
	["openai/gpt-6-mini", "GPT-6 mini", "openai", "OpenAI", 52],
	["deepseek/deepseek-v4.1", "DeepSeek V4.1", "deepseek", "DeepSeek", 70],
	["deepseek/deepseek-v4.1:free", "DeepSeek V4.1", "deepseek", "DeepSeek", 70],
	["qwen/qwen-3.8-max", "Qwen 3.8 Max", "qwen", "Qwen", 9],
].map(([id, name, organisationId, organisationName, days]) => ({ id, name, organisationId, organisationName, releaseDate: new Date(now - days * 86_400_000).toISOString().slice(0, 10), reasoningEfforts: [{ id: "low", description: "Low" }, { id: "medium", description: "Medium" }, { id: "high", description: "High" }], defaultReasoningEffort: "medium" }));

await import("../dist/main/index.mjs");
const replace = (channel, handler) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); };

app.whenReady().then(async () => {
	nativeTheme.themeSource = theme;
	replace("workspace:models", () => models);
	replace("workspace:installations", () => []);
	let window;
	for (let attempt = 0; attempt < 200 && !(window = BrowserWindow.getAllWindows()[0]); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
	if (!window) throw new Error("The desktop window did not open.");
	window.setContentSize(1440, 900);
	if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
	const run = code => window.webContents.executeJavaScript(code, true);
	const settle = (ms = 900) => new Promise(resolve => setTimeout(resolve, ms));
	const states = {
		"chat-home": { storage: { "phaseo.desktop.workspaceMode": "chat" } },
		"chat-thread": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.selectedTask": "pricing" } },
		"code-thread": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.selectedTask": "usage-fix", "phaseo.desktop.rightPanel": "changes" } },
		"code-home": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.newChatProject": "phaseo" } },
		"work-log": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.selectedTask": "usage-fix" }, script: `[...document.querySelectorAll('main button[aria-expanded]')].find(button => /Worked/.test(button.textContent))?.click()` },
		"model-picker": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.favouriteModels": ["phaseo:anthropic/claude-opus-5.5", "phaseo:openai/gpt-6"] }, script: `document.querySelector('[aria-label="Choose model"]').click()` },
		"model-search": { storage: { "phaseo.desktop.workspaceMode": "chat" }, script: `(async () => { document.querySelector('[aria-label="Choose model"]').click(); await new Promise(r => setTimeout(r, 400)); const input = document.querySelector('[cmdk-input]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, 'gem'); input.dispatchEvent(new Event('input', { bubbles: true })); })()` },
		"model-compare": { storage: { "phaseo.desktop.workspaceMode": "chat" }, script: `(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('[aria-label="Choose model"]').click(); await wait(500); for (const name of ['GPT-6', 'Gemini 3.5 Pro']) { const item = [...document.querySelectorAll('[cmdk-item]')].find(node => node.textContent.trim().endsWith(name)); item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ctrlKey: true })); item.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); await wait(250); } document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()` },
		"code-files": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.selectedTask": "usage-fix", "phaseo.desktop.rightPanel": "changes", "phaseo.desktop.filesTab": "files" } },
		"compare-hover": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.compareGroups": [{ id: "compare-1", title: "What does a 10k-token prompt with a 2k-token answer cost?", taskIds: ["pricing", "pricing-gpt", "pricing-gemini"], createdAt: at(30) }] }, hover: "aside [data-slot=tooltip-trigger]:nth-child(2)" },
		"compare": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.selectedCompare": "compare-1", "phaseo.desktop.compareGroups": [{ id: "compare-1", title: "What does a 10k-token prompt with a 2k-token answer cost?", taskIds: ["pricing", "pricing-gpt", "pricing-gemini"], createdAt: at(30) }] } },
		"settings": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.selectedTask": "pricing" }, script: `document.querySelector('[aria-label="Settings"]').click()` },
		"palette": { storage: { "phaseo.desktop.workspaceMode": "chat" }, script: `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))` },
	};
	for (const [name, state] of Object.entries(states)) {
		if (only.length && !only.includes(name)) continue;
		await run(`localStorage.clear(); ${Object.entries(state.storage).map(([key, value]) => `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(value))});`).join(" ")}`);
		window.webContents.reload();
		await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
		await settle(1400);
		if (state.script) { await run(state.script); await settle(); }
		if (state.hover) {
			const point = await run(`(() => { const r = document.querySelector(${JSON.stringify(state.hover)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
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
