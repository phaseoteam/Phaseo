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
  const cases = ['lyria-3-pro-preview','lyria-3-clip-preview'];
  for (const model of cases) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        model,
        input: 'An upbeat synthwave instrumental with bright arpeggios and punchy drums.',
        response_modalities: ['AUDIO','TEXT'],
      }),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    const outputs = Array.isArray(json?.outputs) ? json.outputs : [];
    const hasAudio = outputs.some((o) => o?.type === 'audio' || o?.audio);
    const hasText = outputs.some((o) => o?.type === 'text' || typeof o?.text === 'string');
    console.log(JSON.stringify({ model, status: res.status, hasAudio, hasText, error: json?.error?.message ?? null, preview: text.slice(0, 260) }, null, 2));
  }
})();
