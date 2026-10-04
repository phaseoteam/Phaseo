import { describe, expect, it } from "vitest";
import { browserTabs, updateBrowserTab } from "./browserTabs";
describe("chat browser tabs", () => {
 it.each([null, 1, [], {}, {tabs:null}])("recovers malformed state %j", value => expect(browserTabs(value,"chat")).toEqual({active:"chat",tabs:[{id:"chat",title:"New tab",url:""}]}));
 it("rejects foreign and duplicate IDs, unsafe saved URLs and missing active tabs", () => {
  expect(browserTabs({active:"missing",tabs:[{id:"other",url:"https://example.com"},{id:"chat",url:"file:///private",title:"Saved"},{id:"chat",url:"https://example.com"},{id:"chat:second",url:"https://example.com",title:"x".repeat(200)}]},"chat")).toEqual({active:"chat",tabs:[{id:"chat",url:"",title:"Saved"},{id:"chat:second",url:"https://example.com/",title:"x".repeat(120)}]});
 });
 it("bounds persisted tabs and preserves valid active selection", () => {const tabs=Array.from({length:30},(_,index)=>({id:"chat:"+index,title:"Tab",url:""}));const group=browserTabs({active:"chat:5",tabs},"chat");expect(group.tabs).toHaveLength(20);expect(group.active).toBe("chat:5");});
 it("retains the last confirmed address while a native load has no committed URL", () => {const group=browserTabs({active:"chat",tabs:[{id:"chat",title:"Confirmed",url:"https://example.com/"}]},"chat");expect(updateBrowserTab(group,{id:"chat",title:"",url:"",loading:true,canGoBack:false,canGoForward:false}).tabs[0]).toEqual(group.tabs[0]);});
 it("updates the native source tab without changing selection or another tab", () => {const group=browserTabs({active:"chat:second",tabs:[{id:"chat",url:"",title:"First"},{id:"chat:second",url:"",title:"Second"}]},"chat");const next=updateBrowserTab(group,{id:"chat",url:"https://example.com/",title:"Native",loading:false,canGoBack:false,canGoForward:false});expect(next.active).toBe("chat:second");expect(next.tabs[0]).toEqual({id:"chat",title:"Native",url:"https://example.com/"});expect(next.tabs[1]).toEqual(group.tabs[1]);expect(group.tabs[0].title).toBe("First");});
});
