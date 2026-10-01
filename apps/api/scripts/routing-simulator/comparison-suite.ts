import { deepSuite } from "./deep-suite";

/** Same environment and request/provider RNG; only the selection strategy changes. */
export function comparisonSuite() {
  const cases=deepSuite([1000]).filter(s=>["latency-spread-1000rpm","latency-fluctuation-1000rpm","outage-recovery-1000rpm"].includes(s.name));
  const capacity=deepSuite([10_000]).find(s=>s.name === "latency-spread-10000rpm")!;
  cases.push({...capacity,name:"bounded-capacity-10000rpm",providers:capacity.providers.map(p=>({...p,phases:p.phases.map(phase=>({...phase,behavior:{...phase.behavior,capacity:10}}))}))});
  return cases.flatMap(s=>["router","round_robin"].map(strategy=>({...s,name:`${s.name}-${strategy}`,strategy})));
}
