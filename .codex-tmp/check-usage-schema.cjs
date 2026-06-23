(async () => {
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const appRequire = createRequire(path.join(process.cwd(), 'apps/web/package.json'));
const envPath = path.join(process.cwd(), 'apps/web/.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const { createClient } = appRequire('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
function summarize(label, result) {
  const err = result.error;
  console.log(`\n${label}`);
  if (err) console.log(JSON.stringify({ code: err.code, message: err.message, details: err.details, hint: err.hint }, null, 2));
  else console.log(JSON.stringify({ ok: true, rows: result.data?.length ?? null, count: result.count ?? null, sampleKeys: result.data?.[0] ? Object.keys(result.data[0]) : [] }, null, 2));
}
const normalized = 'usage_total_tokens,usage_input_tokens,usage_output_tokens,usage_reasoning_tokens,usage_cached_read_tokens,usage_cached_write_tokens';
const appJoin = await supabase.from('gateway_requests').select(`request_id,created_at,endpoint,model_id,requested_model_id,routed_model_id,provider,native_response_id,stream,session_id,app_id,app:api_apps!gateway_requests_app_id_fkey (id,app_key,title,image_url),usage,${normalized},cost_nanos,generation_ms,latency_ms,finish_reason,pricing_lines,provider_attempts,success,status_code,error_code,error_message,error_payload,detail_metadata,key_id,throughput`, { count: 'exact' }).limit(1);
summarize('appJoin', appJoin);
const noJoin = await supabase.from('gateway_requests').select(`request_id,created_at,endpoint,model_id,requested_model_id,routed_model_id,provider,native_response_id,stream,session_id,app_id,usage,${normalized},cost_nanos,generation_ms,latency_ms,finish_reason,pricing_lines,provider_attempts,success,status_code,error_code,error_message,error_payload,detail_metadata,key_id,throughput`, { count: 'exact' }).limit(1);
summarize('noJoinNormalized', noJoin);
const legacy = await supabase.from('gateway_requests').select(`request_id,created_at,endpoint,model_id,requested_model_id,routed_model_id,provider,native_response_id,stream,session_id,app_id,usage,cost_nanos,generation_ms,latency_ms,finish_reason,pricing_lines,provider_attempts,success,status_code,error_code,error_message,error_payload,detail_metadata,key_id,throughput`, { count: 'exact' }).limit(1);
summarize('legacy', legacy);
const minimal = await supabase.from('gateway_requests').select(`request_id,created_at,endpoint,model_id,provider,stream,app_id,usage,cost_nanos,generation_ms,latency_ms,finish_reason,success,key_id`, { count: 'exact' }).limit(1);
summarize('minimal', minimal);
})().catch((error) => { console.error(error); process.exit(1); });
