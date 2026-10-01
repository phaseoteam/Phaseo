import {test, expect, vi} from "vitest";
const shared = vi.hoisted(()=>({store:new Map<string,string>(),tasks:[] as Promise<unknown>[]}));
vi.mock("@/runtime/env",()=>({
  getCache:()=>({get:async(key:string)=>shared.store.get(key)??null,put:async(key:string,value:string)=>{shared.store.set(key,value);},delete:async(key:string)=>{shared.store.delete(key);}}),
  dispatchBackground:(p:Promise<unknown>)=>shared.tasks.push(p),
  getSupabaseAdmin:()=>({from:()=>({upsert:async()=>({error:null})})}),
}));
test("documents lost concurrent observations across independent isolate caches",async()=>{
  shared.store.clear(); shared.tasks=[];
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(1_800_000_000_000);
  try {
    vi.resetModules();const isolateA=await import("../../src/pipeline/execute/health");
    vi.resetModules();const isolateB=await import("../../src/pipeline/execute/health");
    // Both isolates read the same initial snapshot, then independently update it.
    await Promise.all([isolateA.readHealth("responses","p","m"),isolateB.readHealth("responses","p","m")]);
    await Promise.all([
      isolateA.onCallEnd("responses",{provider:"p",model:"m",ok:true,latency_ms:200}),
      isolateB.onCallEnd("responses",{provider:"p",model:"m",ok:false,latency_ms:10}),
    ]);
    while(shared.tasks.length) await Promise.all(shared.tasks.splice(0));
    const persisted=JSON.parse(shared.store.get("gw:health:responses:m")!);
    // This is an explicit remaining architecture defect, not a desired invariant.
    expect(Number(persisted["p::rec_tot_ew_60s"])).toBe(1);
  } finally {vi.useRealTimers();}
});
