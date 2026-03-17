const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const txt = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const line = txt.split(/\r?\n/).find((l) => new RegExp('^\\s*' + k + '\\s*=').test(l));
  if (!line) return null;
  return line.split('=').slice(1).join('=').trim().replace(/^['\"]|['\"]$/g, '');
};

const url = get('NEXT_PUBLIC_SUPABASE_URL');
const key = get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !key) throw new Error('missing Supabase env');
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const refIds = ['pi_3TBYUvApMI3eplRu066gXsI5', 'pi_3TBYUwApMI3eplRu0fkxxqUi'];

(async () => {
  const { data, error } = await supabase
    .from('credit_ledger')
    .select('ref_id,team_id,kind,status,amount_nanos,event_time')
    .in('ref_id', refIds)
    .eq('ref_type', 'Stripe_Payment_Intent');

  if (error) {
    console.error('query_error=' + error.message);
    process.exit(1);
  }

  console.log('ledger_rows=' + (data?.length ?? 0));
  for (const row of data ?? []) {
    console.log(JSON.stringify(row));
  }
})();
