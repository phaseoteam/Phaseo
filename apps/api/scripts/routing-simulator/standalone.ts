import { blockStandaloneNetwork, networkAttempts } from "./network-guard";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { builtInSuite } from "./suite";
import { deepSuite } from "./deep-suite";
import { comparisonSuite } from "./comparison-suite";
import { report, markdown } from "./report";
import { fingerprint } from "./provenance";

blockStandaloneNetwork();
const provenance = fingerprint();
// No production module is initialized until the transport guard is installed.
const { simulate } = await import("./simulator");
if (networkAttempts.length) throw new Error("Routing imports attempted network access");
const inputs = process.env.ROUTING_SIM_COMPARE === "1" ? comparisonSuite() : process.env.ROUTING_SIM_DEEP === "1" ? deepSuite(process.env.ROUTING_SIM_RATES?.split(",").map(Number),process.env.ROUTING_SIM_SEEDS?.split(",").map(Number))
  : process.env.ROUTING_SIM_SUITE === "1" ? builtInSuite() : [JSON.parse(readFileSync(process.env.ROUTING_SIM_SCENARIO!,"utf8"))];
const selected = inputs.filter(input=>!process.env.ROUTING_SIM_CASE || input.name.startsWith(process.env.ROUTING_SIM_CASE))
  .map(input=>process.env.ROUTING_SIM_BURSTS === "1" ? {...input,name:`${input.name}-bursts`,traffic:[0,15_000,50_000].map(fromMs=>({fromMs,untilMs:fromMs+1000,rps:input.traffic[0].rps}))} : input);
if (!selected.length) throw new Error("No scenarios matched the requested family");
const summaries = [];
const outputRoot = resolve(process.env.ROUTING_SIM_OUTPUT!);
mkdirSync(outputRoot,{recursive:true});
for (const [index,input] of selected.entries()) {
  const started = performance.now();
  const result = await simulate(input);
  const metrics = report(result);
  const output = inputs.length > 1 ? join(outputRoot,`${index+1}-${result.scenario.name.replace(/[^a-z0-9-]/gi,"-")}-${result.scenario.seed}`) : outputRoot;
  mkdirSync(output,{recursive:true});
  writeFileSync(join(output,"report.json"),JSON.stringify({...result,...metrics,provenance},null,2));
  writeFileSync(join(output,"report.md"),markdown(result,metrics));
  writeFileSync(join(output,"windows.csv"),"fromMs,untilMs,requests,successRate,p95LatencyMs,p99LatencyMs,meanAttempts\n"+metrics.windows.map(w=>[w.fromMs,w.untilMs,w.requests,w.successRate,w.p95LatencyMs,w.p99LatencyMs,w.meanAttempts].join(",")).join("\n"));
  const summary = {name:result.scenario.name,seed:result.scenario.seed,output,wallMs:performance.now()-started,...metrics.summary,cacheOperations:result.metadata.cacheOperations,checks:metrics.checks};
  summaries.push(summary);
  console.log(JSON.stringify(summary));
  // Checkpoint completed cases so an interrupted long run cannot appear complete.
  writeFileSync(join(outputRoot,"suite.json"),JSON.stringify({provenance,complete:summaries.length===selected.length,expectedScenarios:selected.length,summaries},null,2));
  if (!metrics.passed) process.exitCode = 1;
}
