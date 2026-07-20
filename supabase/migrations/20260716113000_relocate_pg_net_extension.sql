-- Supabase's security advisor reports extensions whose catalog namespace is
-- public even when the extension creates its runtime objects in another schema.
-- pg_net is not relocatable, so move it by recreating it with extensions as its
-- catalog namespace. Refuse to proceed if doing so could discard queued work.

create schema if not exists extensions;

lock table net.http_request_queue in access exclusive mode;
lock table net._http_response in access exclusive mode;

do $migration$
begin
  if exists (select 1 from net.http_request_queue)
     or exists (select 1 from net._http_response) then
    raise exception
      using message = 'Cannot relocate pg_net while HTTP requests or responses are pending',
            hint = 'Retry this migration after the pg_net request and response tables are empty.';
  end if;
end
$migration$;

drop extension pg_net;
create extension pg_net with schema extensions;
