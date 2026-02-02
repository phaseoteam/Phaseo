import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { AIStats } from "../src/index.js";

// Load smoke test manifest
const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, "../../smoke-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

const apiKey = process.env[manifest.apiKeyEnv];
if (!apiKey) {
	throw new Error(`${manifest.apiKeyEnv} is required`);
}

const baseUrl = process.env[manifest.baseUrlEnv] || manifest.defaultBaseUrl;
const client = new AIStats({ apiKey, baseUrl });

console.log(`\n🧪 Running smoke test with ${manifest.testModel}...`);
console.log(`📍 Base URL: ${baseUrl}\n`);

const chatPayload = manifest.operations.chat.body;
const response = await client.generateText(chatPayload);

console.log("✅ Test passed!");
console.log(`📊 Response:`);
console.log(JSON.stringify(response, null, 2));

// Validate response structure
if (!response.choices || response.choices.length === 0) {
	throw new Error("❌ No choices in response");
}

console.log(`\n✨ Model used: ${manifest.testModel}`);
console.log(`✨ Test type: Text generation only`);
