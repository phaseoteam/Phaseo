const fs = require("fs");
const path = require("path");
function readEnv(file) {
  const out = {};
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1,-1);
    out[m[1]] = v;
  }
  return out;
}
(async () => {
  const env = readEnv(path.join(process.cwd(), '.dev.vars'));
  const key = (env.GOOGLE_AI_STUDIO_API_KEY || '').trim();
  const variants = [
    'https://generativelanguage.googleapis.com/v1beta',
    'https://generativelanguage.googleapis.com/v1',
  ];
  const model = 'lyria-3-pro-preview';
  for (const base of variants) {
    const endpoints = [
      `${base}/models/${model}:generateContent`,
      `${base}/models/${model}:streamGenerateContent?alt=sse`,
    ];
    for (const url of endpoints) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Create a short upbeat synth-pop instrumental loop.' }] }],
          generationConfig: { responseModalities: ['AUDIO','TEXT'], maxOutputTokens: 256 },
        }),
      });
      const text = await res.text();
      console.log(JSON.stringify({ base, endpoint: url.includes('streamGenerateContent') ? 'streamGenerateContent' : 'generateContent', status: res.status, preview: text.slice(0, 220) }, null, 2));
    }
  }
})();
