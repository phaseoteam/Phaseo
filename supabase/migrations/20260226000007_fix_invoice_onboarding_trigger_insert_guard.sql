-- Harden invoice onboarding trigger logic for insert/update paths.

create or replace function public.enforce_team_invoice_onboarding_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'insert' then
    if new.billing_mode = 'invoice'
       and coalesce(new.invoice_onboarding_status, 'none') not in ('pre_invoice', 'completed') then
      raise exception using
        errcode = '23514',
        message = 'invoice_invite_required',
        detail = 'Invoice mode activation requires pre_invoice authorization.';
    end if;
  elsif tg_op = 'update' then
    if new.billing_mode = 'invoice'
       and coalesce(old.billing_mode, 'wallet') <> 'invoice'
       and coalesce(old.invoice_onboarding_status, 'none') <> 'pre_invoice'
       and coalesce(new.invoice_onboarding_status, 'none') not in ('pre_invoice', 'completed') then
      raise exception using
        errcode = '23514',
        message = 'invoice_invite_required',
        detail = 'Invoice mode activation requires pre_invoice authorization.';
    end if;
  end if;

  if new.billing_mode = 'invoice'
     and coalesce(new.invoice_onboarding_status, 'none') <> 'completed' then
    new.invoice_onboarding_status := 'completed';
  end if;

  return new;
end;
$$;
