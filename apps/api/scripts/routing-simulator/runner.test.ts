import { test, expect, afterAll } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fingerprint } from "./provenance";
import { simulate } from "./simulator";
import { report, markdown } from "./report";
import { builtInSuite } from "./suite";
import { deepSuite } from "./deep-suite";

const scenarioPath = process.env.ROUTING_SIM_SCENARIO;
const inputs = process.env.ROUTING_SIM_DEEP === "1" ? deepSuite(process.env.ROUTING_SIM_RATES?.split(",").map(Number),process.env.ROUTING_SIM_SEEDS?.split(",").map(Number)) : process.env.ROUTING_SIM_SUITE === "1" ? builtInSuite() : scenarioPath ? [JSON.parse(readFileSync(scenarioPath, "utf8"))] : [];
const selectedInputs = (process.env.ROUTING_SIM_CASE ? inputs.filter(input => input.name.startsWith(process.env.ROUTING_SIM_CASE!)) : inputs).map(input => process.env.ROUTING_SIM_BURSTS === "1" ? {...input,name:`${input.name}-bursts`,traffic:[0,15_000,50_000].map(fromMs=>({fromMs,untilMs:fromMs+1000,rps:input.traffic[0].rps}))} : input);
const summaries: unknown[] = [];
// Capture before execution; do not label a long run with edits made afterwards.
const provenance = selectedInputs.length ? fingerprint() : undefined;
for (const [index, input] of selectedInputs.entries()) test(`${input.name} / seed ${input.seed ?? 1}`, async () => {
  const started=performance.now();
  const result = await simulate(input);
  expect(result.requests.every(r => r.endMs >= r.atMs && Number.isFinite(r.endMs))).toBe(true);
  expect(result.metadata.blockedNetworkAttempts).toBe(0);
  const metrics = report(result);
  const output = inputs.length > 1 ? resolve(process.env.ROUTING_SIM_OUTPUT!, `${index + 1}-${result.scenario.name.replace(/[^a-z0-9-]/gi, "-")}-${result.scenario.seed}`) : resolve(process.env.ROUTING_SIM_OUTPUT!);
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "report.json"), JSON.stringify({ ...result, ...metrics, provenance }, null, 2));
  writeFileSync(join(output, "report.md"), markdown(result, metrics) + `\nSource SHA-256: ${provenance!.sourceSha256}\n`);
  writeFileSync(join(output, "windows.csv"), "fromMs,untilMs,requests,successRate,p95LatencyMs,p99LatencyMs,meanAttempts\n" + metrics.windows.map(w => [w.fromMs, w.untilMs, w.requests, w.successRate, w.p95LatencyMs, w.p99LatencyMs, w.meanAttempts].join(",")).join("\n"));
  const summary = { name: result.scenario.name, seed: result.scenario.seed, output, wallMs:performance.now()-started, ...metrics.summary, cacheOperations:result.metadata.cacheOperations, checks: metrics.checks };
  summaries.push(summary);
  console.log(JSON.stringify(summary));
  expect(metrics.checks.filter(c => !c.passed), "Scenario targets failed; inspect the saved report").toEqual([]);
});
if (!inputs.length) test.skip("provide a scenario through cli.ts", () => {});
afterAll(() => {
  if (inputs.length > 1) writeFileSync(resolve(process.env.ROUTING_SIM_OUTPUT!, "suite.json"), JSON.stringify({ provenance, summaries }, null, 2));
});
