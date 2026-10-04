import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
const native=vi.hoisted(()=>({models:vi.fn()}));
vi.mock("./grokModelCatalog",()=>({grokModelCatalog:native.models}));
import { WorkspaceRuntime } from "./workspaceRuntime";
const models=[{id:"native",name:"Native",default:true,reasoningEfforts:[{id:"high",description:"High"},{id:"low",description:"Low"}]}];
beforeEach(()=>{native.models.mockReset();native.models.mockResolvedValue(models);});
describe("initial Grok reasoning",()=>{
 it("waits for bounded discovery during shutdown and rejects late creation",async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"phaseo-grok-shutdown-")),runtime=new WorkspaceRuntime(directory);let release!:(value:typeof models)=>void,closing:Promise<void>|undefined;native.models.mockReturnValueOnce(new Promise(resolve=>{release=resolve}));const apply=vi.spyOn(runtime.store,"apply");
  try{const creation=runtime.command({type:"create-task",harness:"grok",model:"native",mode:"plan",reasoningEffort:"high"}),rejected=expect(creation).rejects.toThrow("shutting down");await vi.waitFor(()=>expect(native.models).toHaveBeenCalled());let closed=false;closing=runtime.close().then(()=>{closed=true});await Promise.resolve();expect(closed).toBe(false);release(models);await rejected;await closing;expect(apply).not.toHaveBeenCalled();}
  finally{release?.(models);await (closing??runtime.close());rmSync(directory,{recursive:true,force:true});}
 });
 it("validates and persists creation, import and handoff catalogues",async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"phaseo-grok-settings-")),runtime=new WorkspaceRuntime(directory);
  try{
   const created=await runtime.command({type:"create-task",harness:"grok",model:"default",mode:"plan",reasoningEffort:"high"});const id=created.tasks[0].id;
   expect(runtime.store.getTask(id)).toMatchObject({reasoningEffort:"high",nativeModels:models});
   const handed=await runtime.command({type:"handoff",id,harness:"grok",model:"native",mode:"code",reasoningEffort:"low"});expect(runtime.store.getTask(handed.tasks.find(task=>task.id!==id)!.id)).toMatchObject({parentId:id,reasoningEffort:"low",nativeModels:models});
   const imported=await runtime.importTask({type:"create-task",harness:"grok",model:"native",mode:"plan",reasoningEffort:"low"},{title:"Imported",harness:"grok",createdAt:"2026-10-04T00:00:00Z",messages:[],attachments:[]});expect(runtime.store.getTask(imported.taskId)).toMatchObject({reasoningEffort:"low",nativeModels:models});
   await runtime.command({type:"update-task",id,reasoningEffort:"low"});expect(runtime.store.getTask(id).reasoningEffort).toBe("low");expect(native.models).toHaveBeenCalledTimes(3);expect(native.models).toHaveBeenCalledWith(directory,undefined);
  }finally{await runtime.close();rmSync(directory,{recursive:true,force:true});}
 });
 it("rejects unavailable choices and discovery failure without creating tasks",async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"phaseo-grok-rejection-")),runtime=new WorkspaceRuntime(directory);
  try{
   for(const configuration of [{model:"missing",reasoningEffort:"high"},{model:"native",reasoningEffort:"missing"}])await expect(runtime.command({type:"create-task",harness:"grok",mode:"plan",...configuration})).rejects.toThrow("no longer offers");
   native.models.mockRejectedValueOnce(new Error("Discovery failed"));await expect(runtime.command({type:"create-task",harness:"grok",model:"native",mode:"plan",reasoningEffort:"high"})).rejects.toThrow("Discovery failed");
   await expect(runtime.command({type:"create-task",harness:"grok",accountId:"unavailable",model:"native",mode:"plan",reasoningEffort:"high"})).rejects.toThrow("Account is unavailable");expect(native.models).toHaveBeenCalledTimes(3);expect(runtime.store.getOverview().tasks).toHaveLength(0);
  }finally{await runtime.close();rmSync(directory,{recursive:true,force:true});}
 });
 it("delivers initial reasoning on the first turn and preserves default creation without discovery",async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"phaseo-grok-turn-")),run=vi.fn(async()=>{}),runtime=new WorkspaceRuntime(directory,()=>({run,cancel:async()=>{}}));
  try{const defaults=await runtime.command({type:"create-task",harness:"grok",model:"default",mode:"plan"});expect(native.models).not.toHaveBeenCalled();expect(runtime.store.getTask(defaults.tasks[0].id).reasoningEffort).toBeUndefined();const created=await runtime.command({type:"create-task",harness:"grok",model:"native",mode:"plan",reasoningEffort:"high"});const id=created.tasks.find(task=>task.id!==defaults.tasks[0].id)!.id;await runtime.command({type:"send",id,text:"Plan"});await vi.waitFor(()=>expect(run).toHaveBeenCalledOnce());expect(run.mock.calls[0]).toEqual(expect.arrayContaining([expect.objectContaining({harness:"grok",reasoningEffort:"high",nativeModels:models})]));}
  finally{await runtime.close();rmSync(directory,{recursive:true,force:true});}
 });
});
