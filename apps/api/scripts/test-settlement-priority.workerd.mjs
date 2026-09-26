import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), runtimeRequire = createRequire(require.resolve("wrangler/package.json"));
const { build } = runtimeRequire("esbuild"), { Miniflare } = runtimeRequire("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const fixtures = {
    state: `import {AsyncLocalStorage} from 'node:async_hooks'; export const scope=new AsyncLocalStorage();
        export const event=async name=>{const s=scope.getStore();s.events.push(name);if(name===s.stall)await s.gate;};`,
    env: `import {scope,event} from 'fixture-state';
        export const getBindingsIfConfigured=()=>undefined;
        export const getSupabaseAdmin=()=>{throw new Error('Unexpected source call in local fixture');};
        export const ensureRuntimeForBackground=()=>()=>scope.getStore().events.push('release');
        export const dispatchBackground=p=>{scope.getStore().tasks.push(p);void p.catch(()=>{});};
        export const getResponseCache=()=>({set:()=>event('cache')});`,
    charge: `import {event} from 'fixture-state';export const recordUsageAndChargeOnce=()=>event('charge');`,
    audit: `import {event} from 'fixture-state';export const handleSuccessAudit=()=>event('audit');export const handleFailureAudit=()=>event('failed-audit');`,
    tokens: `import {event} from 'fixture-state';export const recordManagedProviderTokensOnce=()=>event('tokens');`,
    sticky: `import {event} from 'fixture-state';export const maybeWriteStickyRoutingFromUsage=()=>event('sticky');export const resolveCacheAwareRoutingPreference=()=>true;`,
    guards: `export const guardUpstreamStatus=async()=>({ok:true});`,
    pricing: `export const loadProviderPricing=async()=>null;export const calculatePricing=usage=>({pricedUsage:usage,totalNanos:10,totalCents:0,currency:'USD'});`,
    plugins: `export const applyResponsePlugins=async({payload})=>({payload,executions:[]});`,
    health: `export const classifyProviderHealthImpact=()=> 'success';export const onCallEnd=()=>{};export const reportProbeResult=()=>{};export const maybeOpenOnRecentErrors=()=>{};`,
};
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false, external: ["node:*"],
    plugins: [{ name: "local-accounting-boundaries", setup(b) {
        b.onResolve({ filter: /^fixture-state$/ }, () => ({ path: "state", namespace: "fixture" }));
        const aliases = { "@/runtime/env": "env", "@core/provider-rate-limits": "tokens", "@/plugins/registry": "plugins" };
        b.onResolve({ filter: /.*/ }, args => {
            if (aliases[args.path]) return { path: aliases[args.path], namespace: "fixture" };
            if (!/[\\/]pipeline[\\/]after[\\/](index|stream)\.ts$/.test(args.importer)) return;
            const name = ({ "./charge": "charge", "./audit": "audit", "./guards": "guards", "./pricing": "pricing",
                "../execute/sticky-routing": "sticky", "../execute/health": "health" })[args.path];
            if (name) return { path: name, namespace: "fixture" };
        });
        b.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "ts", resolveDir: root }));
    } }], stdin: { resolveDir: root, loader: "ts", contents: `
        import {scope} from 'fixture-state';
        import {finalizeRequest} from './src/pipeline/after/index';
        import {handleStreamResponse} from './src/pipeline/after/stream';
        export default {fetch(request){
            const mode=new URL(request.url).pathname.slice(1);let release;
            const state={events:[],tasks:[],stall:mode==='buffer-cache'?'cache':'sticky',gate:new Promise(r=>release=r)};
            return scope.run(state,async()=>{
                const ctx={requestId:'fixture',billingRequestId:'billing',workspaceId:'workspace',endpoint:'chat.completions',protocol:'openai.chat.completions',
                    model:'fixture/model',body:{},meta:{},timer:{span:(_name,fn)=>fn()},
                    responseCache:{enabled:true,status:'miss',key:'fixture-cache',fingerprint:'fingerprint',ttlSeconds:60}};
                const bill={cost_cents:0,currency:'USD',usage:null,finish_reason:'stop',upstream_id:'fixture'};
                let response;
                if(mode.startsWith('buffer')){
                    response=await finalizeRequest({pre:{ctx},exec:{result:{provider:'fixture',upstream:new Response('{}'),bill,normalized:{
                        id:'fixture',choices:[{message:{role:'assistant',content:'hello'},finish_reason:'stop'}],usage:{input_tokens:11,output_tokens:4,total_tokens:15}}}}});
                }else{
                    ctx.stream=true;
                    const chunk={object:'chat.completion.chunk',choices:[{delta:{content:'hello'},finish_reason:'stop'}],
                        ...(mode==='stream-usage'?{usage:{prompt_tokens:11,completion_tokens:4,total_tokens:15}}:{})};
                    const upstream=new Response('data: '+JSON.stringify(chunk)+'\\n\\ndata: [DONE]\\n\\n');
                    response=await handleStreamResponse(ctx,{provider:'openai',kind:'stream',stream:upstream.body,upstream,bill,
                        usageFinalizer:async()=>mode==='stream-finalizer'?{...bill,usage:{input_tokens:11,output_tokens:4}}:null},null);
                }
                const body=response.text();
                try{
                    for(let i=0;i<100&&!state.events.includes(state.stall);i++)await new Promise(r=>setTimeout(r,1));
                    const beforeRelease=[...state.events];
                    release();await body;await Promise.allSettled(state.tasks);
                    return Response.json({beforeRelease,afterRelease:state.events,status:response.status});
                }finally{release();}
            });
        }};
    ` } });
const runtime = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"] });
try {
    for (const mode of ["buffer-cache", "buffer-sticky", "stream-usage", "stream-finalizer", "stream-fallback"]) {
        const response = await runtime.dispatchFetch(`https://fixture/${mode}`);
        assert.equal(response.status, 200, await response.clone().text());
        const result = await response.json();
        assert.equal(result.status, 200);
        assert.deepEqual(result.beforeRelease.slice(0, 3), ["charge", "tokens", "audit"], mode);
        assert.ok(result.beforeRelease.includes(mode === "buffer-cache" ? "cache" : "sticky"), mode);
        assert.ok(!result.beforeRelease.includes("release"), mode);
        for (const event of ["charge", "tokens", "audit", "sticky", "release"]) assert.equal(result.afterRelease.filter(x => x === event).length, 1, `${mode}:${event}`);
        assert.equal(result.afterRelease.filter(x => x === "cache").length, mode.startsWith("buffer") ? 1 : 0);
    }
    console.log("PASS: five native buffered/streaming paths finalize accounting before stalled advisory writes; no added attempts or runtime-release leaks");
} finally { await runtime.dispose(); }
