import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { builtinModules } from "node:module";
import { build } from "vite";
const directory=mkdtempSync(path.join(tmpdir(),"phaseo-claude-catalog-")),profile=path.join(directory,"profile"),project=path.join(directory,"project");mkdirSync(profile);mkdirSync(path.join(project,".claude","commands"),{recursive:true});
const requests=[];const server=createServer((request,response)=>{requests.push(request.url);request.resume();response.writeHead(500,{"content-type":"application/json"});response.end(JSON.stringify({error:{type:"api_error",message:"Owned catalog fixture forbids inference."}}));});
try { await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));writeFileSync(path.join(profile,"settings.json"),JSON.stringify({disableAllHooks:true,env:{ANTHROPIC_API_KEY:"owned-test-only",ANTHROPIC_BASE_URL:"http://127.0.0.1:"+server.address().port,CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:"1"}}));writeFileSync(path.join(project,".claude","commands","owned-brief.md"),"---\ndescription: Owned catalog brief\nargument-hint: <topic>\n---\nExplain $ARGUMENTS clearly.\n");
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");const output=path.join(directory,"bundle");await build({configFile:false,root,logLevel:"silent",build:{outDir:output,emptyOutDir:true,lib:{entry:path.join(root,"src/main/claudeNativeActions.ts"),formats:["es"],fileName:()=>"catalog.mjs"},rollupOptions:{external:[...builtinModules,...builtinModules.map(name=>"node:"+name)]}}});
 const {claudeNativeActions}=await import(pathToFileURL(path.join(output,"catalog.mjs")).href);const catalog=await claudeNativeActions(project,AbortSignal.timeout(20000),{id:"owned",name:"Owned profile",kind:"native",harness:"claude",configured:true,configDirectory:profile});assert.ok(catalog.actions.some(action=>action.name==="owned-brief"&&action.description.includes("Owned catalog brief")));assert.ok(requests.every(url=>url==="/api/hello"),"Native discovery must not make an inference request.");console.log("CLAUDE_NATIVE_CATALOG_SMOKE",JSON.stringify({productionCatalog:true,installedNativeProcess:true,isolatedProfile:true,projectCommand:true,commandCount:catalog.actions.length,inferenceRequests:0,startupRequests:requests.length}));
} finally {await new Promise(resolve=>server.close(resolve));}
