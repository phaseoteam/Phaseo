import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = "apps/api/.env.local";
if (fs.existsSync(envPath)) {
  const txt = fs.readFileSync(envPath, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log(JSON.stringify({ ok: false, reason: "missing_supabase_env" }, null, 2));
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from("gateway_generations")
  .select("request_id,provider,model_id,endpoint,usage,generation_ms,latency_ms,created_at,currency,usage_cents_text")
  .eq("endpoint", "audio.speech")
  .in("model_id", ["openai/gpt-4o-mini-tts", "gpt-4o-mini-tts"])
  .order("created_at", { ascending: false })
  .limit(12);

if (error) {
  console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(0);
}

console.log(JSON.stringify({ ok: true, count: data?.length ?? 0, rows: data }, null, 2));
