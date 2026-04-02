const fs = require("fs");
const path = require("path");
function readEnv(file){ const out={}; const txt=fs.readFileSync(file,'utf8'); for (const line of txt.split(/\r?\n/)) { const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if(!m) continue; let v=m[2].trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); out[m[1]]=v; } return out; }

(async()=>{
  const env=readEnv(path.join(process.cwd(),'.dev.vars'));
  const key=(env.GOOGLE_AI_STUDIO_API_KEY||'').trim();
  const models=['lyria-3-pro-preview','lyria-3-clip-preview'];
  for (const model of models){
    const stats=[];
    for (let i=1;i<=5;i++){
      const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
        method:'POST',
        headers:{'content-type':'application/json','x-goog-api-key':key},
        body:JSON.stringify({
          contents:[{parts:[{text:'Create a short upbeat synth-pop instrumental loop with no lyrics.'}]}],
          generationConfig:{responseModalities:['AUDIO','TEXT'],maxOutputTokens:256}
        })
      });
      const text=await res.text();
      let json=null;
      try{json=text?JSON.parse(text):null;}catch{json={raw:text};}
      const parts=json?.candidates?.[0]?.content?.parts;
      const audioParts=Array.isArray(parts)?parts.filter((p)=>String(p?.inlineData?.mimeType??p?.inline_data?.mime_type??'').toLowerCase().startsWith('audio/')):[];
      const textParts=Array.isArray(parts)?parts.filter((p)=>typeof p?.text==='string'&&p.text.trim()):[];
      stats.push({
        i,
        status:res.status,
        audioParts:audioParts.length,
        textParts:textParts.length,
        finishReason:json?.candidates?.[0]?.finishReason??null,
        error:json?.error?.message??null,
        firstText:textParts[0]?.text?.slice?.(0,80)??null,
        firstAudioMime:audioParts[0]?.inlineData?.mimeType ?? audioParts[0]?.inline_data?.mime_type ?? null,
      });
      console.log(JSON.stringify({model,...stats[stats.length-1]},null,2));
    }
    const summary={
      model,
      total:stats.length,
      ok:stats.filter((s)=>s.status===200).length,
      okWithAudio:stats.filter((s)=>s.status===200&&s.audioParts>0).length,
      okTextOnly:stats.filter((s)=>s.status===200&&s.audioParts===0&&s.textParts>0).length,
      upstream500:stats.filter((s)=>s.status===500).length,
    };
    console.log('SUMMARY '+JSON.stringify(summary));
  }
})();
