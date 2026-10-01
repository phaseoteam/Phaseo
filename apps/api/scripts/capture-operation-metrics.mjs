// Staging-only bounded tail. Never emit raw event/request headers or payloads.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { operationMetricsSummary } from "./operation-metrics-summary.mjs";
const require = createRequire(import.meta.url);
const wrangler = join(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
const child = spawn(process.execPath, [wrangler, "tail", "phaseo-gateway-staging", "--format", "json", "--search", "gateway_operations"],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
let buffer = "", depth = 0, quoted = false, escaped = false, events = 0, envelopes = 0, stderrBytes = 0;
function emit(raw) {
    let event;
    try { event = JSON.parse(raw); } catch { return; }
    envelopes++;
    for (const log of event.logs ?? []) {
        const message = log.message;
        if (!Array.isArray(message) || message[0] !== "gateway_operations") continue;
        let record = message[1];
        if (typeof record === "string") { try { record = JSON.parse(record); } catch { continue; } }
        const summary = operationMetricsSummary(record);
        if (!summary) continue;
        console.log(JSON.stringify(summary));
        events++;
    }
}
child.stdout.setEncoding("utf8");
child.stdout.on("data", chunk => {
    for (const char of chunk) {
        if (depth === 0) { if (char !== "{") continue; buffer = ""; quoted = false; escaped = false; }
        buffer += char;
        if (buffer.length > 1_048_576) { console.error("Tail event exceeded safety limit"); child.kill(); return; }
        if (quoted) {
            if (escaped) escaped = false;
            else if (char === "\\") escaped = true;
            else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === "{") depth++;
        else if (char === "}") { depth--; if (depth === 0) emit(buffer); }
    }
});
// Wrangler status is not a request log. Deliberately suppress raw stderr anyway.
child.stderr.on("data", chunk => { stderrBytes += chunk.length; });
const timeout = setTimeout(() => child.kill(), 120_000);
child.on("error", () => { console.error("Unable to start staging metrics tail"); process.exitCode = 1; });
child.on("close", code => { clearTimeout(timeout); console.log(JSON.stringify({ event: "metrics_tail_finished", samples: events, envelopes, stderrBytes, exitCode: code })); });
console.log(JSON.stringify({ event: "metrics_tail_started", maximumSeconds: 120 }));
