require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const { data: wallet, error: we } = await supabase
    .from('wallets')
    .select('team_id,stripe_customer_id,balance_nanos,auto_top_up_enabled,auto_top_up_account_id,low_balance_threshold,auto_top_up_amount')
    .eq('team_id', '6108396e-0e12-425d-91ff-a02d39a346e0')
    .maybeSingle();
  if(we){ console.error('wallet_error='+we.message); process.exit(1); }
  const { data: ledger, error: le } = await supabase
    .from('credit_ledger')
    .select('team_id,kind,amount_nanos,before_balance_nanos,after_balance_nanos,ref_type,ref_id,status,event_time')
    .eq('ref_type','Stripe_Payment_Intent')
    .eq('ref_id', 'pi_3TBYkxApMI3eplRu0wnjcVIJ')
    .order('event_time',{ascending:false});
  if(le){ console.error('ledger_error='+le.message); process.exit(1); }
  console.log('wallet=' + JSON.stringify(wallet));
  console.log('ledger_rows=' + (ledger?.length ?? 0));
  for (const row of ledger ?? []) console.log(JSON.stringify(row));
})();
