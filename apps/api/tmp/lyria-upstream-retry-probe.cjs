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
  const base = "https://generativelanguage.googleapis.com/v1beta";
  const model = "lyria-3-pro-preview";

  for (let i = 1; i <= 10; i++) {
    const body = {
      contents: [{ role: "user", parts: [{ text: "Create a short upbeat synth-pop instrumental loop." }] }],
      generationConfig: {
        responseModalities: ["AUDIO", "TEXT"],
        maxOutputTokens: 256,
      },
    };

    const res = await fetch(`${base}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    const parts = json?.candidates?.[0]?.content?.parts;
    const audioCount = Array.isArray(parts)
      ? parts.filter((p) => String(p?.inlineData?.mimeType ?? p?.inline_data?.mime_type ?? "").toLowerCase().startsWith("audio/")).length
      : 0;
    const textCount = Array.isArray(parts)
      ? parts.filter((p) => typeof p?.text === "string" && p.text.trim()).length
      : 0;
    console.log(JSON.stringify({ i, status: res.status, audioCount, textCount, error: json?.error?.message ?? null, finishReason: json?.candidates?.[0]?.finishReason ?? null }, null, 2));
  }
})();
