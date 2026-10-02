begin;

do $$
begin
  assert public.valid_key_ip_allowlist('[]'::jsonb);
  assert public.valid_key_ip_allowlist('[{"label":"Office","address":"203.0.113.1"},{"label":"Servers","address":"2001:db8::/32"}]'::jsonb);
  assert public.valid_key_ip_allowlist('[{"label":"Mapped","address":"::ffff:203.0.113.0/120"}]'::jsonb);
  assert not public.valid_key_ip_allowlist('[{"label":"","address":"203.0.113.1"}]'::jsonb);
  assert not public.valid_key_ip_allowlist('[{"label":"Office","address":"256.0.0.1"}]'::jsonb);
  assert not public.valid_key_ip_allowlist('[{"label":"Office","address":"127.1"}]'::jsonb);
  assert not public.valid_key_ip_allowlist('[{"label":"Office","address":"::/129"}]'::jsonb);
  assert not public.valid_key_ip_allowlist('[{"label":"Office","address":"1.2.3.4/33"}]'::jsonb);
  assert not public.valid_key_ip_allowlist('[{"address":"::1"}]'::jsonb);
  assert not public.valid_key_ip_allowlist('{}'::jsonb);
  assert not public.valid_key_ip_allowlist(null);
end;
$$;

rollback;
