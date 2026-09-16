import { test, expect, vi } from "vitest";
import * as health from "../../src/pipeline/execute/health";
import { resetRuntime, flushBackground, getCache } from "./runtime";
import { isRecoveryProbeRequest } from "../../src/pipeline/execute/health.config";
import { simulate } from "./simulator";
import { deepSuite } from "./deep-suite";
import { createUpstreamTimingTracker } from "../../src/executors/_shared/timing/upstream";

test("error ownership keeps user, gateway, and BYOK quota problems out of shared health", () => {
  for (const status of [400,401,402,403,404,413,422]) expect(health.classifyProviderHealthImpact({upstreamStatus:status})).toBe("neutral");
  for (const status of [401,402,429]) expect(health.classifyProviderHealthImpact({upstreamStatus:status,credentialSource:"byok"})).toBe("neutral");
  for (const status of [408,429,500,502,503,504]) expect(health.classifyProviderHealthImpact({upstreamStatus:status})).toBe("failure");
  expect(health.classifyProviderHealthImpact({errorMessage:"invalid parameter"})).toBe("neutral");
  expect(health.classifyProviderHealthImpact({errorCode:"ETIMEDOUT"})).toBe("neutral");
  expect(health.classifyProviderHealthImpact({errorCode:"ETIMEDOUT",failureOrigin:"provider"})).toBe("failure");
  expect(health.classifyProviderHealthImpact({upstreamStatus:500,failureOrigin:"gateway"})).toBe("neutral");
  expect(health.classifyProviderHealthImpact({midStreamError:true,aborted:true})).toBe("neutral");
  expect(health.classifyProviderHealthImpact({upstreamStatus:200,midStreamError:true})).toBe("failure");
  expect(health.classifyProviderHealthImpact({upstreamStatus:429,midStreamError:true,credentialSource:"byok"})).toBe("neutral");
  expect(health.classifyProviderHealthImpact({errorMessage:"gateway rate limit exceeded"})).toBe("neutral");
  expect(health.classifyProviderHealthImpact({errorMessage:"fetch failed",failureOrigin:"provider"})).toBe("failure");
});

test("transport boundary marks only provider I/O failures without wrapping errors", async () => {
  const original = globalThis.fetch;
  const error = new TypeError("fetch failed");
  globalThis.fetch = async () => { throw error; };
  try {
    const provider = createUpstreamTimingTracker();
    await expect(provider.timing.fetch("https://never-sent.invalid", undefined, "provider")).rejects.toBe(error);
    expect(provider.isProviderTransportFailure(error)).toBe(true);
    const auth = createUpstreamTimingTracker();
    await expect(auth.timing.fetch("https://never-sent.invalid", undefined, "auth")).rejects.toBe(error);
    expect(auth.isProviderTransportFailure(error)).toBe(false);
    const aborted = createUpstreamTimingTracker();
    const abort = new DOMException("cancelled", "AbortError");
    globalThis.fetch = async () => { throw abort; };
    await expect(aborted.timing.fetch("https://never-sent.invalid")).rejects.toBe(abort);
    expect(aborted.isProviderTransportFailure(abort)).toBe(false);
  } finally { globalThis.fetch = original; }
});

test("counts simultaneous failures, tolerates one error, and does not extend an open breaker", async () => {
  await flushBackground(); resetRuntime(); health.resetHealthStateForTests();
  vi.useFakeTimers({toFake:["Date"]}); vi.setSystemTime(1_800_000_000_000);
  try {
    const fail = async () => {
      await health.onCallEnd("responses",{provider:"p",model:"m",ok:false,latency_ms:10});
      await health.maybeOpenOnRecentErrors("responses","p","m");
    };
    await fail(); expect((await health.readHealth("responses","p","m")).breaker).toBe("closed");
    for(let n=0;n<7;n++) await fail();
    const opened = await health.readHealth("responses","p","m");
    expect(opened.rec_tot_ew_60s).toBe(8); expect(opened.breaker).toBe("open");
    vi.setSystemTime(Date.now()+10_000);
    for(let n=0;n<20;n++) await fail();
    const after = await health.readHealth("responses","p","m");
    expect(after.breaker_until_ms).toBe(opened.breaker_until_ms);
    expect(after.breaker_attempts).toBe(1);
    expect(await health.admitThroughBreaker("responses","p","m","w","r",{...opened,breaker:"closed",last_updated:0})).toBe("blocked");
  } finally {await flushBackground(); vi.useRealTimers();}
});

test("failed calls do not improve latency and output throughput ignores prompt length", async () => {
  await flushBackground(); resetRuntime(); health.resetHealthStateForTests();
  await health.onCallEnd("responses",{provider:"p",model:"m",ok:true,latency_ms:500,generation_ms:1000,tokens_in:1_000_000,tokens_out:100});
  await health.onCallEnd("responses",{provider:"p",model:"m",ok:false,latency_ms:1,generation_ms:1,tokens_out:1_000_000});
  await flushBackground();
  const state = await health.readHealth("responses","p","m");
  expect(state.lat_ewma_60s).toBe(500); expect(state.tp_ewma_60s).toBe(100);
  await health.onCallEnd("embeddings",{provider:"p",model:"embed",ok:true,latency_ms:1000,generation_ms:1000,tokens_in:1000,tokens_out:0});
  await flushBackground();
  expect((await health.readHealth("embeddings","p","embed")).tp_ewma_60s).toBe(1000);
});

test("rate limits degrade health without masquerading as outages or hiding real outages", async () => {
  await flushBackground(); resetRuntime(); health.resetHealthStateForTests();
  vi.useFakeTimers({toFake:["Date"]}); vi.setSystemTime(1_800_000_000_000);
  try {
    for (let n=0;n<100;n++) {
      expect(await health.onCallEnd("responses",{provider:"p",model:"m",ok:false,upstreamStatus:429,latency_ms:10})).toEqual({rateLimited:true});
      await health.maybeOpenOnRecentErrors("responses","p","m");
    }
    const limited = await health.readHealth("responses","p","m");
    expect(limited.breaker).toBe("closed");
    expect(limited.err_ewma_10s).toBe(1);
    expect(limited.rec_rate_limited_ew_10s).toBe(100);
    for (let n=0;n<8;n++) {
      await health.onCallEnd("responses",{provider:"p",model:"m",ok:false,upstreamStatus:503,latency_ms:10});
      await health.maybeOpenOnRecentErrors("responses","p","m");
    }
    expect((await health.readHealth("responses","p","m")).breaker).toBe("open");
  } finally { await flushBackground(); vi.useRealTimers(); }
});

test("20 identical warmed providers distribute traffic without a positional monopoly", async () => {
  const result=await simulate(deepSuite([1000]).find(s=>s.name.startsWith("equal-warm")));
  const counts=Object.values(result.aggregates.summary.providerFirstAttempts);
  expect(counts).toHaveLength(20);
  expect(Math.max(...counts)/result.aggregates.summary.requests).toBeLessThan(.15);
  expect(result.aggregates.summary.requests).toBe(1000);
});

test("bounded retention produces the same aggregate outcomes as a full trace", async () => {
  const input=deepSuite([100]).find(s=>s.name.startsWith("equal-warm"))!;
  const sparse=await simulate(input), full=await simulate({...input,retainRequests:true});
  expect(sparse.aggregates).toEqual(full.aggregates);
  expect(sparse.requests.length).toBeLessThan(full.requests.length);
});

test("overflow rejections do not reserve provider execution slots", async () => {
  const result = await simulate({name:"capacity-accounting",durationMs:2000,sampleMs:50,
    providers:[{id:"p",phases:[{atMs:0,behavior:{capacity:1,latencyMs:10,generationMs:90,failureDurationMs:1000}}]}],
    traffic:[{untilMs:2000,rps:20}]});
  expect(Math.max(...result.samples.map(s=>s.inflight.p))).toBe(1);
  expect(result.aggregates.summary.successRate).toBeGreaterThan(.3);
  expect(result.aggregates.summary.providerFailures.p).toBeGreaterThan(0);
});

test("sparse consecutive failures eventually open despite decaying sample counts", async () => {
  await flushBackground(); resetRuntime(); health.resetHealthStateForTests();
  vi.useFakeTimers({toFake:["Date"]}); vi.setSystemTime(1_800_000_000_000);
  try {
    for(let n=0;n<8;n++) {
      vi.setSystemTime(Date.now()+60_000);
      await health.onCallEnd("responses",{provider:"p",model:"m",ok:false,latency_ms:10});
      await health.maybeOpenOnRecentErrors("responses","p","m"); await flushBackground();
      expect((await health.readHealth("responses","p","m")).breaker).toBe(n===7?"open":"closed");
    }
  } finally { await flushBackground(); vi.useRealTimers(); }
});

test("sparse recovery probes survive beyond 20 seconds and a mixed batch can recover", async () => {
  await flushBackground(); resetRuntime(); health.resetHealthStateForTests();
  vi.useFakeTimers({toFake:["Date"]}); vi.setSystemTime(1_800_000_000_000);
  try {
    await getCache().put("gw:health:responses:m", JSON.stringify({"p::breaker":"open","p::breaker_until_ms":String(Date.now()-1)}));
    let sequence=0;
    const probe=async(ok:boolean)=>{
      let id:string; do {id=`probe-${++sequence}`;} while(!isRecoveryProbeRequest("w",id));
      expect(await health.admitThroughBreaker("responses","p","m","w",id)).toBe("probe");
      await health.reportProbeResult("responses","p","m",ok); await flushBackground();
      vi.setSystemTime(Date.now()+25_000);
    };
    for(const ok of [true,false,true,true,true]) await probe(ok);
    expect((await health.readHealth("responses","p","m")).breaker).toBe("half_open");
    for(let n=0;n<5;n++) await probe(true);
    expect((await health.readHealth("responses","p","m")).breaker).toBe("closed");
    await health.reportProbeResult("responses","p","m",false);
    expect((await health.readHealth("responses","p","m")).breaker).toBe("closed");
  } finally { await flushBackground(); vi.useRealTimers(); }
});

test("documents health write rejection under KV's same-key quota", async () => {
  const result=await simulate({name:"kv-quota",durationMs:1000,emulateKvLimits:true,providers:[{id:"p",phases:[{atMs:0,behavior:{}}]}],traffic:[{untilMs:1000,rps:20}]});
  expect(result.metadata.cacheOperations.failedWrites).toBeGreaterThan(0);
  expect(result.metadata.blockedNetworkAttempts).toBe(0);
});

test("all-provider outage can resume useful traffic through real recovery probes", async () => {
  const result=await simulate({name:"all-down",durationMs:300_000,providers:Array.from({length:20},(_,i)=>({id:`p-${i}`,phases:[{atMs:0,behavior:{failureRate:1,failureDurationMs:10}},{atMs:20_000,behavior:{latencyMs:10,generationMs:10}}]})),traffic:[{untilMs:300_000,rps:10}]});
  expect(result.transitions.some(t=>t.breaker_state === "open")).toBe(true);
  expect(result.transitions.some(t=>t.breaker_state === "closed")).toBe(true);
  expect(result.requests.filter(r=>r.atMs>=60_000 && r.success).length).toBeGreaterThan(0);
});

test("a newly visible price card changes explicit price routing", async () => {
  const result=await simulate({name:"price-swap",durationMs:2000,context:{cacheAwareRouting:false,body:{routing:{mode:"price"}}},providers:[
    {id:"a",inputUsdPerMillion:.1,outputUsdPerMillion:.1,phases:[{atMs:0,behavior:{}},{atMs:1000,inputUsdPerMillion:10,outputUsdPerMillion:10,behavior:{}}]},
    {id:"b",inputUsdPerMillion:1,outputUsdPerMillion:1,phases:[{atMs:0,behavior:{}}]},
  ],traffic:[{untilMs:2000,rps:10}]});
  expect(result.requests.filter(r=>r.atMs<1000).every(r=>r.attempts[0].provider === "a")).toBe(true);
  expect(result.requests.filter(r=>r.atMs>=1000).every(r=>r.attempts[0].provider === "b")).toBe(true);
});
