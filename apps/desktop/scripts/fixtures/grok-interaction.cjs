// Local JSON-RPC fixture: no authentication, network or inference.
const readline = require("node:readline");
let prompt;
let resumed = false; let selectedModel; let selectedEffort;
const models = currentModelId => ({ currentModelId, availableModels: [{ modelId: "grok-fixture-a", name: "Fixture A" }, { modelId: "grok-fixture-b", name: "Fixture B", _meta: { reasoningEffort: "high", reasoningEfforts: [{ id: "high", description: "High" }, { id: "low", description: "Low" }] } }] });
const emit = value => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...value }) + "\n");
readline.createInterface({ input: process.stdin }).on("line", line => {
	const message = JSON.parse(line);
	if (message.method === "initialize") emit({ id: message.id, result: { protocolVersion: message.params.protocolVersion, agentCapabilities: { loadSession: true }, _meta: { grokShell: true, modelState: models("grok-fixture-a") } } });
	else if (message.method === "session/new" || message.method === "session/load") { resumed = message.method === "session/load"; emit({ id: message.id, result: { sessionId: "grok-interaction", models: models("grok-fixture-b") } }); }
	else if (message.method === "session/set_model") { selectedModel = message.params.modelId; selectedEffort = message.params._meta?.reasoningEffort; emit({ id: message.id, result: {} }); }
	else if (message.method === "session/prompt") {
		prompt = message.id;
		if (resumed) {
			if (selectedModel === "grok-fixture-b" && selectedEffort === "low") emit({ id: prompt, result: { stopReason: "end_turn" } });
			else emit({ id: prompt, error: { code: -32603, message: "Native model/reasoning selection was not applied before prompting" } });
			return;
		}
		emit({ id: 1000, method: "_x.ai/ask_user_question", params: { sessionId: "grok-interaction", toolCallId: "question", mode: "plan", questions: [{ id: "__proto__", question: "Choose a proposal", options: [{ label: "A", description: "Review before implementation", preview: "Owned proposal preview" }] }] } });
	} else if (message.id === 1000 && !message.method) {
		if (message.result?.outcome !== "accepted" || message.result.answers?.["Choose a proposal"]?.[0] !== "A" || message.result.annotations?.["Choose a proposal"]?.preview !== "Owned proposal preview") emit({ id: prompt, error: { code: -32603, message: "Native answer or preview was lost" } });
		else emit({ id: 1001, method: "x.ai/exit_plan_mode", params: { sessionId: "grok-interaction", toolCallId: "plan", planContent: "Review the proposal and wait for implementation approval." } });
	} else if (message.id === 1001 && !message.method) {
		if (message.result?.outcome !== "abandoned") emit({ id: prompt, error: { code: -32603, message: "Plan mode authorized implementation" } });
		else emit({ id: prompt, result: { stopReason: "end_turn" } });
	}
});
