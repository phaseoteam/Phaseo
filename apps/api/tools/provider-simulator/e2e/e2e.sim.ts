// Purpose: Entry point of the end-to-end provider simulator (vitest file).
// Why: Drives the real endpoint handlers (before -> execute -> after) with only database-touching modules mocked.
// How: vi.mock swaps auth, context, workspace policy, pricing loader, charge and audit at their module boundaries;
//      every case runs through makeEndpointHandler, and results/e2e/ gets observations, mismatches and a summary.
//      Mismatches never fail this run (the allow-list gate is applied centrally); harness errors do.
//
// Run (from apps/api):
//   npx vitest run --config tools/provider-simulator/vitest.config.ts tools/provider-simulator/e2e/e2e.sim.ts
//   SIM_E2E_CASES='^(failover|errors)\.' ...   only the case ids matching the regex (SUMMARY.md says "Partial run")
//   SIM_RESULTS_DIR=/tmp/sim ...               write to /tmp/sim/e2e instead of results/e2e

import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@pipeline/before/auth", async (importOriginal) => (await import("./mocks")).mockAuth(await importOriginal()));
vi.mock("@pipeline/before/context", async (importOriginal) => (await import("./mocks")).mockContext(await importOriginal()));
vi.mock("@pipeline/before/workspacePolicy", async (importOriginal) => (await import("./mocks")).mockWorkspacePolicy(await importOriginal()));
vi.mock("@pipeline/pricing/loader", async (importOriginal) => (await import("./mocks")).mockPriceLoader(await importOriginal()));
vi.mock("@pipeline/pricing/persist", async (importOriginal) => (await import("./mocks")).mockPersist(await importOriginal()));
vi.mock("@pipeline/audit", async (importOriginal) => (await import("./mocks")).mockAudit(await importOriginal()));

import { guardedFetch } from "./upstream";
import { runCase, missingResets, staleKvWrites } from "./runner";
import { compareObservation } from "./compare";
import { allCases, NOT_COVERED } from "./cases";
import { loadExpectations, cardLookupFor } from "./expectations";
import { buildCoverage, writeE2eReports } from "./report";
import { EXECUTORS_BY_PROVIDER } from "@/executors";
import type { Mismatch } from "../src/expect/types";
import type { Observation } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = process.env.SIM_RESULTS_DIR
	? path.join(process.env.SIM_RESULTS_DIR, "e2e")
	: path.resolve(here, "../results/e2e");

const filter = process.env.SIM_E2E_CASES ? new RegExp(process.env.SIM_E2E_CASES) : null;
const cases = allCases().filter((def) => !filter || filter.test(def.id));

const originalFetch = globalThis.fetch;
const observations: Observation[] = [];
const mismatches: Mismatch[] = [];

describe("provider simulator: end to end", () => {
	beforeAll(() => {
		// Installed once and kept for the whole run, so background work that outlives a case still cannot reach a network.
		globalThis.fetch = guardedFetch;
	});

	afterAll(() => {
		globalThis.fetch = originalFetch;
	});

	it(`runs ${cases.length} cases and writes results/e2e`, async () => {
		const expectations = loadExpectations();
		const harnessErrors: string[] = [];
		for (const def of cases) {
			const observation = await runCase(def);
			observations.push(observation);
			if (observation.harness.error) {
				harnessErrors.push(`${def.id}: ${observation.harness.error.split("\n")[0]}`);
				continue;
			}
			mismatches.push(...compareObservation(observation, expectations.entriesFor(def.group), cardLookupFor(def)));
		}
		const coverage = buildCoverage({ cases, observations, registry: EXECUTORS_BY_PROVIDER as Record<string, Record<string, unknown>>, notCovered: NOT_COVERED });
		writeE2eReports({ resultsDir: RESULTS_DIR, cases, observations, mismatches, notCovered: NOT_COVERED, missingResets, harnessErrors, filtered: Boolean(filter), coverage, staleKvWrites: staleKvWrites.length });
		// Mismatches are judged by the central allow-list gate; only harness failures fail this file.
		expect(harnessErrors, harnessErrors.join("\n")).toEqual([]);
	});
});
