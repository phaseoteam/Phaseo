import { renderToStaticMarkup } from "react-dom/server";
import ProviderModelRequests from "./ProviderModelRequests";
jest.mock("next-intl",()=>({useTranslations:()=> (key:string)=>key,useLocale:()=>"en-GB"}));
jest.mock("@/app/(dashboard)/settings/internal/provider-review/actions",()=>({reviewProviderModelRequestAction:jest.fn(),refreshProviderModelRequestsAction:jest.fn()}));
describe("new-model review display",()=>{
 it("shows proposal identity, modalities and limits without rendering provider HTML",()=>{
  const html=renderToStaticMarkup(<ProviderModelRequests initialRequests={[{id:"test",provider_slug:"sample",model_slug:"sample/model",status:"pending",reason:null,updated_at:"2026-10-06T00:00:00Z",model:{name:"<script>bad</script>",description:"<img src=x onerror=bad>",inputModalities:["text","image"],outputModalities:["text"],contextLength:8192,maxOutputTokens:1024}}]}/>);
  expect(html).toContain("sample/model");expect(html).toContain("text, image");expect(html).toContain("contextLength");
  expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>bad");expect(html).not.toContain("<img src=x");
  expect(html).toContain("approve");expect(html).toContain("requestChanges");expect(html).toContain("reject");
 });
 it("renders the empty queue",()=>{expect(renderToStaticMarkup(<ProviderModelRequests initialRequests={[]}/>)).toContain("current.noPendingClaims");});
 it("renders older proposals without modality lists",()=>{
  const html=renderToStaticMarkup(<ProviderModelRequests initialRequests={[{id:"legacy",provider_slug:"sample",model_slug:"sample/legacy",status:"pending",reason:null,updated_at:"2026-10-06T00:00:00Z",model:{name:"Legacy model"}}]}/>);
  expect(html).toContain("Legacy model");
 });
});
