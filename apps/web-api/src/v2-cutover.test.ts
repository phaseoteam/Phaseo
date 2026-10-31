import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPLACED_CATALOGUE_TABLES = new Set([
	"data_api_pricing_rules",
	"data_api_pricing_skus",
	"data_api_provider_model_capabilities",
	"data_api_provider_models",
	"data_api_providers",
	"data_benchmark_results",
	"data_benchmarks",
	"data_api_model_page_notices",
	"data_api_model_aliases",
	"data_model_details",
	"data_model_families",
	"data_model_links",
	"data_models",
	"data_organisation_links",
	"data_organisations",
	"data_subscription_plan_features",
	"data_subscription_plan_models",
	"data_subscription_plans",
]);

const CURRENT_NON_CATALOGUE_DATA_TABLES = new Set([
	"data_contributions",
]);

const REPLACED_RUNTIME_TABLES = new Set([
	"gateway_model_usage_daily",
	"public_app_model_usage_daily",
]);

const LEGACY_LIFECYCLE_WRITERS = new Set([
	"apps/api/src/core/realtime-sessions.ts",
	"apps/api/src/core/video-finalization.ts",
	"apps/api/src/pipeline/audit/index.ts",
	"apps/web-api/src/routes/account/settings.ts",
]);

function sourceFiles(root: string): string[] {
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const path = join(root, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return /\.(?:ts|tsx|sql)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)
			? [path]
			: [];
	});
}

describe("V2 catalogue and analytics cutover", () => {
	it("keeps gateway_requests authoritative while avoiding replaced catalogue and rollup tables", () => {
		const packageRoot = process.cwd();
		const roots = [
			join(packageRoot, "src"),
			join(packageRoot, "scripts"),
			join(packageRoot, "..", "api", "src"),
			join(packageRoot, "..", "api", "scripts"),
			join(packageRoot, "..", "web", "src", "lib", "fetchers"),
			join(packageRoot, "..", "web", "scripts"),
			join(packageRoot, "..", "..", "scripts"),
		];
		const violations: string[] = [];
		for (const file of roots.flatMap(sourceFiles)) {
			const repoPath = relative(join(packageRoot, "..", ".."), file).replaceAll("\\", "/");
			for (const [index, line] of readFileSync(file, "utf8").split(/\r?\n/).entries()) {
				for (const match of line.matchAll(/\.from\("(data_[a-z0-9_]+)"\)/g)) {
					const table = match[1];
					if (CURRENT_NON_CATALOGUE_DATA_TABLES.has(table)) continue;
					if (!REPLACED_CATALOGUE_TABLES.has(table)) continue;
					if (/\.(?:insert|upsert|update|delete)\s*\(/.test(line.slice(match.index))) continue;
					violations.push(`${repoPath}:${index + 1} reads ${table}`);
				}
				for (const match of line.matchAll(/\.from\("([a-z0-9_]+)"\)/g)) {
					const table = match[1];
					const replacedRollup = table.startsWith("gateway_usage_rollup_");
					if (!REPLACED_RUNTIME_TABLES.has(table) && !replacedRollup) continue;
					if (LEGACY_LIFECYCLE_WRITERS.has(repoPath)) continue;
					violations.push(`${repoPath}:${index + 1} reads replaced runtime table ${table}`);
				}
				const sqlMatch = line.match(/\b(?:from|join)\s+public\.(gateway_model_usage_daily|public_app_model_usage_daily|gateway_usage_rollup_[a-z0-9_]+)/i);
				if (sqlMatch) violations.push(`${repoPath}:${index + 1} reads replaced SQL source ${sqlMatch[1]}`);
			}
		}
		expect(violations).toEqual([]);
	});

	it("keeps exact gateway control reads on the authoritative request table", () => {
		const repoRoot = join(process.cwd(), "..", "..");
		const exactRequestReaders = [
			"apps/api/src/routes/v1/control/credits.ts",
			"apps/api/src/routes/v1/control/generations.ts",
			"apps/api/src/routes/v1/control/logs.ts",
			"apps/api/src/routes/v1/control/oauth-clients.ts",
			"apps/web/src/routes/api/stripe/refunds/request/index.ts",
		];

		for (const repoPath of exactRequestReaders) {
			const source = readFileSync(join(repoRoot, repoPath), "utf8");
			expect(source, repoPath).toContain('.from("gateway_requests")');
			expect(source, repoPath).not.toContain('.from("v2_web_gateway_requests")');
		}
	});
});
