import { afterEach,describe,expect,it,vi } from "vitest";
import { notifyPendingProviderModels,providerModelReviewMessage } from "./provider-model-notifications";
vi.mock("@/data/supabase",()=>({getDataClient:vi.fn()}));
import { getDataClient } from "@/data/supabase";
describe("private model review notifications",()=>{
 afterEach(()=>vi.restoreAllMocks());
 it("sends only a count and the authenticated review link",()=>{
   expect(providerModelReviewMessage(2)).toEqual({text:"2 new model proposals awaiting approval. Review: https://phaseo.app/settings/internal/provider-review",unfurl_links:false,unfurl_media:false});
 });
 it("mentions only the configured reviewer and rejects mention injection",()=>{
   expect(providerModelReviewMessage(1,"U0AGDKDBLP6").text).toMatch(/^<@U0AGDKDBLP6> /);
   expect(providerModelReviewMessage(1,"<!channel>").text).not.toContain("<!channel>");
 });
 it("does not query or send when unconfigured",async()=>{
   await notifyPendingProviderModels({} as never);expect(getDataClient).not.toHaveBeenCalled();
 });
 it("rejects non-Slack destinations without exposing the URL",async()=>{
   const log=vi.spyOn(console,"error").mockImplementation(()=>{});
   await notifyPendingProviderModels({PROVIDER_MODEL_REVIEW_SLACK_WEBHOOK:"https://example.invalid/secret"} as never);
   expect(log).toHaveBeenCalledWith("provider_model_notification_invalid_destination");
 });
 it("uses a lease and acknowledges only a successful delivery",async()=>{
   const ack=vi.fn().mockResolvedValue({error:null});const update=vi.fn(()=>({in:()=>({eq:ack})}));
   vi.mocked(getDataClient).mockReturnValue({rpc:vi.fn().mockResolvedValue({data:["request-id"],error:null}),from:()=>({update})} as never);
   const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response("ok"));
   await notifyPendingProviderModels({PROVIDER_MODEL_REVIEW_SLACK_WEBHOOK:"https://hooks.slack.com/services/test"} as never);
   expect(fetchMock).toHaveBeenCalledWith("https://hooks.slack.com/services/test",expect.objectContaining({redirect:"manual",body:JSON.stringify(providerModelReviewMessage(1))}));
   expect(ack).toHaveBeenCalledWith("notification_lease",expect.any(String));
 });
 it("does not acknowledge errors or log response bodies",async()=>{
   const update=vi.fn();vi.mocked(getDataClient).mockReturnValue({rpc:vi.fn().mockResolvedValue({data:["request-id"],error:null}),from:()=>({update})} as never);
   vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response("secret upstream body",{status:429}));
   const log=vi.spyOn(console,"error").mockImplementation(()=>{});
   await notifyPendingProviderModels({PROVIDER_MODEL_REVIEW_SLACK_WEBHOOK:"https://hooks.slack.com/services/test"} as never);
   expect(update).not.toHaveBeenCalled();expect(log).toHaveBeenCalledWith("provider_model_notification_delivery_failed",{status:429});
 });
 it("rejects redirects without forwarding the credential or payload",async()=>{
   const update=vi.fn();vi.mocked(getDataClient).mockReturnValue({rpc:vi.fn().mockResolvedValue({data:["request-id"],error:null}),from:()=>({update})} as never);
   const request=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(null,{status:302,headers:{location:"https://example.invalid/collect"}}));
   vi.spyOn(console,"error").mockImplementation(()=>{});
   await notifyPendingProviderModels({PROVIDER_MODEL_REVIEW_SLACK_WEBHOOK:"https://hooks.slack.com/services/test"} as never);
   expect(request).toHaveBeenCalledTimes(1);expect(update).not.toHaveBeenCalled();
 });
});
