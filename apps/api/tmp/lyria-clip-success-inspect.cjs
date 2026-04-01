const fs = require("fs");
const path = require("path");
function readEnv(file){ const out={}; const txt=fs.readFileSync(file,'utf8'); for(const line of txt.split(/\r?\n/)){ const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if(!m) continue; let v=m[2].trim(); if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); out[m[1]]=v;} return out; }
(async()=>{
 const env=readEnv(path.join(process.cwd(),'.dev.vars')); const key=(env.GOOGLE_AI_STUDIO_API_KEY||'').trim();
 const model='lyria-3-clip-preview';
 for (let i=1;i<=30;i++){
  const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:'Create a short upbeat synth-pop instrumental loop with no lyrics.'}]}],generationConfig:{responseModalities:['AUDIO','TEXT'],maxOutputTokens:256}})});
  const text=await res.text();
  let json=null; try{json=text?JSON.parse(text):null;}catch{json={raw:text}};
  if (res.status!==200){ console.log(JSON.stringify({i,status:res.status,error:json?.error?.message??null},null,2)); continue; }
  const cand=json?.candidates?.[0]||{};
  const parts=Array.isArray(cand?.content?.parts)?cand.content.parts:[];
  const partSummaries=parts.map((p,idx)=>({idx,keys:Object.keys(p),mime:p?.inlineData?.mimeType??p?.inline_data?.mime_type??p?.fileData?.mimeType??p?.file_data?.mime_type??null,textPreview:typeof p?.text==='string'?p.text.slice(0,60):null,fileUri:p?.fileData?.fileUri??p?.file_data?.file_uri??null,inlineBytes:typeof (p?.inlineData?.data??p?.inline_data?.data)==='string' ? (p.inlineData?.data??p.inline_data?.data).length : 0}));
  console.log(JSON.stringify({i,status:res.status,finishReason:cand?.finishReason??null,partCount:parts.length,partSummaries,usage:json?.usageMetadata??null},null,2));
  break;
 }
})();
