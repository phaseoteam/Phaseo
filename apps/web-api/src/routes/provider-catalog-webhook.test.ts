import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { Hono } from "hono";
import { providerCatalogWebhookRouter } from "./provider-catalog-webhook";
import { encryptProviderCatalogWebhookSecret,signProviderCatalogWebhook,syncProviderCatalog } from "./account/provider-catalog-sync";
vi.mock("@/data/supabase",()=>({getDataClient:vi.fn()}));
vi.mock("./account/provider-catalog-sync",async importOriginal=>({...await importOriginal<typeof import("./account/provider-catalog-sync")>(),syncProviderCatalog:vi.fn()}));
import { getDataClient } from "@/data/supabase";
const env={WEBHOOK_SECRET_ENCRYPTION_KEY:"disposable-test-key"};
const secret="whsec_disposable_test_only";
const app=new Hono().route("/api/internal",providerCatalogWebhookRouter);
describe("signed provider catalog webhook",()=>{
 beforeEach(async()=>{
  const encrypted=await encryptProviderCatalogWebhookSecret(env as never,secret);
  vi.mocked(getDataClient).mockReturnValue({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{provider_slug:"sample",status:"active",...encrypted},error:null})})})})} as never);
  vi.mocked(syncProviderCatalog).mockResolvedValue({status:"applied",runId:"test-run"});
 });
 afterEach(()=>vi.clearAllMocks());
 async function send(options:{event?:string;headerEvent?:string;timestamp?:string;tamper?:boolean}={}){
  const event=options.event??"event-1";const body=JSON.stringify({event_id:event});
  const timestamp=options.timestamp??String(Math.floor(Date.now()/1000));
  const signature=await signProviderCatalogWebhook(secret,timestamp,body);
  return app.request("https://phaseo.app/api/internal/provider-catalog/sample",{method:"POST",headers:{"content-type":"application/json","x-phaseo-timestamp":timestamp,"x-phaseo-signature":signature,"x-phaseo-event-id":options.headerEvent??event},body:options.tamper?JSON.stringify({event_id:"tampered"}):body},env as never,{waitUntil:vi.fn()} as never);
 }
 it("accepts a valid signed event and forwards its id to the idempotent sync",async()=>{expect((await send()).status).toBe(202);expect(syncProviderCatalog).toHaveBeenCalledWith(env,"sample","webhook","event-1");});
 it("publishes provider-declared rate limits in the schema and OpenAPI contract",async()=>{
  for(const version of ["1.0","1.1"]){const schema=await (await app.request(`https://phaseo.app/api/internal/provider-catalog/schema?version=${version}`)).json() as any;expect(schema.properties.rate_limits.items).toEqual({$ref:"#/$defs/rateLimit"});expect(Object.keys(schema.$defs.rateLimit.properties)).toEqual(["model","requests_per_minute","requests_per_day","tokens_per_minute","tokens_per_day"]);}
  const openapi=await (await app.request("https://phaseo.app/api/internal/provider-catalog/openapi")).json() as any;
  expect(openapi.info.description).toContain("rate_limits");expect(openapi.components.schemas.ProviderCatalogRateLimits.items).toEqual({$ref:"#/components/schemas/ProviderCatalogRateLimit"});
 });
 it("rejects a changed body",async()=>{expect((await send({tamper:true})).status).toBe(401);expect(syncProviderCatalog).not.toHaveBeenCalled();});
 it("rejects an expired signature",async()=>{expect((await send({timestamp:String(Math.floor(Date.now()/1000)-600)})).status).toBe(401);});
 it("cannot bypass deduplication by changing the unsigned event header",async()=>{expect((await send({headerEvent:"different-event"})).status).toBe(400);expect(syncProviderCatalog).not.toHaveBeenCalled();});
 it("acknowledges duplicate deliveries using the same signed event ID",async()=>{vi.mocked(syncProviderCatalog).mockResolvedValue({status:"duplicate"});expect((await send()).status).toBe(202);expect((await send()).status).toBe(202);expect(syncProviderCatalog).toHaveBeenNthCalledWith(2,env,"sample","webhook","event-1");});
});
