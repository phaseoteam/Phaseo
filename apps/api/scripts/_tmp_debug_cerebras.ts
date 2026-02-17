import { config as dotenvConfig } from "dotenv";
import fs from "node:fs";
import { resolveGatewayApiKeyFromEnv } from "../tests/helpers/gatewayKey";

for (const p of [".dev.vars", ".env.local", ".env"]) {
  if (fs.existsSync(p)) dotenvConfig({ path: p, override: false });
}

async function main() {
  const base = (process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1").replace(/\/$/, "");
  const key = resolveGatewayApiKeyFromEnv(process.env);
  if (!key) {
    console.error("No gateway API key found in env.");
    process.exit(1);
  }

  const body = {
    model: "openai/gpt-oss-120b",
    messages: [{ role: "user", content: "say hi" }],
    provider: { only: ["cerebras"] },
    meta: true,
    debug: { enabled: true, return_upstream_request: true, trace: true, trace_level: "full" },
  };

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "x-gateway-debug": "true",
      "x-ai-stats-debug": "true",
      "x-aistats-beta-capabilities": "1",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log("status", res.status);
  console.log(text);
}

void main();
