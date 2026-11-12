// The fixture workspace behind ui-preview and the performance suite: two git projects, sample chats, a month of
// usage, and with `stress` a year of history plus very long chats. Chats are saved through the app's own store.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openFixtureStore, storeFixtureTasks } from "./workspaceFixture.mjs";

/** Chat ids are UUIDs, as the app creates them, so the seeded chats can be @-mentioned like real ones. */
export const demoId = name => createHash("sha256").update(`phaseo-demo:${name}`).digest("hex").replace(/^(.{8})(.{4}).(.{3}).(.{3})(.{12}).*$/, "$1-$2-4$3-8$4-$5");

/** Stores the fixture account's key the way the app does on Windows (DPAPI with the app's entropy). */
export function writeDemoCredential(profile) {
	if (process.platform !== "win32") return;
	const protect = "$b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); Add-Type -AssemblyName System.Security; $e=[Text.Encoding]::UTF8.GetBytes('Phaseo desktop credentials v1'); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$e,'CurrentUser')))";
	const sealed = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", protect], { input: Buffer.from("demo").toString("base64") }).toString().trim();
	mkdirSync(path.join(profile, "workspace", "credentials"), { recursive: true });
	writeFileSync(path.join(profile, "workspace", "credentials", "phaseo-account.credential"), Buffer.concat([Buffer.from("phaseo-dpapi-v1\0"), Buffer.from(sealed, "base64")]));
}

/** The fixture model list, released relative to `now`, for windows that don't read the live catalog. */
export function fixtureModels(now = Date.now()) {
	return [
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
}

/**
 * Seeds `<profile>/workspace/workspace.sqlite`. Options: `demo` (chats talk to the stand-in gateway on `gatewayPort`),
 * `gateway` (another gateway URL), `repo` (a real checkout as a project), `stress` (chats of history to add),
 * `transcripts` ({ claude, codex } folders), `now` (the clock the fixtures are dated from).
 */
export async function seedPreviewWorkspace(profile, options = {}) {
	const demo = Boolean(options.demo), now = options.now ?? Date.now();
	mkdirSync(path.join(profile, "workspace"), { recursive: true });
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
	const repo = options.repo ?? "";
	if (demo && repo) db.prepare("INSERT INTO projects VALUES (?, ?)").run("repository", JSON.stringify({ id: "repository", name: path.basename(path.resolve(repo)), directory: path.resolve(repo), createdAt: at(10_000) }));
	db.prepare("INSERT INTO accounts VALUES (?, ?)").run("phaseo-account", JSON.stringify({ id: "phaseo-account", name: "Phaseo", harness: "phaseo", kind: "api", endpoint: (options.gateway ?? "") || (demo ? `http://127.0.0.1:${options.gatewayPort}/v1` : "https://api.phaseo.app/v1"), configured: true }));

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
	// Two chats in Autopilot (one still running, one handed back) and a failed run, for the Inbox.
	task("revoke", { title: "Revoke key on sign-out", projectId: "phaseo", mode: "code", status: "running", age: 4, permissionMode: "full-access", autopilot: { capNanos: 5_000_000_000, since: at(12) }, usageTotals: { tokens: 48_200, costNanos: 1_240_000_000 } });
	task("ci", { title: "Desktop CI workflow", projectId: "phaseo", mode: "code", age: 70, permissionMode: "full-access", usageTotals: { tokens: 91_400, costNanos: 2_870_000_000 },
		autopilot: { capNanos: null, since: at(95), handback: { reason: "blocked", summary: "The deploy step needs a Cloudflare API token with Workers edit access. Add it as CLOUDFLARE_API_TOKEN in the repository's secrets, then reply here.", at: at(70) } } });
	task("icymi", { title: "ICYMI October outline", projectId: "blog", mode: "code", status: "failed", error: "The model provider stopped responding.", age: 2900 });
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
	const stress = options.stress ?? 0;
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
		// Code chats from the last two days, which auto-settle has not shelved yet: a busy Code sidebar of 300 active rows.
		for (let index = 0; index < 300; index++) {
			const age = 5 + index * 9, topic = topics[index % topics.length], turns = 3 + index % 6;
			task(`stress-active-code-${index}`, { title: `${verbs[index % verbs.length]} ${topic} (agent ${index + 1})`, mode: "code", projectId: index % 2 ? "phaseo" : "blog", model: models[index % models.length], age,
				...conversation(`ac${index}`, turns, n => age + (turns - n), topic, true) });
		}
		db.exec("COMMIT");
		const size = db.prepare("SELECT count(*) AS chats, sum(length(data)) AS bytes FROM tasks").get();
		console.log(`Stress history: ${size.chats} chats, ${(size.bytes / 1024 / 1024).toFixed(1)} MB, seeded in ${Math.round(performance.now() - started)} ms.`);
	}
	db.close();
	await storeFixtureTasks(path.join(profile, "workspace", "workspace.sqlite"));
	// What Autopilot decided in the two Autopilot chats, oldest first, for the Inbox's log.
	const fixtureStore = await openFixtureStore(path.join(profile, "workspace", "workspace.sqlite"));
	try {
		for (const [name, title, text, minutes] of [
			["ci", "Autopilot approved the plan", "The plan adds a desktop build job with a pnpm cache, which covers the task.", 92],
			["ci", "Autopilot: keep going", "Run the workflow with act and fix anything that fails.\nThe workflow was written but never run.", 82],
			["ci", "Autopilot needs you", "The deploy step needs a Cloudflare API token with Workers edit access. Add it as CLOUDFLARE_API_TOKEN in the repository's secrets, then reply here.", 70],
			["revoke", "Autopilot answered", "Scope: Revoke every key the grant issued\nSigning out should end every session the grant opened.", 9],
			["revoke", "Autopilot: keep going", "Add a test that signs out with two active keys.\nThe revoke path has no test yet.", 5],
		]) fixtureStore.recordAutopilotDecision(demoId(name), title, text, at(minutes));
		// --claude-transcripts <folder> and --codex-transcripts <folder> add transcript folders, as Settings' Usage sources would.
		const transcripts = ["claude", "codex"].flatMap(harness => { const directory = options.transcripts?.[harness] ?? ""; return directory ? [{ harness, directory }] : []; });
		if (transcripts.length) fixtureStore.saveAddedTranscriptFolders(transcripts);
		// A month of usage for the Usage page: Phaseo's charged requests, and Claude Code and Codex turns priced at API rates,
		// in working hours on each earlier day and today up to now, a little ahead of the usual.
		const spenders = [["usage-fix", "anthropic/claude-opus-5.5", "phaseo", false], ["revoke", "anthropic/claude-opus-5.5", "phaseo", true], ["ci", "anthropic/claude-opus-5.5", "phaseo", true], ["pricing", "anthropic/claude-opus-5.5", undefined, false], ["notes", "openai/gpt-6", undefined, false], ["french", "google/gemini-3.5-flash", undefined, false]];
		const harnessTurns = [["usage-fix", "claude", "claude-opus-5-5", "phaseo"], ["ci", "claude", "claude-sonnet-5-5", "phaseo"], ["revoke", "codex", "gpt-6.1", "phaseo"]];
		const today = new Date(now); today.setHours(0, 0, 0, 0);
		let seed = 7;
		const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
		for (let daysAgo = 29; daysAgo >= 0; daysAgo--) for (let hour = 9; hour <= 18; hour++) {
			const time = new Date(today); time.setDate(time.getDate() - daysAgo); time.setHours(hour, 10 + Math.floor(random() * 40));
			const weekend = [0, 6].includes(time.getDay());
			if (time.getTime() > now || (weekend && hour > 12)) continue;
			const [name, model, projectId, autopilot] = spenders[Math.floor(random() * (daysAgo ? spenders.length : 4))];
			const nanos = Math.round((daysAgo ? 120_000_000 : 175_000_000) * (0.4 + random())), prompt = Math.round(nanos / 1100);
			fixtureStore.recordUsage({ id: demoId(name), model, projectId }, `ledger-${daysAgo}-${hour}:usage:0`, JSON.stringify({ prompt_tokens: prompt, completion_tokens: Math.round(prompt / 12), prompt_tokens_details: { cached_tokens: Math.round(prompt * 0.6) }, completion_tokens_details: { reasoning_tokens: Math.round(prompt / 40) }, pricing: { total_nanos: nanos } }), autopilot, time.toISOString());
			// The demo reads real Claude Code and Codex history from their transcripts instead.
			if (demo || weekend || random() < 0.35) continue;
			const [turn, harness, harnessModel, harnessProject] = harnessTurns[Math.floor(random() * harnessTurns.length)], size = 0.5 + random();
			fixtureStore.recordHarnessUsage({ id: demoId(turn), harness, model: "default", projectId: harnessProject }, { key: `${harness}:demo-${daysAgo}-${hour}`, model: harnessModel, input: Math.round(2_000 * size), cached: Math.round(900_000 * size), cacheWrite: Math.round(40_000 * size), output: Math.round(16_000 * size), reasoning: Math.round(4_000 * size) }, false, time.toISOString());
		}
	} finally { fixtureStore.close(); }
}
