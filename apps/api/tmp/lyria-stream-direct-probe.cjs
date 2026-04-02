const fs = require("fs");
const path = require("path");
function readEnv(file){ const out={}; const txt=fs.readFileSync(file,'utf8'); for(const line of txt.split(/\r?\n/)){ const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if(!m) continue; let v=m[2].trim(); if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); out[m[1]]=v;} return out; }
function parseSse(raw){ return raw.split(/\n\n/).map((b)=>b.split(/\n/).filter((l)=>l.startsWith('data:')).map((l)=>l.slice(5).trimStart()).join('').trim()).filter(Boolean).map((d)=>{ if(d==='[DONE]') return d; try{return JSON.parse(d);}catch{return {raw:d};} }); }
(async()=>{
 const env=readEnv(path.join(process.cwd(),'.dev.vars')); const key=(env.GOOGLE_AI_STUDIO_API_KEY||'').trim();
 const prompt='Create a 30-second cheerful acoustic folk song with guitar and harmonica.';
 for (const model of ['lyria-3-clip-preview','lyria-3-pro-preview']) {
  const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:['AUDIO','TEXT']}})});
  const text=await res.text();
  const events=parseSse(text).filter((e)=>e&&e!=='[DONE]');
  const hasAudio=events.some((e)=>Array.isArray(e?.candidates?.[0]?.content?.parts) && e.candidates[0].content.parts.some((p)=>String(p?.inlineData?.mimeType??p?.inline_data?.mime_type??'').toLowerCase().startsWith('audio/')));
  const hasText=events.some((e)=>Array.isArray(e?.candidates?.[0]?.content?.parts) && e.candidates[0].content.parts.some((p)=>typeof p?.text==='string'&&p.text.trim()));
  console.log(JSON.stringify({model,status:res.status,eventCount:events.length,hasAudio,hasText,preview:text.slice(0,220)},null,2));
 }
})();
