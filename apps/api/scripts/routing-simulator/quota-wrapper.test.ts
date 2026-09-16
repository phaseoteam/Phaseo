import { test, expect, vi, beforeEach } from "vitest";
import { admitManagedProvider, clearProviderRateLimitConfigCacheForTests } from "../../src/core/provider-rate-limits";
const state=vi.hoisted(()=>({queries:0,binding:true,admit:vi.fn(),row:{provider_id:"p",enabled:true,requests_per_minute:10}}));
vi.mock("@/runtime/env",()=>({
  getBindings:()=>state.binding?{PROVIDER_RATE_LIMITS:{getByName:()=>({admit:state.admit})}}:{},
  getSupabaseAdmin:()=>({from:(table:string)=>{
    if(table!=="provider_rate_limits") throw new Error("Unexpected database table");
    state.queries++;
    return {select:()=>({eq:()=>({maybeSingle:async()=>({data:state.row,error:null})})})};
  }}),
}));
beforeEach(()=>{clearProviderRateLimitConfigCacheForTests();state.queries=0;state.binding=true;state.admit.mockReset();});
test("configured local quota rejection preserves its retry window",async()=>{
  state.admit.mockResolvedValue({allowed:false,reason:"requests_per_minute",retryAfterSeconds:15});
  expect(await admitManagedProvider("p")).toEqual({allowed:false,reason:"requests_per_minute",retryAfterSeconds:15});
});
test("documents fail-open admission when quota coordination is unavailable",async()=>{
  state.admit.mockRejectedValue(new Error("synthetic coordinator unavailable"));
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  try {expect((await admitManagedProvider("p")).allowed).toBe(true);expect(log).toHaveBeenCalled();}
  finally {log.mockRestore();}
  state.binding=false;
  expect((await admitManagedProvider("p")).allowed).toBe(true);
});
test("quota configuration remains cached for sixty seconds",async()=>{
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(1_800_000_000_000);
  state.admit.mockResolvedValue({allowed:true,reason:null,retryAfterSeconds:null});
  try {
    await admitManagedProvider("p");vi.setSystemTime(Date.now()+59_000);await admitManagedProvider("p");expect(state.queries).toBe(1);
    vi.setSystemTime(Date.now()+1001);await admitManagedProvider("p");expect(state.queries).toBe(2);
  } finally {vi.useRealTimers();}
});
