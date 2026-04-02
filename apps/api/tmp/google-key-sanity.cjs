const fs = require("fs");
const path = require("path");
function readEnv(file){ const out={}; const txt=fs.readFileSync(file,'utf8'); for (const line of txt.split(/\r?\n/)) { const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if(!m) continue; let v=m[2].trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); out[m[1]]=v; } return out; }
(async()=>{
 const env=readEnv(path.join(process.cwd(),'.dev.vars')); const key=(env.GOOGLE_AI_STUDIO_API_KEY||'').trim();
 const cases=[
  { model:'gemini-2.5-flash', body:{ contents:[{parts:[{text:'Say hello in 5 words.'}]}], generationConfig:{maxOutputTokens:32} } },
  { model:'lyria-3-pro-preview', body:{ contents:[{parts:[{text:'Create a 30-second cheerful acoustic folk song with guitar and harmonica.'}]}], generationConfig:{responseModalities:['AUDIO','TEXT']} } },
 ];
 for (const c of cases){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`;
  const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify(c.body)});
  const text=await res.text(); let parsed=null; try{parsed=text?JSON.parse(text):null;}catch{parsed={raw:text}};
  console.log(JSON.stringify({model:c.model,status:res.status,error:parsed?.error?.message??null,preview:text.slice(0,200)},null,2));
 }
})();
