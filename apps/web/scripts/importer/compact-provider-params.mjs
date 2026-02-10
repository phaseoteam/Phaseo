#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const PROVIDERS_DIR = path.join(ROOT, "apps", "web", "src", "data", "api_providers");

function isObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactParamEntry(entry) {
	if (typeof entry === "string") return entry;
	if (!isObject(entry)) return entry;
	const out = {};
	if (typeof entry.param_id === "string" && entry.param_id.trim()) {
		out.param_id = entry.param_id.trim();
	}
	for (const [key, value] of Object.entries(entry)) {
		if (key === "param_id") continue;
		if (value === null || value === undefined) continue;
		out[key] = value;
	}
	return out;
}

async function main() {
	const dirents = await fs.readdir(PROVIDERS_DIR, { withFileTypes: true });
	let filesChanged = 0;
	let modelsTouched = 0;

	for (const dirent of dirents) {
		if (!dirent.isDirectory()) continue;
		const modelsPath = path.join(PROVIDERS_DIR, dirent.name, "models.json");
		try {
			await fs.access(modelsPath);
		} catch {
			continue;
		}

		const raw = await fs.readFile(modelsPath, "utf8");
		const models = JSON.parse(raw);
		let fileChanged = false;

		for (const model of models) {
			if (!Array.isArray(model?.capabilities)) continue;
			for (const capability of model.capabilities) {
				if (!Array.isArray(capability?.params)) continue;
				const nextParams = capability.params.map(compactParamEntry);
				if (JSON.stringify(nextParams) !== JSON.stringify(capability.params)) {
					capability.params = nextParams;
					fileChanged = true;
					modelsTouched += 1;
				}
			}
		}

		if (fileChanged) {
			filesChanged += 1;
			await fs.writeFile(modelsPath, `${JSON.stringify(models, null, 2)}\n`, "utf8");
		}
	}

	console.log(
		JSON.stringify(
			{
				files_changed: filesChanged,
				models_touched: modelsTouched,
			},
			null,
			2,
		),
	);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

