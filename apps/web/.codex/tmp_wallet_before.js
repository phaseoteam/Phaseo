require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key) throw new Error('missing supabase env');
const supabase=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
(async()=>{
  const { data, error } = await supabase
    .from('wallets')
    .select('team_id,stripe_customer_id,balance_nanos,auto_top_up_enabled,auto_top_up_account_id,low_balance_threshold,auto_top_up_amount')
    .eq('team_id', '6108396e-0e12-425d-91ff-a02d39a346e0')
    .maybeSingle();
  if(error){ console.error('error='+error.message); process.exit(1); }
  if(!data){ console.log('wallet_found=false'); process.exit(0); }
  console.log('wallet_found=true');
  console.log(JSON.stringify(data));
})();
