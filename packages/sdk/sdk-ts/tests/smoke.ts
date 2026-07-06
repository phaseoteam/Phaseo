import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Phaseo } from "../src/index.js";

// Load smoke test manifest
const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, "../../smoke-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

const apiKey = process.env[manifest.apiKeyEnv];
if (!apiKey) {
	throw new Error(`${manifest.apiKeyEnv} is required`);
}

const baseUrl = process.env[manifest.baseUrlEnv] || manifest.defaultBaseUrl;
const client = new Phaseo({ apiKey, baseUrl });

console.log(`\nðŸ§ª Running smoke test with ${manifest.testModel}...`);
console.log(`ðŸ“ Base URL: ${baseUrl}\n`);

const operationArgIndex = process.argv.indexOf("--operation");
const operationArg =
	operationArgIndex >= 0 ? process.argv[operationArgIndex + 1] : undefined;
const operationKey = operationArg || (manifest.operations.responses ? "responses" : "chat");

const operation = manifest.operations[operationKey];
if (!operation) {
	throw new Error(`Unknown smoke operation: ${operationKey}`);
}

const payload = JSON.parse(JSON.stringify(operation.body));
const smokeModel = process.env.PHASEO_SMOKE_MODEL;
const smokeInput = process.env.PHASEO_SMOKE_INPUT;
const smokeMaxOutputTokens = process.env.PHASEO_SMOKE_MAX_OUTPUT_TOKENS;
if (smokeModel) {
	payload.model = smokeModel;
}
if (smokeInput) {
	if ("input" in payload) {
		payload.input = smokeInput;
	}
	if (Array.isArray(payload.messages)) {
		payload.messages = payload.messages.map((message: any) => {
			if (message?.role === "user" && typeof message?.content === "string") {
				return { ...message, content: smokeInput };
			}
			return message;
		});
	}
}
if (smokeMaxOutputTokens) {
	const parsed = Number.parseInt(smokeMaxOutputTokens, 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		payload.max_output_tokens = parsed;
	}
}
const response =
	operationKey === "responses"
		? await client.responses.create(payload)
		: await client.chat.completions.create(payload);

console.log("[PASS] Test passed!");
console.log(`ðŸ“Š Response:`);
console.log(JSON.stringify(response, null, 2));

// Validate response structure
if ("choices" in response && (!response.choices || response.choices.length === 0)) {
	throw new Error("[FAIL] No choices in response");
}

if (
	operationKey === "responses" &&
	!("choices" in response) &&
	!("content" in response) &&
	!("output" in response)
) {
	throw new Error("[FAIL] Response missing choices, content, or output");
}

console.log(`\n[DONE] Model used: ${manifest.testModel}`);
console.log(`[DONE] Test type: ${operationKey}`);
