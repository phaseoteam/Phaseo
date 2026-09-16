const healthy = { latencyMs: 200, generationMs: 500, outputTokens: 100, inputTokens: 1000 };
const phase = (atMs: number, behavior: Record<string, unknown>) => ({ atMs, behavior });
export function deepSuite(rates = [100, 1000, 10_000, 100_000, 1_000_000], seeds = [42]) {
  return seeds.flatMap(seed => rates.flatMap(rpm => {
    const base = {
      durationMs: 60_000, sampleMs: 1000, seed, retainRequests: false,
      maxRequests: rpm + 10, traceEvery: Math.max(10, Math.floor(rpm/100)),
      context: { cacheAwareRouting: false }, traffic: [{ untilMs: 60_000, rps: rpm/60 }],
    };
    const providers = Array.from({length:20}, (_,i) => ({
      id: `provider-${String(i).padStart(2,"0")}`, phases: [phase(0, healthy)],
      initialHealth: { lat_ewma_60s: 200, lat_ewma_300s: 200, tp_ewma_60s: 200,
        rec_tot_ew_60s: 60, rec_ok_ew_60s: 60, rate_60s: rpm/60/20 },
    }));
    const incident = (behavior: Record<string,unknown>) => providers.map((p,i) => i < 5 ? { ...p,
      phases: [phase(0, healthy), phase(15_000, {...healthy,...behavior}), phase(35_000, healthy)] } : p);
    const cases = [
      {name:"equal-cold", providers: providers.map(({initialHealth, ...p})=>p)},
      {name:"equal-warm", providers},
      {name:"latency-spread", providers: providers.map((p,i)=>({...p, phases:[phase(0,{...healthy,latencyMs:100+i*30})]}))},
      {name:"latency-fluctuation", providers: incident({latencyMs:2000})},
      {name:"throughput-fluctuation", providers: incident({generationMs:5000}), context:{cacheAwareRouting:false,body:{routing:{mode:"throughput"}}}},
      {name:"price-change", providers: providers.map((p,i)=>i<5? {...p,phases:[phase(0,healthy),{...phase(15_000,healthy),inputUsdPerMillion:10,outputUsdPerMillion:10},{...phase(35_000,healthy),inputUsdPerMillion:.1,outputUsdPerMillion:.1}]}:p)},
      {name:"outage-recovery", providers: incident({failureRate:1,failureStatus:503,failureDurationMs:50})},
      {name:"upstream-429", providers: incident({failureRate:1,failureStatus:429,failureDurationMs:50})},
      {name:"stream-failure", providers: incident({midStreamError:true})},
      {name:"invalid-parameter-400", providers: incident({failureRate:1,failureStatus:400,errorCode:"unsupported_parameter",failureDurationMs:50})},
      {name:"cached-tokens-outage", providers: providers.map((p,i)=>i===0 ? {...p,phases:[phase(0,{...healthy,cachedReadTokens:10_000}),phase(15_000,{...healthy,failureRate:1}),phase(35_000,{...healthy,cachedReadTokens:10_000})]}:p), context:{body:{prompt_cache_key:"shared-prompt"}}},
    ];
    return cases.map(c=>({...base,...c,name:`${c.name}-${rpm}rpm`}));
  }));
}
