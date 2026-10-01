// Offline UI fixture: no auth, provider requests, or real billing mutations.
const { createRequire } = require("node:module");
const path = require("node:path");
const fs = require("node:fs/promises");
const http = require("node:http");
const esbuild = createRequire(require.resolve("wrangler"))("esbuild");
const appRoot = path.resolve(__dirname, "..");

async function main() {
  const stub = `export async function loadReviewDetails(){return {evidence:{live_seconds:9,live_final:false,
    live_pending_responses:['resp_pending'],live_responses:Array.from({length:20},(_,i)=>({id:'resp_fixture_'+i,
    model:'gpt-5.6-luna',service_tier:'default',usage:{input_tokens:100,cached_read_text_tokens:50,output_tokens:20}})),
    live_tool_calls:[{id:'tool_done',done:true}]},decisions:[]};}
    export async function decideReview(...args){window.fixtureDecisions.push(args);return {error:null};}`;
  const bundle = await esbuild.build({ absWorkingDir: appRoot, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    stdin: { resolveDir: appRoot, loader: "tsx", contents: `import {createRoot} from 'react-dom/client';
      import {BillingReviews} from './src/app/(dashboard)/internal/realtime-billing/BillingReviews';
      window.fixtureDecisions=[];const reviews=Array.from({length:30},(_,i)=>({session_id:'rt_fixture_'+i,workspace_id:'fixture-workspace',status:'open',
        access_blocked:true,version:1,opened_at:'2026-09-11T12:00:00Z',review_due_at:'2026-09-12T12:00:00Z',attempts:1,
        last_attempt_at:null,recovery_error:null,confirmed_cost_nanos:i===1?null:7500000,evidence_complete:false,
        session:{provider:'openai',model_id:'openai/gpt-live-1',user_id:'fixture-user',provider_session_id:'live_fixture',
          reserved_nanos:5000000000,captured_nanos:0,released_nanos:0,disconnect_reason:'missing_final_usage'}}));
      createRoot(document.getElementById('root')).render(<main style={{padding:24}}><h1>Realtime billing review</h1><BillingReviews reviews={reviews}/></main>);` },
    plugins: [{ name: "offline", setup(build) {
      build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "offline" }));
      build.onResolve({ filter: /^\.\/actions$/ }, args => args.importer.includes("realtime-billing") ? { path: "actions", namespace: "offline" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "offline" }, args => ({ contents: args.path === "actions" ? stub : "export const useRouter=()=>({refresh(){}});", loader: "js" }));
    } }],
  });
  const cssPath = path.join(appRoot, "src/app/globals.css");
  const { css } = await require("postcss")([require("@tailwindcss/postcss")()]).process(await fs.readFile(cssPath, "utf8"), { from: cssPath });
  const server = http.createServer((request, response) => {
    if (request.url === "/bundle.js") { response.setHeader("content-type", "text/javascript"); response.end(bundle.outputFiles[0].text); }
    else if (request.url === "/style.css") { response.setHeader("content-type", "text/css"); response.end(css); }
    else { response.setHeader("content-type", "text/html"); response.end('<html class="dark"><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
  });
  server.listen(3112, "127.0.0.1", () => console.log("Offline billing fixture: http://127.0.0.1:3112"));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
