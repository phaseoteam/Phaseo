import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { providerConfig } from "./providers.js";
import {
	fetchProviderModels,
	hasRequiredEnvVars,
	checkModelExists,
	normalizeModelKey,
} from "./client.js";
import type { ProviderResult } from "./types.js";

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const MODELS_ROOT = path.join(REPO_ROOT, "apps", "web", "src", "data", "models");
const PRICING_ROOT = path.join(
	REPO_ROOT,
	"apps",
	"web",
	"src",
	"data",
	"pricing"
);

interface ProviderEntry {
	name: string;
	fetchModels: () => Promise<string[]>;
}

function listModelFiles(root: string): string[] {
	if (!fs.existsSync(root)) return [];
	const entries = fs.readdirSync(root, { withFileTypes: true });
	const files: string[] = [];

	for (const org of entries.filter((entry) => entry.isDirectory())) {
		const orgPath = path.join(root, org.name);
		const models = fs.readdirSync(orgPath, { withFileTypes: true });
		for (const model of models.filter((entry) => entry.isDirectory())) {
			const modelPath = path.join(orgPath, model.name, "model.json");
			if (fs.existsSync(modelPath)) {
				files.push(modelPath);
			}
		}
	}

	return files;
}

function listPricingFiles(root: string): string[] {
	if (!fs.existsSync(root)) return [];
	const providers = fs.readdirSync(root, { withFileTypes: true });
	const files: string[] = [];

	for (const provider of providers.filter((entry) => entry.isDirectory())) {
		const providerPath = path.join(root, provider.name);
		const endpoints = fs.readdirSync(providerPath, { withFileTypes: true });
		for (const endpoint of endpoints.filter((entry) => entry.isDirectory())) {
			const endpointPath = path.join(providerPath, endpoint.name);
			const models = fs.readdirSync(endpointPath, { withFileTypes: true });
			for (const model of models.filter((entry) => entry.isDirectory())) {
				const pricingPath = path.join(
					endpointPath,
					model.name,
					"pricing.json"
				);
				if (fs.existsSync(pricingPath)) {
					files.push(pricingPath);
				}
			}
		}
	}

	return files;
}

function getExistingModelIds(): Set<string> {
	const modelFiles = listModelFiles(MODELS_ROOT);
	const ids = new Set<string>();
	for (const file of modelFiles) {
		try {
			const raw = fs.readFileSync(file, "utf-8");
			const data = JSON.parse(raw);
			if (data.model_id) ids.add(data.model_id);
		} catch {}
	}
	return ids;
}

function getExistingProviderModelSlugs(): Set<string> {
	const pricingFiles = listPricingFiles(PRICING_ROOT);
	const ids = new Set<string>();

	for (const file of pricingFiles) {
		try {
			const raw = fs.readFileSync(file, "utf-8");
			const data = JSON.parse(raw);
			const providerSlug =
				typeof data.provider_slug === "string"
					? data.provider_slug
					: typeof data.api_provider_id === "string"
						? data.api_provider_id
						: "";
			const providerPrefix = providerSlug;
			const providerModelSlug =
				typeof data.provider_model_slug === "string"
					? data.provider_model_slug
					: "";
			const modelId =
				typeof data.model_id === "string" ? data.model_id : "";

			if (providerPrefix && providerModelSlug) {
				ids.add(`${providerPrefix}/${providerModelSlug}`);
			} else if (modelId) {
				ids.add(modelId);
			}
		} catch {}
	}

	return ids;
}

async function sendDiscordWebhook(message: string) {
	const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
	if (!webhookUrl) return;
	const userId = process.env.DISCORD_USER_ID;
	const content = userId ? `<@${userId}>\n${message}` : message;
	const payload: { content: string; allowed_mentions?: { users: string[] } } =
		{
			content
		};
	if (userId) {
		payload.allowed_mentions = { users: [userId] };
	}
	try {
		await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		});
	} catch (error) {
		console.error("Failed to send Discord webhook:", error);
	}
}

async function fetchAllProviderModels(): Promise<ProviderResult[]> {
	const results: ProviderResult[] = [];

	for (const provider of providerConfig) {
		console.log(`Checking ${provider.name}...`);

		if (!hasRequiredEnvVars(provider)) {
			console.log(`  Skipping ${provider.name}: missing API key`);
			continue;
		}

		const startTime = Date.now();
		const models = await fetchProviderModels(provider);
		const responseTime = Date.now() - startTime;

		console.log(`  Fetched ${models.length} models from ${provider.name} (${responseTime}ms)`);

		results.push({
			provider: provider.id,
			models,
			timestamp: new Date().toISOString(),
		});
	}

	return results;
}

async function main() {
	const existing = new Set([
		...getExistingModelIds(),
		...getExistingProviderModelSlugs()
	]);
	const existingNormalized = new Set(
		[...existing].map((value) => normalizeModelKey(value))
	);
	console.log(`Found ${existing.size} existing models.`);

	const results = await fetchAllProviderModels();
	const newModels: { provider: string; models: string[] }[] = [];

	for (const result of results) {
		if (result.models.length === 0) continue;

		const newOnes = result.models.filter((model) => {
			return !existing.has(model) && !checkModelExists(existing, result.provider, model.split("/")[1]);
		});

		if (newOnes.length > 0) {
			newModels.push({ provider: result.provider, models: newOnes });
		}
	}

	if (newModels.length === 0) {
		console.log("No new models found.");
		return;
	}

	let message = `🚀 New models detected:\n\n`;
	for (const { provider, models } of newModels) {
		message += `**${provider}**: ${models.length} new\n`;
		message += models.map(m => `- ${m}`).join('\n');
		message += '\n\n';
	}

	console.log(message);
	await sendDiscordWebhook(message);
}

main().catch(console.error);
