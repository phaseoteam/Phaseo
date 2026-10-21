// Entry point for a full simulator run (vitest provides the gateway's path aliases).
//   pnpm --filter @phaseo/gateway-api simulate:providers
//   SIM_PROVIDERS=anthropic,openai pnpm --filter @phaseo/gateway-api simulate:providers
// Writes results/<provider>.json, results/summary.json and results/MATRIX.md. No network access.

import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupSimulatorRuntime, teardownSimulatorRuntime } from "./src/env";
import { runSimulation } from "./src/run";
import { writeReports } from "./src/report";
import { runGate } from "./src/expect/gate";
import { writeCoverage } from "./src/expect/coverage";
import { buildClientMatrix } from "./src/client-requests";
import { listSimProviders } from "./src/providers";

const here = path.dirname(fileURLToPath(import.meta.url));

it("simulates every registered text provider", async () => {
	const resultsDir = process.env.SIM_RESULTS_DIR ?? path.join(here, "results");
	if (process.env.SIM_REPORT_ONLY) {
		// Rebuild summary.json and MATRIX.md from an earlier run's providers/*.json.
		const dir = path.join(resultsDir, "providers");
		const results = fs.readdirSync(dir).filter((file) => file.endsWith(".json")).map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
		const order = new Map(listSimProviders().map((provider, index) => [provider.providerId, index]));
		results.sort((a, b) => (order.get(a.providerId) ?? 999) - (order.get(b.providerId) ?? 999));
		const previous = fs.existsSync(path.join(resultsDir, "summary.json")) ? JSON.parse(fs.readFileSync(path.join(resultsDir, "summary.json"), "utf8")) : null;
		writeReports({ resultsDir, matrix: buildClientMatrix(), results, durationMs: previous?.durationMs ?? 0, partial: false });
		gate(resultsDir);
		return;
	}
	setupSimulatorRuntime();
	// Start from an empty providers folder: stale files from an earlier or wider run would
	// otherwise reach the gate and coverage report as if this run had produced them.
	const providersDir = path.join(resultsDir, "providers");
	fs.mkdirSync(providersDir, { recursive: true });
	for (const file of fs.readdirSync(providersDir).filter((name) => name.endsWith(".json"))) fs.rmSync(path.join(providersDir, file));
	const providers = process.env.SIM_PROVIDERS?.split(",").map((id) => id.trim()).filter(Boolean);
	const started = Date.now();
	const { matrix, results } = await runSimulation({
		providers,
		onProvider: (result) => {
			const slim = JSON.parse(JSON.stringify(result, (key, value) => (key === "shapedUsage" ? undefined : value)));
			fs.writeFileSync(path.join(resultsDir, "providers", `${result.providerId}.json`), `${JSON.stringify(slim, null, 1)}\n`);
		},
	});
	writeReports({ resultsDir, matrix, results, durationMs: Date.now() - started, partial: Boolean(providers?.length) });
	teardownSimulatorRuntime();
	gate(resultsDir);
});

/** Fails the run when a mismatch is not on the allow-list (set SIM_NO_GATE=1 to only write the report). */
function gate(resultsDir: string) {
	writeCoverage(resultsDir);
	const { summary } = runGate(resultsDir, path.join(here, "results", "baselines"));
	if (process.env.SIM_NO_GATE) return;
	expect(summary.failing, `${summary.failing} mismatches are not on the allow-list; see ${path.join(resultsDir, "EXPECTATIONS.md")}`).toBe(0);
}
