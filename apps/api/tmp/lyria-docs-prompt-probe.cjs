const fs = require("fs");
const path = require("path");
function readEnv(file){ const out={}; const txt=fs.readFileSync(file,'utf8'); for(const line of txt.split(/\r?\n/)){ const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if(!m) continue; let v=m[2].trim(); if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); out[m[1]]=v;} return out; }
(async()=>{
 const env=readEnv(path.join(process.cwd(),'.dev.vars')); const key=(env.GOOGLE_AI_STUDIO_API_KEY||'').trim();
 const prompt='Create a 30-second cheerful acoustic folk song with guitar and harmonica.';
 for (const model of ['lyria-3-clip-preview','lyria-3-pro-preview']) {
  const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:['AUDIO','TEXT']}})});
  const text=await res.text(); let json=null; try{json=text?JSON.parse(text):null;}catch{json={raw:text}};
  const parts=json?.candidates?.[0]?.content?.parts;
  const audioCount=Array.isArray(parts)?parts.filter((p)=>String(p?.inlineData?.mimeType??p?.inline_data?.mime_type??'').toLowerCase().startsWith('audio/')).length:0;
  console.log(JSON.stringify({model,status:res.status,audioCount,error:json?.error?.message??null,preview:text.slice(0,220)},null,2));
 }
})();
