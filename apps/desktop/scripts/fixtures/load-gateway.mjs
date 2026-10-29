// A stand-in Phaseo gateway for load tests, run as its own process so its work is not counted against the app's.
// It streams long replies on /v1/chat/completions (Chat) and /v1/responses (Code) and reports how many are open.
// node scripts/fixtures/load-gateway.mjs [--port=8787] [--seconds=40] [--rate=25] [--faults=429,503,drop,ok]   (rate: pieces per second)
// faults are used one per model request, in order, then every request succeeds:
//   429 / 500 / 503   an error response with Retry-After: 0
//   drop-early        the connection closes before any text
//   drop              the connection closes partway through the answer
//   stall-early       the response starts, then sends nothing
//   error             a gateway error event partway through the answer
//   ok                a normal answer
import { createServer } from "node:http";

const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const port = Number(argument("port", "8787")), seconds = Number(argument("seconds", "40")), rate = Number(argument("rate", "25"));
const faults = argument("faults", "").split(",").filter(Boolean);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const stats = { open: 0, peak: 0, started: 0, finished: 0, firstByteMs: [], faults: [] };
const words = "Streaming keeps the answer moving while the rest of the app stays responsive, so each piece arrives on time".split(" ");

async function stream(response, send, fault) {
	const started = Date.now(), pieces = Math.max(1, Math.round(seconds * rate));
	stats.open++; stats.started++; stats.peak = Math.max(stats.peak, stats.open);
	response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
	let text = "", closed = false;
	response.on("close", () => { closed = true; });
	if (fault === "drop-early") { response.destroy(); stats.open--; return; }
	if (fault === "stall-early") { await new Promise(resolve => response.on("close", resolve)); stats.open--; return; }
	for (let piece = 0; piece < pieces && !closed; piece++) {
		if (piece === Math.floor(pieces / 2) && fault === "drop") { response.destroy(); break; }
		if (piece === Math.floor(pieces / 2) && fault === "error") { send("error", "The upstream provider reset the connection."); response.end(); break; }
		const delta = `${words[piece % words.length]}${piece % 40 === 39 ? ".\n\n" : " "}`;
		text += delta; send("delta", delta);
		if (piece === 0) stats.firstByteMs.push(Date.now() - started);
		await sleep(1000 / rate);
	}
	if (!closed && !["drop", "error"].includes(fault)) { send("done", text); response.end(); }
	stats.open--; stats.finished++;
}

createServer((request, response) => {
	if (request.method === "GET" && request.url?.startsWith("/stats")) { response.end(JSON.stringify(stats)); return; }
	if (request.method === "GET" && request.url?.startsWith("/v1/models")) {
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify({ object: "list", data: [{ id: "openai/gpt-6.1-sol", name: "GPT-6.1 Sol" }] })); return;
	}
	let body = "";
	request.on("data", chunk => { body += chunk; });
	request.on("end", () => {
		const fault = faults.shift() ?? "ok";
		if (request.method === "POST" && /\/(chat\/completions|responses)$/.test(request.url ?? "")) stats.faults.push(fault);
		if (/^\d{3}$/.test(fault)) {
			response.writeHead(Number(fault), { "content-type": "application/json", "retry-after": "0" });
			response.end(JSON.stringify({ error: { message: fault === "429" ? "Rate limit reached for this workspace." : "The upstream provider is unavailable." } })); return;
		}
		if (request.method === "POST" && request.url?.endsWith("/chat/completions")) {
			const write = packet => response.write(`data: ${JSON.stringify(packet)}\n\n`);
			void stream(response, (kind, value) => kind === "delta" ? write({ choices: [{ index: 0, delta: { content: value } }] }) : kind === "error" ? write({ error: { message: value } }) : (write({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }), write({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 1000 } }), response.write("data: [DONE]\n\n")), fault);
			return;
		}
		if (request.method === "POST" && request.url?.endsWith("/responses")) {
			const write = packet => response.write(`event: ${packet.type}\ndata: ${JSON.stringify(packet)}\n\n`);
			void stream(response, (kind, value) => kind === "delta" ? write({ type: "response.output_text.delta", delta: value }) : kind === "error" ? write({ type: "error", error: { message: value } })
				: write({ type: "response.completed", response: { id: `resp_${Date.now()}`, status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: value }] }], usage: { input_tokens: 100, output_tokens: 1000 } } }), fault);
			return;
		}
		response.writeHead(404).end();
	});
}).listen(port, "127.0.0.1", () => console.log(`load gateway on http://127.0.0.1:${port}/v1 (${seconds} s replies at ${rate} pieces/s${faults.length ? `, faults: ${faults.join(",")}` : ""})`));
