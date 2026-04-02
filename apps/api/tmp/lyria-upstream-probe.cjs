const fs = require("fs");
const path = require("path");

function readEnv(file) {
  const out = {};
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

(async () => {
  const env = readEnv(path.join(process.cwd(), ".dev.vars"));
  const key = (env.GOOGLE_AI_STUDIO_API_KEY || "").trim();
  if (!key) throw new Error("missing GOOGLE_AI_STUDIO_API_KEY in .dev.vars");

  const base = "https://generativelanguage.googleapis.com/v1beta";
  const models = ["lyria-3-pro-preview", "lyria-3-clip-preview"];
  const cases = [
    { name: "audio_only", cfg: { responseModalities: ["AUDIO"] } },
    { name: "text_audio", cfg: { responseModalities: ["TEXT", "AUDIO"] } },
    { name: "text_only", cfg: { responseModalities: ["TEXT"] } },
    { name: "no_modalities", cfg: {} },
  ];

  for (const model of models) {
    for (const c of cases) {
      const body = {
        contents: [{ role: "user", parts: [{ text: "Compose a 4-bar upbeat synth hook and describe the mood briefly." }] }],
        generationConfig: {
          ...c.cfg,
          maxOutputTokens: 256,
        },
      };
      const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
      const parts = json?.candidates?.[0]?.content?.parts;
      const hasAudio = Array.isArray(parts) && parts.some((p) =>
        String(p?.inlineData?.mimeType ?? p?.inline_data?.mime_type ?? "").toLowerCase().startsWith("audio/")
      );
      const hasText = Array.isArray(parts) && parts.some((p) => typeof p?.text === "string" && p.text.trim());
      console.log(JSON.stringify({
        model,
        case: c.name,
        status: res.status,
        hasAudio,
        hasText,
        error: json?.error?.message ?? null,
        preview: text.slice(0, 220),
      }, null, 2));
    }
  }
})();
