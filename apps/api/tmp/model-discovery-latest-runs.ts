import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envRaw = fs.readFileSync("apps/api/.dev.vars", "utf8");
const env: Record<string, string> = {};
for (const line of envRaw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const key = t.slice(0, eq).trim();
  let value = t.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient("https://xansbgjaduxypzsmjwct.supabase.co", serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from("model_discovery_runs")
  .select("id,status,error,started_at,finished_at,providers_total,providers_success,providers_skipped,providers_error,changes_count,summary")
  .order("started_at", { ascending: false })
  .limit(3);

if (error) throw error;
const out = (data ?? []).map((r: any) => ({
  id: r.id,
  status: r.status,
  error: r.error,
  started_at: r.started_at,
  finished_at: r.finished_at,
  providers_total: r.providers_total,
  providers_success: r.providers_success,
  providers_skipped: r.providers_skipped,
  providers_error: r.providers_error,
  changes_count: r.changes_count,
  summary_error: r.summary?.error ?? null,
  summary_notification_error: r.summary?.notificationError ?? null,
}));
console.log(JSON.stringify(out, null, 2));
