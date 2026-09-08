-- Run inside BEGIN/ROLLBACK with SET LOCAL phaseo.test_workspace_id.
do $$
declare
  w uuid := current_setting('phaseo.test_workspace_id')::uuid;
  k uuid := gen_random_uuid();
  job text := 'key-cap-test-' || gen_random_uuid()::text;
  rid text;
  r record;
begin
  rid := 'video_hold:' || job;
  insert into public.keys(id,workspace_id,kid,hash,prefix,name,status,scopes,daily_limit_cost_nanos,created_by)
  values(k,w,substr(replace(k::text,'-',''),1,12),md5(k::text)||md5(k::text),
    'test','Rollback-only async limit test','active','["gateway:access"]',100,
    (select owner_user_id from public.workspaces where id=w));
  select * into r from public.gateway_wallet_reserve_once(w,rid,60,job,k,1);
  if not r.ok or not r.applied then raise exception 'initial hold failed: %',r.reason; end if;
  select * into r from public.gateway_wallet_reserve_once(w,rid,60,job,k,1);
  if not r.ok or r.applied then raise exception 'idempotent hold failed'; end if;
  if exists(select 1 from public.gateway_requests where key_id=k) then
    raise exception 'video hold created a synthetic inference request';
  end if;
  select * into r from public.gateway_wallet_reserve_once(w,rid||'-2',50,job||'-2',k,1);
  if r.ok or r.reason <> 'daily_cost_limit_reached' then raise exception 'outstanding video exposure ignored'; end if;
  select * into r from public.gateway_wallet_reserve_once(w,'batch_hold:'||job,50,job||'-batch',k,1);
  if r.ok or r.reason <> 'daily_cost_limit_reached' then raise exception 'batch ignored outstanding video exposure'; end if;
  insert into public.gateway_requests(workspace_id,request_id,endpoint,model_id,key_id,status_code,success,cost_nanos,currency)
  values(w,job,'video.generation','test/video',k,200,true,0,'USD');
  select * into r from public.gateway_wallet_reserve_once(w,rid||'-2',50,job||'-2',k,1);
  if r.ok or r.reason <> 'daily_cost_limit_reached' then raise exception 'zero-cost create audit removed exposure'; end if;
  select * into r from public.gateway_wallet_settle_once(w,rid,40,job);
  if not r.ok then raise exception 'settlement failed'; end if;
  select * into r from public.gateway_wallet_reserve_once(w,rid||'-2',61,job||'-2',k,1);
  if r.ok or r.reason <> 'daily_cost_limit_reached' then raise exception 'capture-to-audit gap ignored'; end if;
  update public.gateway_requests set cost_nanos=40 where workspace_id=w and request_id=job;
  select * into r from public.gateway_wallet_reserve_once(w,rid||'-2',60,job||'-2',k,1);
  if not r.ok then raise exception 'settled audit was double counted: %',r.reason; end if;
  select * into r from public.gateway_wallet_reserve_once(w,rid||'-3',1,job||'-3',k,1);
  if r.ok or r.reason <> 'daily_cost_limit_reached' then raise exception 'second outstanding hold ignored'; end if;
  perform public.gateway_wallet_release_once(w,rid||'-2',job||'-2');
  select * into r from public.gateway_wallet_reserve_once(w,rid||'-3',60,job||'-3',k,1);
  if not r.ok then raise exception 'released exposure retained'; end if;
  perform public.gateway_wallet_release_once(w,rid||'-3',job||'-3');
  update public.keys set daily_limit_requests=1 where id=k;
  select * into r from public.gateway_wallet_reserve_once(w,rid||'-4',1,job||'-4',k,1);
  if r.ok or r.reason <> 'daily_request_limit_reached' then raise exception 'request cap ignored'; end if;
end;
$$;
