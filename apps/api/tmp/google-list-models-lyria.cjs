const fs = require("fs");
const path = require("path");
function readEnv(file){ const out={}; const txt=fs.readFileSync(file,'utf8'); for(const line of txt.split(/\r?\n/)){ const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if(!m) continue; let v=m[2].trim(); if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); out[m[1]]=v;} return out; }
(async()=>{
 const env=readEnv(path.join(process.cwd(),'.dev.vars')); const key=(env.GOOGLE_AI_STUDIO_API_KEY||'').trim();
 const res=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',{headers:{'x-goog-api-key':key}});
 const text=await res.text(); let json=null; try{json=text?JSON.parse(text):null;}catch{json={raw:text}};
 const models=Array.isArray(json?.models)?json.models:[];
 const lyria=models.filter((m)=>String(m?.name||'').toLowerCase().includes('lyria')||String(m?.displayName||'').toLowerCase().includes('lyria'));
 console.log(JSON.stringify({status:res.status,total:models.length,lyriaCount:lyria.length,lyria:lyria.map((m)=>({name:m.name,displayName:m.displayName,supportedGenerationMethods:m.supportedGenerationMethods}))},null,2));
})();
