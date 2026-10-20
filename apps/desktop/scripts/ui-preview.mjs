// Render the desktop app with an owned fixture workspace and save screenshots.
// Usage: pnpm run build && electron scripts/ui-preview.mjs [--out=dir] [--theme=dark|light] [--states=a,b]
// With --demo the window stays open on the fixture workspace, chats stream canned
// replies from a local stand-in for the gateway, and DevTools listens on port 9333.
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { storeFixtureTasks } from "./fixtures/workspaceFixture.mjs";

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
	if (process.platform === "win32") {
		const protect = "$b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); Add-Type -AssemblyName System.Security; $e=[Text.Encoding]::UTF8.GetBytes('Phaseo desktop credentials v1'); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$e,'CurrentUser')))";
		const sealed = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", protect], { input: Buffer.from("demo").toString("base64") }).toString().trim();
		mkdirSync(path.join(profile, "workspace", "credentials"), { recursive: true });
		writeFileSync(path.join(profile, "workspace", "credentials", "phaseo-account.credential"), Buffer.concat([Buffer.from("phaseo-dpapi-v1\0"), Buffer.from(sealed, "base64")]));
	}
}

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
// --gateway=<url> points the Phaseo account at another gateway (scripts/fixtures/load-gateway.mjs for load tests).
// --repo <path> adds a real checkout, so the pull request pane reads real pull requests through the local GitHub CLI.
const repo = argument("repo", "");
if (demo && repo) db.prepare("INSERT INTO projects VALUES (?, ?)").run("repository", JSON.stringify({ id: "repository", name: path.basename(path.resolve(repo)), directory: path.resolve(repo), createdAt: at(10_000) }));
db.prepare("INSERT INTO accounts VALUES (?, ?)").run("phaseo-account", JSON.stringify({ id: "phaseo-account", name: "Phaseo", harness: "phaseo", kind: "api", endpoint: argument("gateway", "") || (demo ? `http://127.0.0.1:${gatewayPort}/v1` : "https://api.phaseo.app/v1"), configured: true }));

// Chat ids are UUIDs, as the app creates them, so the seeded chats can be @-mentioned like real ones.
const demoId = name => createHash("sha256").update(`phaseo-demo:${name}`).digest("hex").replace(/^(.{8})(.{4}).(.{3}).(.{3})(.{12}).*$/, "$1-$2-4$3-8$4-$5");
const task = (name, fields) => { const id = demoId(name); db.prepare("INSERT INTO tasks VALUES (?, ?)").run(id, JSON.stringify({ id, harness: "phaseo", accountId: "phaseo-account", model: "anthropic/claude-opus-5.5", mode: "chat", status: "completed", pinned: false, archived: false, queue: [], messages: [], activities: [], createdAt: at(fields.age ?? 5), updatedAt: at(fields.age ?? 5), ...fields })); };
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
		{ id: "u1:usage:0", type: "usage", title: "Usage", text: JSON.stringify({ input_tokens: 2410, output_tokens: 712, total_tokens: 3122, pricing_breakdown: { total_nanos: 29_850_000, currency: "USD" } }) },
	],
	approvals: [{ id: "approval-1", method: "run_project_command", description: "pnpm --filter @phaseo/gateway-api exec vitest run src/routes/desktop-usage.test.ts" }],
});
task("revoke", { title: "Revoke key on sign-out", projectId: "phaseo", mode: "code", status: "running", age: 4 });
task("ci", { title: "Desktop CI workflow", projectId: "phaseo", mode: "code", age: 70 });
task("icymi", { title: "ICYMI October outline", projectId: "blog", mode: "code", age: 2900 });
task("pricing", {
	title: "Compare Opus 5.5 and GPT-6 pricing", age: 30,
	messages: [user("p1", "What does a 10k-token prompt with a 2k-token answer cost on Claude Opus 5.5 compared with GPT-6?", 32, 6), reply("p2", "On Phaseo list prices:\n\n| Model | Input | Output | Total |\n| --- | --- | --- | --- |\n| Claude Opus 5.5 | $0.050 | $0.050 | **$0.100** |\n| GPT-6 | $0.030 | $0.024 | **$0.054** |\n\nGPT-6 is about 46% cheaper for this shape of request. Opus 5.5 tends to need fewer retries on long, multi-step work, so the gap narrows on agentic tasks.", 31)],
	activities: [{ id: "p1:usage:0", type: "usage", title: "Usage", text: JSON.stringify({ prompt_tokens: 61, completion_tokens: 188, total_tokens: 249, pricing: { total_nanos: 5_005_000, currency: "USD" } }) }],
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

// --stress[=chats] adds a year of history (default 2,000 chats, a tenth archived) and four very long chats, to check loading times.
const stress = process.argv.includes("--stress") ? 2000 : Number(argument("stress", "0"));
if (stress > 0) {
	const started = performance.now();
	const models = ["anthropic/claude-opus-5.5", "openai/gpt-6", "google/gemini-3.5-pro", "openai/gpt-6.1-sol", "google/gemini-3.5-flash"];
	const topics = ["rate limits", "the billing export", "pgvector indexes", "OAuth refresh", "the onboarding email", "SDK 3.1 release notes", "cache invalidation", "the docs search", "provider failover", "a Lisbon offsite", "Postgres vacuum", "the usage dashboard"];
	const verbs = ["Explain", "Draft", "Review", "Summarise", "Compare", "Plan", "Debug", "Rewrite"];
	const answer = (n, topic) => `Here is how ${topic} fits together (part ${n}).\n\n1. **Inputs** – what arrives and when.\n2. **Processing** – the work done on each request, with \`retry\` and \`backoff\` handled per provider.\n3. **Outputs** – what the caller sees.\n\n| Step | Cost | Notes |\n| --- | --- | --- |\n| Read | $0.002 | cached for 15 minutes |\n| Write | $0.010 | batched |\n\n\`\`\`ts\nexport async function handle(request: Request) {\n  const started = performance.now();\n  const result = await route(request, { attempt: ${n} });\n  return { result, elapsed: performance.now() - started };\n}\n\`\`\`\n\nThe main risk is that ${topic} drifts when the upstream schema changes, so keep a test that pins the shape.`;
	// One turn: a question and answer; Code turns also get reasoning, tool calls and usage between them.
	const turn = (prefix, n, age, topic, code) => {
		const order = n * 20, id = `${prefix}-u${n}`;
		const messages = [{ ...user(id, `${verbs[n % verbs.length]} ${topic}, step ${n}. Keep it short but include an example.`, age, 20 + n % 40), timelineOrder: order }, { ...reply(`${prefix}-a${n}`, answer(n, topic), age), timelineOrder: order + 19 }];
		const activities = code ? [{ id: `${id}:r`, type: "reasoning", title: "Reasoning", text: `Looking at how ${topic} is wired before changing anything.`, timelineOrder: order + 1 },
			...Array.from({ length: 8 }, (_, tool) => ({ id: `${id}:t${tool}`, type: "tool", title: ["read_project_file", "Search", "write_project_file", "run_project_command"][tool % 4], text: tool % 4 === 3 ? "pnpm vitest run src/usage.test.ts · 42 passed" : `src/module-${n}-${tool}.ts`, status: "completed", timelineOrder: order + 2 + tool })),
			{ id: `${id}:usage`, type: "usage", title: "Usage", text: JSON.stringify({ input_tokens: 4000 + n, output_tokens: 900 }) }] : [{ id: `${id}:usage`, type: "usage", title: "Usage", text: JSON.stringify({ input_tokens: 400 + n, output_tokens: 600 }) }];
		return { messages, activities };
	};
	const conversation = (prefix, turns, ageOf, topic, code) => {
		const messages = [], activities = [];
		for (let n = 1; n <= turns; n++) { const value = turn(prefix, n, ageOf(n), topic, code); messages.push(...value.messages); activities.push(...value.activities); }
		return { messages, activities };
	};
	db.exec("BEGIN");
	for (let index = 0; index < stress; index++) {
		const age = 60 + Math.floor(index * (60 * 24 * 365) / stress), topic = topics[index % topics.length], code = index % 3 === 0, turns = 3 + index % 25;
		task(`stress-${index}`, { title: `${verbs[index % verbs.length]} ${topic} #${index + 1}`, model: models[index % models.length], age, archived: index % 10 === 9, pinned: index < 3,
			...(code ? { mode: "code", projectId: index % 2 ? "phaseo" : "blog" } : {}), ...(index % 7 === 0 ? { tags: [topic.split(" ").at(-1)] } : {}),
			...conversation(`s${index}`, turns, n => age + (turns - n) * 2, topic, code) });
	}
	// The long ones: 2,000 turns of Chat; 600 Code turns with ten steps each; one answer of about 400 KB; 300 turns with a pasted file each.
	task("stress-long-chat", { title: "Stress: 2,000-turn chat", age: 2, ...conversation("long", 2000, n => 2 + (2000 - n) * 3, "rate limits", false) });
	task("stress-long-code", { title: "Stress: 600-turn Code session", mode: "code", projectId: "phaseo", age: 3, ...conversation("code", 600, n => 3 + (600 - n) * 4, "provider failover", true) });
	const huge = Array.from({ length: 900 }, (_, line) => `| ${line} | provider-${line % 17} | ${(line * 0.37).toFixed(2)} ms | ${line % 5 ? "ok" : "retry"} |`).join("\n");
	task("stress-huge-answer", { title: "Stress: one 400 KB answer", age: 4, messages: [user("huge-u", "Dump every routing decision from the last hour as a table, then the full handler source.", 5), reply("huge-a", `| # | Provider | Latency | Result |\n| --- | --- | --- | --- |\n${huge}\n\n\`\`\`ts\n${Array.from({ length: 4000 }, (_, line) => `export const route${line} = (request: Request) => handle(request, { attempt: ${line}, provider: "provider-${line % 17}" });`).join("\n")}\n\`\`\``, 4)] });
	const pasted = conversation("paste", 300, n => 6 + (300 - n) * 5, "the billing export", false);
	for (const message of pasted.messages) if (message.role === "user") message.text += `\n\n\`\`\`csv\n${Array.from({ length: 120 }, (_, row) => `${row},workspace-${row % 9},${(row * 1.7).toFixed(2)},USD`).join("\n")}\n\`\`\``;
	task("stress-pasted", { title: "Stress: 300 turns with pasted files", age: 6, ...pasted });
	db.exec("COMMIT");
	const size = db.prepare("SELECT count(*) AS chats, sum(length(data)) AS bytes FROM tasks").get();
	console.log(`Stress history: ${size.chats} chats, ${(size.bytes / 1024 / 1024).toFixed(1)} MB, seeded in ${Math.round(performance.now() - started)} ms.`);
}
db.close();
await storeFixtureTasks(path.join(profile, "workspace", "workspace.sqlite"));

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
].map(([id, name, organisationId, organisationName, days]) => ({ id, name, organisationId, organisationName, releaseDate: new Date(now - days * 86_400_000).toISOString().slice(0, 10), reasoningEfforts: [{ id: "low", description: "Low" }, { id: "medium", description: "Medium" }, { id: "high", description: "High" }], defaultReasoningEffort: "medium", options: [
	{ id: "effort", label: "Reasoning", type: "select", options: [{ id: "low", label: "Low" }, { id: "medium", label: "Medium", isDefault: true }, { id: "high", label: "High" }] },
	...["anthropic/claude-opus-5.5", "openai/gpt-6"].includes(id) ? [{ id: "speed", label: "Speed", type: "select", options: [{ id: "standard", label: "Standard", isDefault: true }, { id: "priority", label: "Fast" }] }] : [],
] }));

await import("../dist/main/index.mjs");
const replace = (channel, handler) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); };

app.whenReady().then(async () => {
	nativeTheme.themeSource = theme;
	if (!demo) { replace("workspace:models", () => models); replace("workspace:refresh-models", () => models); }
	// Screenshots hide local agents so they look the same on every machine; the demo uses real detection.
	if (!demo) replace("workspace:installations", () => []);
	let window;
	for (let attempt = 0; attempt < 200 && !(window = BrowserWindow.getAllWindows()[0]); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
	if (!window) throw new Error("The desktop window did not open.");
	window.setContentSize(1440, 900);
	if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
	const run = code => window.webContents.executeJavaScript(code, true);
	const settle = (ms = 900) => new Promise(resolve => setTimeout(resolve, ms));
	if (demo) {
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
		"model-compare": { storage: { "phaseo.desktop.workspaceMode": "chat" }, script: `(async () => { const wait = ms => new Promise(r => setTimeout(r, ms)); document.querySelector('[aria-label="Choose model"]').click(); await wait(500); for (const name of ['GPT-6', 'Gemini 3.5 Pro']) { const item = [...document.querySelectorAll('#model-picker-list [role=option]')].find(node => node.textContent.trim().endsWith(name)); item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, ctrlKey: true })); item.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); await wait(250); } document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()` },
		"code-files": { storage: { "phaseo.desktop.workspaceMode": "code", "phaseo.desktop.selectedTask": demoId("usage-fix"), "phaseo.desktop.rightPanel": "changes", "phaseo.desktop.filesTab": "files" } },
		"compare-hover": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.compareGroups": [{ id: "compare-1", title: "What does a 10k-token prompt with a 2k-token answer cost?", taskIds: ["pricing", "pricing-gpt", "pricing-gemini"].map(demoId), createdAt: at(30) }] }, hover: "aside [data-slot=tooltip-trigger]:nth-child(2)" },
		"compare": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.selectedCompare": "compare-1", "phaseo.desktop.compareGroups": [{ id: "compare-1", title: "What does a 10k-token prompt with a 2k-token answer cost?", taskIds: ["pricing", "pricing-gpt", "pricing-gemini"].map(demoId), createdAt: at(30) }] } },
		"settings": { storage: { "phaseo.desktop.workspaceMode": "chat", "phaseo.desktop.selectedTask": demoId("pricing") }, script: `document.querySelector('[aria-label="Settings"]').click()` },
		"settings-experimental": { storage: { "phaseo.desktop.workspaceMode": "code" }, script: `(async () => { document.querySelector('[aria-label="Settings"]').click(); await new Promise(r => setTimeout(r, 500)); [...document.querySelectorAll('nav[aria-label="Settings sections"] button')].find(button => button.textContent.trim() === 'Experimental')?.click(); })()` },
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
