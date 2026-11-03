// The operator end to end in the real app: the palette opens it, a Phaseo agent (played by a loopback gateway) lists and
// runs app commands and subscribes to a worker chat, the worker finishing wakes it with one event message, and the kill
// switch pauses it. No provider is called. Screenshots go to output/playwright/operator, or --shots=<folder>.
import assert from "node:assert/strict";
import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { orchestrationTools } from "./fixtures/orchestration-tools.mjs";
import { javascriptLiteral } from "./javascript-literal.mjs";

const profile = mkdtempSync(path.join(tmpdir(), "phaseo-operator-smoke-")); app.setPath("userData", profile);
const shots = path.resolve(process.argv.find(value => value.startsWith("--shots="))?.slice(8) ?? "../../output/playwright/operator"); mkdirSync(shots, { recursive: true });
const worker = { id: "" }, seen = { operatorRequests: 0, workerRequests: 0, eventWakes: 0, toolsOffered: [] };
let fixtureError;
/** What the agent does next, by how far into the script it is; each tool output is checked before the next call. */
const operatorScript = [
	{ expect: input => last(input, "user").includes("Watch the worker"), call: () => ["list_app_commands", { query: "inbox" }] },
	{ expect: input => output(input).includes("inbox.open") && !output(input).includes("operator.resume"), call: () => ["subscribe_events", { kinds: ["thread.completed"], threadIds: [worker.id], label: "worker" }] },
	{ expect: input => output(input).includes("\"subscriptions\":1"), call: () => ["run_app_command", { command: "inbox.open" }] },
	{ expect: input => output(input).includes("\"done\":true"), call: () => ["run_app_command", { command: "app.state" }] },
	{ expect: input => output(input).includes("\"page\":\"inbox\""), call: () => ["run_app_command", { command: "settings.list", args: { query: "theme" } }] },
	{ expect: input => output(input).includes("colourTheme") && output(input).includes("\"kept\":\"device\""), call: () => ["run_app_command", { command: "settings.set", args: { key: "theme", value: "light" } }] },
	{ expect: input => output(input).includes("\"value\":\"light\""), call: () => ["run_app_command", { command: "settings.set", args: { key: "autopilot", value: true } }] },
	{ expect: input => output(input).includes("\"value\":true"), call: () => ["run_app_command", { command: "settings.set", args: { key: "notifications", value: "all" } }] },
	{ expect: input => output(input).includes("\"value\":\"all\""), call: () => ["run_app_command", { command: "config.set", args: { area: "mcp", value: { connection: { name: "Docs", transport: "http", url: "https://docs.example.com/mcp", secretHeaders: ["Authorization"] }, headers: { Authorization: "Bearer smoke-secret" } } } }] },
	// The operator's own turn is running, so the change waits for it to end.
	{ expect: input => output(input).includes("when this chat") && !output(input).includes("smoke-secret"), call: () => ["run_app_command", { command: "operator.resume" }] },
	{ expect: input => output(input).includes("for the person only"), text: "Watching the worker." },
	// Woken by the worker finishing.
	{ expect: input => { const text = last(input, "user"); return text.includes("Workspace events from your subscriptions (1)") && text.includes(`thread ${worker.id}`); }, wake: true, call: () => ["run_app_command", { command: "chat.open", args: { threadId: worker.id } }] },
	{ expect: input => output(input).includes("\"done\":true"), call: () => ["run_app_command", { command: "toast.show", args: { title: "The worker finished", tone: "success" } }] },
	{ expect: () => true, text: "Opened the worker for you." },
];
const last = (input, role) => { const message = input.findLast(item => item.role === role); return typeof message?.content === "string" ? message.content : (message?.content ?? []).map(part => part.text ?? "").join("\n"); };
const output = input => String(input.findLast(item => item.type === "function_call_output")?.output ?? "");
const server = createServer(async (request, response) => {
	try {
		let raw = ""; for await (const chunk of request) raw += chunk;
		if (new URL(request.url, "http://fixture.local").pathname.replace(/\/$/, "") === "/v1/models") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ data: [{ id: "fixture-agent" }] })); return; }
		assert.equal(request.url, "/v1/responses");
		const body = JSON.parse(raw), tools = body.tools.map(tool => (tool.function ?? tool).name);
		for (const tool of tools) if (!["update_plan", "read_plan", "ask_user", "list_skills", "load_skill", "load_tools", ...orchestrationTools].includes(tool) && !seen.toolsOffered.includes(tool)) seen.toolsOffered.push(tool);
		let item;
		if (tools.includes("subscribe_events")) {
			const step = operatorScript[seen.operatorRequests++];
			assert.ok(step, "The operator made more requests than the script has");
			assert.ok(step.expect(body.input), `Operator step ${seen.operatorRequests} saw something unexpected: ${output(body.input).slice(0, 300) || last(body.input, "user").slice(0, 300)}`);
			if (step.wake) seen.eventWakes++;
			const call = step.call?.();
			item = call ? { type: "function_call", id: `item-${seen.operatorRequests}`, call_id: `call-${seen.operatorRequests}`, name: call[0], arguments: JSON.stringify(call[1]) } : { type: "message", role: "assistant", content: [{ type: "output_text", text: step.text }] };
		} else {
			// Ordinary chats get the app command tools but never the operator's.
			assert.ok(tools.includes("run_app_command") && !tools.includes("subscribe_events"));
			seen.workerRequests++;
			item = { type: "message", role: "assistant", content: [{ type: "output_text", text: "Worker done." }] };
		}
		response.setHeader("content-type", "text/event-stream");
		response.end("data: " + JSON.stringify({ type: "response.completed", response: { id: `response-${Date.now()}`, model: body.model, status: "completed", output: [item] } }) + "\n\n");
	} catch (error) { fixtureError ??= error; console.error(error); response.statusCode = 500; response.end("Fixture failure"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
const deadline = setTimeout(() => { console.error("Operator smoke expired", JSON.stringify(seen)); server.close(); app.exit(1); }, 120000);
await import("../dist/main/index.mjs");
app.whenReady().then(async () => {
	try {
		const owner = BrowserWindow.getAllWindows()[0]; owner.webContents.setBackgroundThrottling(false);
		if (owner.webContents.isLoading()) await new Promise(resolve => owner.webContents.once("did-finish-load", resolve));
		const run = code => owner.webContents.executeJavaScript(code);
		const wait = async (code, what) => { for (let index = 0; index < 600; index++) { if (fixtureError) throw fixtureError; const value = await run(code); if (value) return value; await new Promise(resolve => setTimeout(resolve, 25)); } throw Error("Did not settle: " + what); };
		const shot = async name => { await new Promise(resolve => setTimeout(resolve, 300)); writeFileSync(path.join(shots, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
		const task = id => `window.phaseoDesktop.workspace.task(${javascriptLiteral(id)})`;
		const accountId = await run(`(async()=>{const state=await window.phaseoDesktop.workspace.command({type:'add-account',name:'Operator fixture',kind:'api',harness:'phaseo',endpoint:${javascriptLiteral(endpoint)},apiKey:'fixture-unused'});return state.accounts.find(account=>account.name==='Operator fixture').id})()`);
		worker.id = await run(`(async()=>{const api=window.phaseoDesktop.workspace,before=new Set((await api.overview()).tasks.map(task=>task.id));const state=await api.command({type:'create-task',harness:'phaseo',accountId:${javascriptLiteral(accountId)},model:'fixture-agent',mode:'code',permissionMode:'full-access'});return state.tasks.find(task=>!before.has(task.id)).id})()`);
		await run(`window.phaseoDesktop.workspace.command({type:'update-task',id:${javascriptLiteral(worker.id)},title:'Worker'})`);

		// The palette's Operator entry, picked as a person would: Ctrl+K, then the item.
		owner.webContents.focus();
		owner.webContents.sendInputEvent({ type: "keyDown", keyCode: "K", modifiers: ["control"] }); owner.webContents.sendInputEvent({ type: "keyUp", keyCode: "K", modifiers: ["control"] });
		await wait(`Boolean(Array.from(document.querySelectorAll('[cmdk-item]')).find(item=>item.textContent.trim()==='Operator'))`, "palette open with Operator");
		await shot("1-palette");
		await run(`Array.from(document.querySelectorAll('[cmdk-item]')).find(item=>item.textContent.trim()==='Operator').click()`);
		const operatorId = await wait(`(async()=>(await window.phaseoDesktop.workspace.overview()).tasks.find(task=>task.operator)?.id)()`, "operator created");
		await wait(`Boolean(document.querySelector('[role=note]')?.textContent.includes('No subscriptions yet'))`, "operator callout");
		const created = await run(task(operatorId));
		assert.deepEqual({ title: created.title, pinned: created.pinned, mode: created.mode, permissionMode: created.permissionMode, projectId: created.projectId ?? null, harness: created.harness }, { title: "Operator", pinned: true, mode: "code", permissionMode: "full-access", projectId: null, harness: "phaseo" });
		await shot("2-operator-new");

		await run(`window.phaseoDesktop.workspace.command({type:'send',id:${javascriptLiteral(operatorId)},text:'Watch the worker and tell me when it is done.'})`);
		await wait(`(async()=>{const value=await ${task(operatorId)};if(value.status==='failed')throw Error(value.error);return value.status==='completed'&&value.messages.some(message=>message.role==='assistant'&&message.text.includes('Watching the worker'))})()`, "operator first turn");
		const state = await run(task(operatorId));
		assert.equal(state.operator.subscriptions.length, 1);
		// settings.set changed the live window and the saved workspace; config.set added an MCP server.
		assert.equal(await run(`document.documentElement.classList.contains("dark")`), false);
		const preferences = (await run("window.phaseoDesktop.workspace.preferences()")).preferences;
		assert.deepEqual({ notifications: preferences.notifications, autopilot: preferences.autopilot }, { notifications: "all", autopilot: true });
		await wait(`(async()=>(await window.phaseoDesktop.workspace.overview()).mcpConnections.some(connection=>connection.name==="Docs"))()`, "the waiting MCP change saved once the turn ended");
		assert.deepEqual((await run("window.phaseoDesktop.workspace.overview()")).mcpConnections.filter(connection => !connection.orchestration).map(({ name, enabled, secretHeaders }) => ({ name, enabled, secretHeaders })), [{ name: "Docs", enabled: true, secretHeaders: ["Authorization"] }]);
		// run_app_command really moved the window to the Inbox.
		// The agent read app.state back as page "inbox" (script step 5), so the window really moved.
		await shot("3-operator-ran-inbox");

		await run(`window.phaseoDesktop.workspace.command({type:'send',id:${javascriptLiteral(worker.id)},text:'Do the work.'})`);
		await wait(`(async()=>{const value=await ${task(operatorId)};if(value.status==='failed')throw Error(value.error);return value.messages.some(message=>message.role==='assistant'&&message.text.includes('Opened the worker'))&&value.status==='completed'})()`, "operator woken by the worker's event");
		const woken = await run(task(operatorId));
		const notices = woken.messages.filter(message => message.notice?.kind === "event");
		assert.equal(notices.length, 1, "one event message for the burst");
		assert.match(notices[0].notice.summary, /Worker: finished/);
		// chat.open from the agent opened the worker in the window.
		await wait(`document.querySelector('main')?.textContent.includes('Worker done.')`, "worker open in the window");
		await wait(`document.body.textContent.includes('The worker finished')`, "the agent's toast");
		await shot("4-worker-opened-by-operator");

		// The kill switch: pause from the palette entry, as a person.
		await run(`(async()=>{await window.phaseoDesktop.appCommands.run('operator.open')})()`);
		await wait(`Boolean(document.querySelector('[role=note]')?.textContent.includes('Watching 1 subscription'))`, "operator callout with subscription");
		await shot("5-operator-watching");
		owner.webContents.sendInputEvent({ type: "keyDown", keyCode: "K", modifiers: ["control"] }); owner.webContents.sendInputEvent({ type: "keyUp", keyCode: "K", modifiers: ["control"] });
		await wait(`Boolean(Array.from(document.querySelectorAll('[cmdk-item]')).find(item=>item.textContent.trim()==='Pause the operator'))`, "pause entry");
		await run(`Array.from(document.querySelectorAll('[cmdk-item]')).find(item=>item.textContent.trim()==='Pause the operator').click()`);
		await wait(`Boolean(document.querySelector('[role=status]')?.textContent.includes('Operator paused'))`, "paused callout");
		assert.equal((await run(task(operatorId))).operator.paused.reason, "person");
		await shot("6-operator-paused");
		await run(`Array.from(document.querySelectorAll('[role=status] button')).find(button=>button.textContent==='Resume').click()`);
		await wait(`(async()=>!(await ${task(operatorId)}).operator.paused)()`, "resumed from the callout");

		if (fixtureError) throw fixtureError;
		assert.equal(seen.operatorRequests, operatorScript.length);
		console.log("OPERATOR_SMOKE", JSON.stringify({ ...seen, workerId: undefined, shots }));
		clearTimeout(deadline); server.close(); app.exit(0);
	} catch (error) { console.error("OPERATOR_SMOKE_FAILED", error, JSON.stringify(seen)); clearTimeout(deadline); server.close(); app.exit(1); }
});
