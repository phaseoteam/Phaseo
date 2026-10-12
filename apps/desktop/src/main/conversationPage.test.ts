import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./workspaceStore";
import { conversationPageBytes, conversationWindow, validateConversationPageQuery } from "../shared/conversationPage";

describe("database conversation pages", () => {
 it.each(["messages", "activities"] as const)("pages large UTF-8 %s in both directions without losing content", kind => {
  const store = new WorkspaceStore(":memory:");
  try {
   const task=store.apply({type:"create-task",harness:"codex",model:"default",mode:"chat"}),text="😀\n".repeat(100000);
   if(kind==="messages")task.messages=Array.from({length:8},(_,index)=>({id:"entry-"+index,role:"assistant",text,createdAt:task.createdAt}));
   else task.activities=Array.from({length:8},(_,index)=>({id:"entry-"+index,type:"tool",title:"Owned output",text,status:"completed"}));
   store.saveTask(task);const source=task[kind]!;
   const latest=store.conversationPage({taskId:task.id,kind,limit:50});expect(latest).toMatchObject({earlier:5,later:0,entries:source.slice(5)});expect(Buffer.byteLength(JSON.stringify(latest.entries))).toBeLessThanOrEqual(conversationPageBytes);
   expect(store.getTaskView(task.id)[kind]).toEqual(latest.entries);
   expect(store.conversationPage({taskId:task.id,kind,beforeId:"entry-5",limit:50})).toMatchObject({earlier:2,later:3,entries:source.slice(2,5)});
   expect(store.conversationPage({taskId:task.id,kind,afterId:"entry-2",limit:50})).toMatchObject({earlier:3,later:2,entries:source.slice(3,6)});
   expect(store.conversationPage({taskId:task.id,kind,fromId:"entry-1",limit:50})).toMatchObject({earlier:1,later:4,entries:source.slice(1,4)});
   const recovered=[...latest.entries];let page=latest;
   while(page.earlier){page=store.conversationPage({taskId:task.id,kind,beforeId:page.entries[0].id,limit:50});recovered.unshift(...page.entries);expect(Buffer.byteLength(JSON.stringify(page.entries))).toBeLessThanOrEqual(conversationPageBytes);}
   expect(recovered).toEqual(source);expect(store.getTask(task.id)[kind]).toEqual(source);
  }finally{store.close();}
 });
 it("keeps a single oversized message accessible without adding surrounding bodies",()=>{
  const store=new WorkspaceStore(":memory:");try{const task=store.apply({type:"create-task",harness:"codex",model:"default",mode:"chat"});task.messages=[{id:"before",role:"user",text:"Before",createdAt:task.createdAt},{id:"large",role:"assistant",text:"x".repeat(conversationPageBytes+1),createdAt:task.createdAt},{id:"after",role:"user",text:"After",createdAt:task.createdAt}];store.saveTask(task);expect(store.conversationPage({taskId:task.id,kind:"messages",fromId:"large",limit:50})).toMatchObject({earlier:1,later:1,entries:[task.messages[1]]});expect(store.conversationPage({taskId:task.id,kind:"messages",beforeId:"after",limit:50})).toMatchObject({earlier:1,later:1,entries:[task.messages[1]]});expect(store.conversationPage({taskId:task.id,kind:"messages",afterId:"large",limit:50}).entries).toEqual([task.messages[2]]);expect(store.getTask(task.id).messages[1].text.length).toBe(conversationPageBytes+1);const exact={...task.messages[1],id:"exact",text:""};exact.text="x".repeat(conversationPageBytes-Buffer.byteLength(JSON.stringify([exact])));task.messages=[exact,task.messages[2]];store.saveTask(task);const boundary=store.conversationPage({taskId:task.id,kind:"messages",fromId:"exact",limit:50});expect(boundary.entries).toEqual([exact]);expect(Buffer.byteLength(JSON.stringify(boundary.entries))).toBe(conversationPageBytes);expect(conversationWindow(task.messages,"start")).toEqual([exact]);}finally{store.close();}
 });
 it("retains contiguous renderer windows by UTF-8 bytes, count and requested edge",()=>{
  const entries=Array.from({length:8},(_,index)=>({id:"entry-"+index,role:"assistant" as const,text:"😀\n".repeat(100000),createdAt:"owned"}));
  expect(conversationWindow(entries,"start")).toEqual(entries.slice(0,3));expect(conversationWindow(entries,"end")).toEqual(entries.slice(5));expect(conversationWindow([],"end")).toEqual([]);
  const small=Array.from({length:150},(_,index)=>({...entries[0],id:String(index),text:"small"}));expect(conversationWindow(small,"start")).toEqual(small.slice(0,100));expect(conversationWindow(small,"end")).toEqual(small.slice(50));
  const large={...entries[0],text:"x".repeat(conversationPageBytes+1)};expect(conversationWindow([large,...small],"start")).toEqual([large]);expect(conversationWindow([...small,large],"end")).toEqual([large]);
 });

	it("reads bounded ordered pages around stable IDs without returning other task bodies", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			task.messages = Array.from({ length: 1000 }, (_, index) => ({ id: `message-${index}`, role: "user", text: `Literal 世界 ${index}`, createdAt: task.createdAt }));
			task.activities = Array.from({ length: 120 }, (_, index) => ({ id: `activity-${index}`, type: "tool", title: "Tool", text: "Sensitive output", status: "completed" }));
			store.saveTask(task);
			const view = store.getTaskView(task.id);
			expect(view.messages).toEqual(task.messages.slice(950));
			expect(view.activities).toEqual(task.activities.slice(70));
			expect(view.conversationCounts).toEqual({ messages: 1000, activities: 120 });
			expect(store.getTask(task.id).messages).toHaveLength(1000);
			const latest = store.conversationPage({ taskId: task.id, kind: "messages", limit: 50 });
			expect(latest).toMatchObject({ earlier: 950, later: 0, revision: task.revision });
			expect(latest.entries.map(value => value.id)).toEqual(task.messages.slice(950).map(value => value.id));
			expect(JSON.stringify(latest)).not.toContain("Sensitive output");
			const earlier = store.conversationPage({ taskId: task.id, kind: "messages", beforeId: "message-950", limit: 50 });
			expect(earlier).toMatchObject({ earlier: 900, later: 50 });
			expect(earlier.entries.map(value => value.id)).toEqual(task.messages.slice(900, 950).map(value => value.id));
			task.messages.push({ id: "newest", role: "assistant", text: "Appended", createdAt: task.createdAt }); store.saveTask(task);
			expect(store.conversationPage({ taskId: task.id, kind: "messages", beforeId: "message-950", limit: 50 }).entries).toEqual(earlier.entries);
			const newer = store.conversationPage({ taskId: task.id, kind: "messages", afterId: "message-949", limit: 50 });
			expect(newer).toMatchObject({ earlier: 950, later: 1 });
			expect(newer.entries).toEqual(latest.entries);
			expect(store.conversationPage({ taskId: task.id, kind: "messages", fromId: "message-900", limit: 100 }).entries).toEqual(task.messages.slice(900, 1000));
			expect(store.conversationPage({ taskId: task.id, kind: "messages", beforeId: "message-0", limit: 50 }).entries).toEqual([]);
			expect(store.conversationPage({ taskId: task.id, kind: "messages", afterId: "newest", limit: 50 }).entries).toEqual([]);
			expect(store.conversationPage({ taskId: task.id, kind: "activities", limit: 50 }).entries).toEqual(task.activities.slice(70));
		} finally { store.close(); }
	});
	it("distinguishes empty history, missing tasks and invalidated positions", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "chat" });
			expect(store.conversationPage({ taskId: task.id, kind: "activities", limit: 50 })).toMatchObject({ entries: [], earlier: 0, later: 0 });
			expect(store.getTaskView(task.id)).toMatchObject({ messages: [], activities: [], conversationCounts: { messages: 0, activities: 0 } });
			expect(() => store.conversationPage({ taskId: "missing", kind: "messages", limit: 50 })).toThrow("Task no longer exists");
			expect(() => store.conversationPage({ taskId: task.id, kind: "messages", beforeId: "missing", limit: 50 })).toThrow("position no longer exists");
		} finally { store.close(); }
	});
	it("rejects invalid bounds and ambiguous cursors", () => {
		const query = { taskId: "task", kind: "messages", limit: 50 };
		for (const patch of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { kind: "queue" }, { taskId: "" }, { beforeId: "" }, { afterId: "x".repeat(201) }, { fromId: "" }, { fromId: "first", beforeId: "one" }, { beforeId: "one", afterId: "two" }]) expect(() => validateConversationPageQuery({ ...query, ...patch })).toThrow("Invalid conversation page");
	});
});
