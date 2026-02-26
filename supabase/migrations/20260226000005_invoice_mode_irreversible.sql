-- Make invoice billing irreversible once enabled to prevent billing-mode abuse.

alter table public.teams
  add column if not exists invoice_mode_activated_at timestamptz null;

update public.teams
set invoice_mode_activated_at = coalesce(
  invoice_mode_activated_at,
  updated_at,
  (now() at time zone 'utc')
)
where coalesce(billing_mode, 'wallet') = 'invoice'
  and invoice_mode_activated_at is null;

create or replace function public.enforce_team_invoice_mode_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.billing_mode = 'invoice' then
    if new.invoice_mode_activated_at is null then
      new.invoice_mode_activated_at := (now() at time zone 'utc');
    end if;
    return new;
  end if;

  -- Once invoice mode has ever been activated for a team, disallow wallet mode.
  if new.billing_mode = 'wallet' then
    if tg_op = 'update'
       and (
         old.billing_mode = 'invoice'
         or old.invoice_mode_activated_at is not null
         or new.invoice_mode_activated_at is not null
       ) then
      raise exception using
        errcode = '23514',
        message = 'invoice_mode_locked',
        detail = 'Invoice mode cannot be switched back to wallet once enabled.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists teams_invoice_mode_lock on public.teams;
create trigger teams_invoice_mode_lock
before insert or update of billing_mode, invoice_mode_activated_at
on public.teams
for each row
execute function public.enforce_team_invoice_mode_lock();

alter table public.teams
  drop constraint if exists teams_invoice_mode_lock_check;

alter table public.teams
  add constraint teams_invoice_mode_lock_check
  check (invoice_mode_activated_at is null or billing_mode = 'invoice');

comment on column public.teams.invoice_mode_activated_at
  is 'Set the first time team billing enters invoice mode. Non-null means invoice mode is permanently locked on.';
