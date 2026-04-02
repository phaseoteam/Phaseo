const fs = require("fs");
const path = require("path");
function readEnv(file){ const out={}; const txt=fs.readFileSync(file,'utf8'); for(const line of txt.split(/\r?\n/)){ const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if(!m) continue; let v=m[2].trim(); if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); out[m[1]]=v;} return out; }
(async()=>{
 const envLocal=readEnv(path.join(process.cwd(),'.env.local'));
 const dev=readEnv(path.join(process.cwd(),'.dev.vars'));
 const key=(envLocal.GATEWAY_API_KEY||'').trim();
 const internal=(dev.GATEWAY_INTERNAL_TEST_TOKEN||'').trim();
 for (let i=1;i<=10;i++){
  const res=await fetch('http://127.0.0.1:8787/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`,'x-aistats-testing-mode':'1','x-aistats-internal-token':internal},body:JSON.stringify({model:'google/lyria-3-pro-preview',messages:[{role:'user',content:'Create a short upbeat synth-pop instrumental loop with no lyrics.'}],modalities:['text','audio'],max_output_tokens:256,usage:true,meta:true})});
  const text=await res.text();
  let json=null; try{json=text?JSON.parse(text):null;}catch{json={raw:text};}
  const audios=Array.isArray(json?.choices?.[0]?.message?.audios)?json.choices[0].message.audios:[];
  const content=json?.choices?.[0]?.message?.content;
  const textLen=typeof content==='string'?content.length:Array.isArray(content)?content.filter((p)=>typeof p?.text==='string').map((p)=>p.text).join('').length:0;
  console.log(JSON.stringify({i,status:res.status,audioCount:audios.length,textLen,error:json?.error??null,description:json?.description??null},null,2));
 }
})();
