import {afterEach,describe,expect,it,vi} from "vitest";
import {syncProviderCatalog} from "./provider-catalog-sync";
vi.mock("@/data/supabase",()=>({getDataClient:vi.fn()}));
import {getDataClient} from "@/data/supabase";
describe("catalog refresh execution",()=>{
 afterEach(()=>vi.restoreAllMocks());
 function client(requested:boolean,duplicate=false,receiptStatus="applied",claim=true,newerApplied=false){
  const source={provider_slug:"sample",status:"active",management_mode:"remote",catalog_url:"https://example.invalid/models?format=phaseo",etag:'"previous"',last_modified:"Mon, 05 Oct 2026 00:00:00 GMT",poll_interval_seconds:3600,consecutive_failures:0};
  const writes:Array<{table:string;values:Record<string,unknown>;filters:Array<[string,unknown]>}>=[];
  function query(table:string){let write:typeof writes[number]|undefined;let inserting=false;let newer=false;
   const result=()=>({data:table==="provider_catalog_sources"?source:table==="provider_catalog_sync_runs"?(newer?(newerApplied?{id:"run-2"}:null):{id:"run-1",status:receiptStatus,created_at:"2026-10-06T00:00:00Z"}):[],error:table==="provider_catalog_sync_runs"&&inserting&&duplicate?{code:"23505"}:null});
   const builder={select:()=>builder,in:()=>builder,limit:()=>builder,gt:()=>{newer=true;return builder;},eq:(key:string,value:unknown)=>{write?.filters.push([key,value]);return builder;},update:(values:Record<string,unknown>)=>{write={table,values,filters:[]};writes.push(write);return builder;},insert:()=>{inserting=true;return builder;},maybeSingle:async()=>result(),single:async()=>result(),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
   return builder;
  }
  const rpc=vi.fn(async(name:string)=>({data:name==="claim_provider_catalog_sync"?claim:name==="consume_provider_catalog_refresh"?requested:name==="apply_provider_catalog_snapshot"?1:true,error:null}));
  vi.mocked(getDataClient).mockReturnValue({from:query,rpc} as never);return {rpc,writes};
 }
 it("fetches the full feed after approval even when its ETag is unchanged",async()=>{
  const {rpc}=client(true);const fetchMock=vi.spyOn(globalThis,"fetch").mockImplementation(async(input)=>String(input).startsWith("https://cloudflare-dns.com/")?Response.json({Answer:[{type:1,data:"93.184.216.34"}]}):Response.json({data:[{id:"sample/model",name:"Model",capabilities:["responses"],availability:"not_ready"}]}));
  expect((await syncProviderCatalog({} as never,"sample","poll")).status).toBe("applied");
  expect(fetchMock.mock.calls.find(([input])=>String(input).startsWith("https://example.invalid/"))?.[1]?.headers).not.toHaveProperty("if-none-match");
  expect(rpc).toHaveBeenCalledWith("apply_provider_catalog_snapshot",expect.objectContaining({p_provider_slug:"sample"}));
 });
 it("uses validators for ordinary polling and preserves edits arriving during a 304",async()=>{
  const {rpc,writes}=client(false);const fetchMock=vi.spyOn(globalThis,"fetch").mockImplementation(async(input)=>String(input).startsWith("https://cloudflare-dns.com/")?Response.json({Answer:[{type:1,data:"93.184.216.34"}]}):new Response(null,{status:304}));
  expect((await syncProviderCatalog({} as never,"sample","poll")).status).toBe("not_modified");
  expect(fetchMock.mock.calls.find(([input])=>String(input).startsWith("https://example.invalid/"))?.[1]?.headers).toHaveProperty("if-none-match",'"previous"');
  expect(rpc.mock.calls.filter(([name])=>name==="consume_provider_catalog_refresh")).toHaveLength(1);
  expect(writes.find(write=>"next_poll_at" in write.values)?.filters).toContainEqual(["refresh_requested",false]);
 });
 it("does not fetch or reapply duplicate webhook events",async()=>{
  const {rpc}=client(false,true);const fetchMock=vi.spyOn(globalThis,"fetch");
  expect((await syncProviderCatalog({} as never,"sample","webhook","event-1")).status).toBe("duplicate");
  expect(fetchMock).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalledWith("apply_provider_catalog_snapshot",expect.anything());
 });
 it.each(["failed","processing"])("retries a %s receipt after obtaining the provider lease",async(status)=>{
  const {rpc,writes}=client(false,true,status);
  vi.spyOn(globalThis,"fetch").mockImplementation(async(input)=>String(input).startsWith("https://cloudflare-dns.com/")?Response.json({Answer:[{type:1,data:"93.184.216.34"}]}):Response.json({data:[{id:"sample/model",capabilities:["responses"],availability:"not_ready"}]}));
  expect((await syncProviderCatalog({} as never,"sample","webhook","event-1")).status).toBe("applied");
  expect(writes.find(write=>write.table==="provider_catalog_sync_runs"&&write.values.status==="processing")?.filters).toContainEqual(["status",status]);
  expect(rpc).toHaveBeenCalledWith("apply_provider_catalog_snapshot",expect.objectContaining({p_run_id:"run-1"}));
 });
 it.each(["failed","processing"])("does not reclaim a superseded %s receipt",async(status)=>{
  const {rpc,writes}=client(false,true,status,true,true);const fetchMock=vi.spyOn(globalThis,"fetch");
  expect((await syncProviderCatalog({} as never,"sample","webhook","event-1")).status).toBe("duplicate");
  expect(fetchMock).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalledWith("apply_provider_catalog_snapshot",expect.anything());
  expect(writes.some(write=>write.table==="provider_catalog_sync_runs")).toBe(false);
 });
 it("keeps rejected deliveries terminal",async()=>{
  client(false,true,"rejected");const fetchMock=vi.spyOn(globalThis,"fetch");
  expect((await syncProviderCatalog({} as never,"sample","webhook","event-1")).status).toBe("duplicate");
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it("does not reclaim a receipt while another provider sync holds the lease",async()=>{
  const {rpc,writes}=client(false,true,"processing",false);const fetchMock=vi.spyOn(globalThis,"fetch");
  expect((await syncProviderCatalog({} as never,"sample","webhook","event-1")).status).toBe("busy");
  expect(fetchMock).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalledWith("apply_provider_catalog_snapshot",expect.anything());
  expect(writes.some(write=>write.table==="provider_catalog_sync_runs")).toBe(false);
 });
});
