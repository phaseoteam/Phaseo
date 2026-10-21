SET local check_function_bodies = off;

-- Phaseo Slack agent: installations, account links, monthly people and the month-end charge from credits.

CREATE TABLE "public"."slack_apps" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"       uuid                     NOT NULL,
  "slack_app_id"       text                     NOT NULL,
  "client_id"          text                     NOT NULL,
  "secrets_ciphertext" text                     NOT NULL,
  "created_by"         uuid,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_apps_client_id_check" CHECK ((client_id ~ '^[0-9]+\.[0-9]+$'::text)),
  CONSTRAINT "slack_apps_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "slack_apps_pkey" PRIMARY KEY (id),
  CONSTRAINT "slack_apps_secrets_check" CHECK ((length(secrets_ciphertext) > 0)),
  CONSTRAINT "slack_apps_slack_app_id_check" CHECK ((slack_app_id ~ '^A[A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_apps_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."slack_apps"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX slack_apps_slack_app_id_idx ON public.slack_apps USING btree (slack_app_id);

CREATE INDEX slack_apps_workspace_idx ON public.slack_apps USING btree (workspace_id);

CREATE TRIGGER slack_apps_set_updated_at
  BEFORE UPDATE ON public.slack_apps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."slack_apps"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_apps" IS 'A company''s own Slack app for the Phaseo Slack agent, created from Phaseo''s manifest, used instead of the hosted app. Only the settings API and the Slack Worker read it.';

COMMENT ON COLUMN "public"."slack_apps"."secrets_ciphertext" IS 'AES-GCM encrypted JSON {client_secret, signing_secret}, keyed by SLACK_SECRETS_ENCRYPTION_KEY. Never returned to clients.';

REVOKE ALL ON TABLE "public"."slack_apps" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."slack_apps" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_apps" FROM "anon", "authenticated";

CREATE TABLE "public"."slack_installations" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"            uuid                     NOT NULL,
  "slack_app_id"            uuid,
  "team_id"                 text,
  "team_name"               text,
  "enterprise_id"           text,
  "bot_user_id"             text                     NOT NULL,
  "secrets_ciphertext"      text                     NOT NULL,
  "key_id"                  uuid,
  "guardrail_id"            uuid,
  "model"                   text                     NOT NULL DEFAULT 'phaseo/auto'::text,
  "instructions"            text,
  "access_mode"             text                     NOT NULL DEFAULT 'everyone'::text,
  "usage_data_mode"         text                     NOT NULL DEFAULT 'dm'::text,
  "usage_data_channel_ids"  text[]                   NOT NULL DEFAULT '{}'::text[],
  "plan_people"             integer                  NOT NULL DEFAULT 3,
  "over_plan"               text                     NOT NULL DEFAULT 'refuse'::text,
  "max_people"              integer,
  "monthly_cap_nanos"       bigint                   NOT NULL,
  "answers_per_person_hour" integer                  NOT NULL DEFAULT 60,
  "allow_guests"            boolean                  NOT NULL DEFAULT true,
  "allow_external_users"    boolean                  NOT NULL DEFAULT false,
  "status"                  text                     NOT NULL DEFAULT 'active'::text,
  "installed_by"            uuid,
  "installed_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "uninstalled_at"          timestamp with time zone,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_installations_access_mode_check" CHECK ((access_mode = ANY (ARRAY['everyone'::text, 'linked'::text]))),
  CONSTRAINT "slack_installations_answers_per_person_hour_check" CHECK (((answers_per_person_hour >= 1) AND (answers_per_person_hour <= 10000))),
  CONSTRAINT "slack_installations_bot_user_id_check" CHECK ((bot_user_id ~ '^[UWB][A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_installations_enterprise_id_check" CHECK (((enterprise_id IS NULL) OR (enterprise_id ~ '^E[A-Z0-9]{2,31}$'::text))),
  CONSTRAINT "slack_installations_guardrail_id_fkey" FOREIGN KEY (guardrail_id) REFERENCES public.workspace_guardrails(id) ON DELETE SET NULL,
  CONSTRAINT "slack_installations_installed_by_fkey" FOREIGN KEY (installed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "slack_installations_instructions_check" CHECK (((instructions IS NULL) OR (length(instructions) <= 8000))),
  CONSTRAINT "slack_installations_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE SET NULL,
  CONSTRAINT "slack_installations_max_people_check" CHECK (((max_people IS NULL) OR (max_people >= 1))),
  CONSTRAINT "slack_installations_model_check" CHECK (((length(model) >= 1) AND (length(model) <= 200))),
  CONSTRAINT "slack_installations_monthly_cap_check" CHECK ((monthly_cap_nanos > 0)),
  CONSTRAINT "slack_installations_over_plan_check" CHECK ((over_plan = ANY (ARRAY['refuse'::text, 'move_up'::text]))),
  CONSTRAINT "slack_installations_pkey" PRIMARY KEY (id),
  CONSTRAINT "slack_installations_plan_people_check" CHECK (((plan_people >= 1) AND (plan_people <= 10000000))),
  CONSTRAINT "slack_installations_secrets_check" CHECK ((length(secrets_ciphertext) > 0)),
  CONSTRAINT "slack_installations_slack_app_id_fkey" FOREIGN KEY (slack_app_id) REFERENCES public.slack_apps(id) ON DELETE RESTRICT,
  CONSTRAINT "slack_installations_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'payment_due'::text, 'uninstalled'::text]))),
  CONSTRAINT "slack_installations_team_check" CHECK (((team_id IS NOT NULL) OR (enterprise_id IS NOT NULL))),
  CONSTRAINT "slack_installations_team_id_check" CHECK (((team_id IS NULL) OR (team_id ~ '^T[A-Z0-9]{2,31}$'::text))),
  CONSTRAINT "slack_installations_uninstalled_check" CHECK (((status = 'uninstalled'::text) = (uninstalled_at IS NOT NULL))),
  CONSTRAINT "slack_installations_usage_data_channels_check" CHECK ((cardinality(usage_data_channel_ids) <= 100)),
  CONSTRAINT "slack_installations_usage_data_mode_check" CHECK ((usage_data_mode = ANY (ARRAY['off'::text, 'dm'::text, 'dm_and_channels'::text]))),
  CONSTRAINT "slack_installations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."slack_installations"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX slack_installations_live_team_idx ON public.slack_installations USING btree (COALESCE(slack_app_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(enterprise_id, ''::text), COALESCE(team_id, ''::text))
  WHERE (status <> 'uninstalled'::text);

CREATE UNIQUE INDEX slack_installations_live_workspace_idx ON public.slack_installations USING btree (workspace_id)
  WHERE (status <> 'uninstalled'::text);

CREATE INDEX slack_installations_workspace_idx ON public.slack_installations USING btree (workspace_id, installed_at DESC);

CREATE TRIGGER slack_installations_set_updated_at
  BEFORE UPDATE ON public.slack_installations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."slack_installations"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_installations" IS 'The Phaseo Slack agent installed in a Slack workspace (or Enterprise Grid org). One live installation per Phaseo workspace and per Slack team and app; uninstalled rows are kept for billing history. A null slack_app_id means the hosted Phaseo app.';

COMMENT ON COLUMN "public"."slack_installations"."secrets_ciphertext" IS 'AES-GCM encrypted JSON {bot_token, gateway_key}, keyed by SLACK_SECRETS_ENCRYPTION_KEY. Never returned to clients.';

COMMENT ON COLUMN "public"."slack_installations"."key_id" IS 'The managed gateway key the agent uses. Model tokens are billed through it as normal requests.';

COMMENT ON COLUMN "public"."slack_installations"."guardrail_id" IS 'The guardrail attached to key_id that turns off training, prompt publishing and input/output logging, as Slack''s API terms require.';

COMMENT ON COLUMN "public"."slack_installations"."plan_people" IS 'The people limit of the chosen plan. With over_plan = refuse, a new person beyond it is refused and admins are notified. The monthly charge follows the people who actually used the agent.';

COMMENT ON COLUMN "public"."slack_installations"."over_plan" IS 'refuse (default): refuse a new person beyond plan_people and notify admins. move_up: move up a plan automatically, up to max_people if set.';

COMMENT ON COLUMN "public"."slack_installations"."max_people" IS 'Optional hard limit on people per UTC month. Null means no limit.';

COMMENT ON COLUMN "public"."slack_installations"."monthly_cap_nanos" IS 'Monthly spending cap for the Slack agent''s own charges (plan, extra answers and, later, sandbox time), in nanodollars. Set at install. Answers pause when it is reached, and the month-end charge never exceeds it.';

COMMENT ON COLUMN "public"."slack_installations"."status" IS 'active; paused (by an admin); payment_due (a past month''s charge is waiting for credits, so answers pause until charge_slack_agent_month succeeds); uninstalled.';

REVOKE ALL ON TABLE "public"."slack_installations" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."slack_installations" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_installations" FROM "anon", "authenticated";

CREATE TABLE "public"."slack_user_links" (
  "installation_id" uuid                     NOT NULL,
  "slack_user_id"   text                     NOT NULL,
  "user_id"         uuid                     NOT NULL,
  "linked_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_user_links_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_user_links_pkey" PRIMARY KEY (installation_id, slack_user_id),
  CONSTRAINT "slack_user_links_slack_user_id_check" CHECK ((slack_user_id ~ '^[UW][A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_user_links_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."slack_user_links"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX slack_user_links_user_idx ON public.slack_user_links USING btree (user_id);

CREATE POLICY "deny_direct_client_access" ON "public"."slack_user_links"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_user_links" IS 'Slack users who confirmed their Phaseo account. The agent only offers a workspace''s own usage data to linked members of that workspace.';

REVOKE ALL ON TABLE "public"."slack_user_links" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."slack_user_links" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_user_links" FROM "anon", "authenticated";

CREATE TABLE "public"."slack_agent_monthly_people" (
  "installation_id" uuid                     NOT NULL,
  "period_start"    date                     NOT NULL,
  "slack_user_id"   text                     NOT NULL,
  "first_answer_at" timestamp with time zone NOT NULL,
  "answers"         bigint                   NOT NULL DEFAULT 0,
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_agent_monthly_people_answers_check" CHECK ((answers >= 0)),
  CONSTRAINT "slack_agent_monthly_people_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_agent_monthly_people_period_check" CHECK ((period_start = (date_trunc('month'::text, (period_start)::timestamp without time zone))::date)),
  CONSTRAINT "slack_agent_monthly_people_pkey" PRIMARY KEY (installation_id, period_start, slack_user_id),
  CONSTRAINT "slack_agent_monthly_people_slack_user_id_check" CHECK ((slack_user_id ~ '^[UW][A-Z0-9]{2,31}$'::text))
);

ALTER TABLE "public"."slack_agent_monthly_people"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX slack_agent_monthly_people_period_idx ON public.slack_agent_monthly_people USING btree (period_start, installation_id);

CREATE POLICY "deny_direct_client_access" ON "public"."slack_agent_monthly_people"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_agent_monthly_people" IS 'Each Slack person the agent answered in a UTC calendar month, with their answer count. The Slack Worker''s per-installation meter writes it through record_slack_agent_people; the month-end charge counts people and pooled answers from it.';

REVOKE ALL ON TABLE "public"."slack_agent_monthly_people" FROM "service_role";

GRANT SELECT ON TABLE "public"."slack_agent_monthly_people" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_agent_monthly_people" FROM "anon", "authenticated";

CREATE TABLE "public"."slack_agent_charges" (
  "installation_id" uuid                     NOT NULL,
  "workspace_id"    uuid                     NOT NULL,
  "period_start"    date                     NOT NULL,
  "people"          integer                  NOT NULL,
  "answers"         bigint                   NOT NULL,
  "amount_nanos"    bigint                   NOT NULL,
  "status"          text                     NOT NULL DEFAULT 'pending'::text,
  "attempted_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "charged_at"      timestamp with time zone,
  "ledger_ref_id"   text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_agent_charges_charged_check" CHECK (((status = 'charged'::text) = (charged_at IS NOT NULL))),
  CONSTRAINT "slack_agent_charges_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_agent_charges_period_check" CHECK ((period_start = (date_trunc('month'::text, (period_start)::timestamp without time zone))::date)),
  CONSTRAINT "slack_agent_charges_pkey" PRIMARY KEY (installation_id, period_start),
  CONSTRAINT "slack_agent_charges_quantities_check" CHECK (((people >= 0) AND (answers >= 0) AND (amount_nanos >= 0))),
  CONSTRAINT "slack_agent_charges_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'charged'::text]))),
  CONSTRAINT "slack_agent_charges_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."slack_agent_charges"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX slack_agent_charges_pending_idx ON public.slack_agent_charges USING btree (attempted_at)
  WHERE (status = 'pending'::text);

CREATE INDEX slack_agent_charges_workspace_idx ON public.slack_agent_charges USING btree (workspace_id, period_start DESC);

CREATE TRIGGER slack_agent_charges_set_updated_at
  BEFORE UPDATE ON public.slack_agent_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."slack_agent_charges"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_agent_charges" IS 'The Slack agent''s charge for each installation and UTC month, taken from credits by charge_slack_agent_month as one credit_ledger charge (ref_type slack_agent_month). A charge stays pending while the balance is too low and is retried until it succeeds.';

REVOKE ALL ON TABLE "public"."slack_agent_charges" FROM "service_role";

GRANT SELECT ON TABLE "public"."slack_agent_charges" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_agent_charges" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.record_slack_agent_people (
  p_installation_id uuid,
  p_period_start    date,
  p_people          jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_count integer;
begin
  if p_period_start is null or p_period_start <> date_trunc('month', p_period_start)::date then
    raise exception 'invalid_period_start' using errcode = '22023';
  end if;
  if p_people is null or jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) > 1000 then
    raise exception 'invalid_people' using errcode = '22023';
  end if;

  -- The meter sends running totals, so a retried or repeated flush can only raise
  -- a count, never add it twice.
  insert into public.slack_agent_monthly_people as person
    (installation_id, period_start, slack_user_id, first_answer_at, answers, updated_at)
  select installation.id, p_period_start, entry.slack_user_id, entry.first_answer_at,
    greatest(coalesce(entry.answers, 0), 0), now()
  from public.slack_installations installation
  cross join jsonb_to_recordset(p_people) as entry(slack_user_id text, first_answer_at timestamptz, answers bigint)
  where installation.id = p_installation_id
  on conflict (installation_id, period_start, slack_user_id) do update
  set answers = greatest(person.answers, excluded.answers),
    first_answer_at = least(person.first_answer_at, excluded.first_answer_at),
    updated_at = now()
  where excluded.answers > person.answers or excluded.first_answer_at < person.first_answer_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

COMMENT ON FUNCTION "public"."record_slack_agent_people"(uuid, date, jsonb) IS 'Upserts running totals [{slack_user_id, first_answer_at, answers}] for one installation and UTC month from the Slack Worker''s meter. Counts only ever rise, so repeated flushes are safe. Returns the rows changed.';

GRANT EXECUTE ON FUNCTION "public"."record_slack_agent_people"(uuid, date, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_slack_agent_people"(uuid, date, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_slack_agent_people"(uuid, date, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_slack_agent_people"(uuid, date, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.list_slack_agent_due_charges (
  p_before date,
  p_limit  integer DEFAULT 200
)
  RETURNS TABLE (
    installation_id   uuid,
    workspace_id      uuid,
    period_start      date,
    people            integer,
    answers           bigint,
    monthly_cap_nanos bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Months that ended before p_before and have no completed charge. Never-tried
  -- months come first, then the longest-waiting retries, so a backlog of
  -- workspaces short of credits cannot starve the rest.
  select person.installation_id, installation.workspace_id, person.period_start,
    count(*)::integer, sum(person.answers)::bigint, installation.monthly_cap_nanos
  from public.slack_agent_monthly_people person
  join public.slack_installations installation on installation.id = person.installation_id
  left join public.slack_agent_charges charge
    on charge.installation_id = person.installation_id and charge.period_start = person.period_start
  where person.period_start < p_before
    and coalesce(charge.status, 'pending') = 'pending'
  group by person.installation_id, installation.workspace_id, person.period_start,
    installation.monthly_cap_nanos, charge.attempted_at
  order by charge.attempted_at nulls first, person.period_start, person.installation_id
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$function$;

COMMENT ON FUNCTION "public"."list_slack_agent_due_charges"(date, integer) IS 'People and pooled answers per installation for each finished UTC month that has not been charged yet, for the month-end charge job.';

GRANT EXECUTE ON FUNCTION "public"."list_slack_agent_due_charges"(date, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."list_slack_agent_due_charges"(date, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_slack_agent_due_charges"(date, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_slack_agent_due_charges"(date, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.charge_slack_agent_month (
  p_installation_id uuid,
  p_period_start    date,
  p_people          integer,
  p_answers         bigint,
  p_amount_nanos    bigint
)
  RETURNS TABLE (
    status               text,
    amount_nanos         bigint,
    before_balance_nanos bigint,
    after_balance_nanos  bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
#variable_conflict use_column
declare
  v_installation public.slack_installations%rowtype;
  v_charge public.slack_agent_charges%rowtype;
  v_wallet public.wallets%rowtype;
  v_amount bigint;
  v_ref text;
  v_ledger_id uuid;
begin
  if p_period_start is null or p_period_start <> date_trunc('month', p_period_start)::date then
    raise exception 'invalid_period_start' using errcode = '22023';
  end if;
  if p_period_start >= date_trunc('month', now() at time zone 'utc')::date then
    raise exception 'period_not_finished' using errcode = '22023';
  end if;
  if coalesce(p_people, -1) < 0 or coalesce(p_answers, -1) < 0 or coalesce(p_amount_nanos, -1) < 0 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  select * into v_installation from public.slack_installations where id = p_installation_id;
  if not found then
    raise exception 'installation_not_found' using errcode = 'P0002';
  end if;

  -- The first attempt fixes the month's people, answers and amount, capped at the
  -- spending cap set in Settings. Retries while credits are short charge exactly
  -- that, even if prices, the cap or late usage change afterwards. The row lock
  -- also makes a concurrent run wait here and then see the month charged.
  insert into public.slack_agent_charges as charge
    (installation_id, workspace_id, period_start, people, answers, amount_nanos, attempted_at)
  values (p_installation_id, v_installation.workspace_id, p_period_start, p_people, p_answers,
    least(p_amount_nanos, v_installation.monthly_cap_nanos), now())
  on conflict (installation_id, period_start) do update
  set attempted_at = excluded.attempted_at
  where charge.status = 'pending'
  returning * into v_charge;

  if not found then
    select * into v_charge from public.slack_agent_charges charge
    where charge.installation_id = p_installation_id and charge.period_start = p_period_start;
    return query select 'already_charged'::text, v_charge.amount_nanos, null::bigint, null::bigint;
    return;
  end if;

  v_amount := v_charge.amount_nanos;
  v_ref := p_installation_id::text || ':' || to_char(p_period_start, 'YYYY-MM');

  if v_amount > 0 then
    select * into v_wallet from public.wallets wallet
    where wallet.workspace_id = v_installation.workspace_id
    for update;

    if not found or v_wallet.balance_nanos - v_wallet.reserved_nanos < v_amount then
      update public.slack_installations installation set status = 'payment_due'
      where installation.id = p_installation_id and installation.status = 'active';
      return query select
        (case when v_wallet.workspace_id is null then 'wallet_not_found' else 'insufficient_balance' end)::text,
        v_amount, v_wallet.balance_nanos, v_wallet.balance_nanos;
      return;
    end if;

    insert into public.credit_ledger (
      workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos,
      ref_type, ref_id, source_ref_type, source_ref_id, status
    ) values (
      v_installation.workspace_id, 'charge', -v_amount, v_wallet.balance_nanos, v_wallet.balance_nanos - v_amount,
      'slack_agent_month', v_ref, 'slack_installation', p_installation_id::text, 'captured'
    )
    on conflict (ref_type, ref_id) do nothing
    returning id into v_ledger_id;

    -- A ledger row without a charged month can only come from a manual repair; never debit twice.
    if v_ledger_id is not null then
      update public.wallets wallet
      set balance_nanos = wallet.balance_nanos - v_amount, updated_at = now()
      where wallet.workspace_id = v_installation.workspace_id;
    end if;
  end if;

  update public.slack_agent_charges charge
  set status = 'charged', charged_at = now(), ledger_ref_id = case when v_amount > 0 then v_ref end
  where charge.installation_id = p_installation_id and charge.period_start = p_period_start;

  update public.slack_installations installation set status = 'active'
  where installation.id = p_installation_id and installation.status = 'payment_due'
    and not exists (
      select 1 from public.slack_agent_charges charge
      where charge.installation_id = p_installation_id and charge.status = 'pending'
    );

  return query select
    (case when v_amount > 0 and v_ledger_id is null then 'already_charged' else 'charged' end)::text,
    v_amount,
    case when v_amount > 0 then v_wallet.balance_nanos end,
    case when v_amount > 0 then v_wallet.balance_nanos - (case when v_ledger_id is null then 0 else v_amount end) end;
end;
$function$;

COMMENT ON FUNCTION "public"."charge_slack_agent_month"(uuid, date, integer, bigint, bigint) IS 'Takes one installation''s charge for a finished UTC month from credits, capped at its monthly spending cap and fixed at the first attempt, as a single credit_ledger charge (ref_type slack_agent_month, idempotent per installation and month). If the available balance is too low the month stays pending, the installation is marked payment_due, and the next call retries.';

GRANT EXECUTE ON FUNCTION "public"."charge_slack_agent_month"(uuid, date, integer, bigint, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."charge_slack_agent_month"(uuid, date, integer, bigint, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."charge_slack_agent_month"(uuid, date, integer, bigint, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."charge_slack_agent_month"(uuid, date, integer, bigint, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.protect_slack_agent_guardrail()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Deletes cascading from a deleted key or workspace are allowed: they leave the
  -- installation without a working key, so nothing can run unguarded.
  if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_table_name = 'workspace_guardrails' then
    -- Renaming or other edits are fine while every privacy switch stays off.
    if tg_op = 'UPDATE' and new.enabled
      and not new.privacy_enable_paid_may_train and not new.privacy_enable_free_may_train
      and not new.privacy_enable_free_may_publish_prompts and not new.privacy_enable_input_output_logging then
      return new;
    end if;
    if exists (
      select 1 from public.slack_installations installation
      where installation.guardrail_id = old.id and installation.status <> 'uninstalled'
    ) then
      raise exception 'slack_agent_guardrail_protected'
        using errcode = '23514',
          detail = 'This guardrail keeps Slack data out of training and logs. Uninstall the Slack agent to change or remove it.';
    end if;
  else
    if tg_op = 'UPDATE' and new.key_id = old.key_id and new.guardrail_id = old.guardrail_id then
      return new;
    end if;
    if exists (
      select 1 from public.slack_installations installation
      where installation.key_id = old.key_id and installation.guardrail_id = old.guardrail_id
        and installation.status <> 'uninstalled'
    ) then
      raise exception 'slack_agent_guardrail_protected'
        using errcode = '23514',
          detail = 'This guardrail keeps Slack data out of training and logs. Uninstall the Slack agent to change or remove it.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."protect_slack_agent_guardrail"() IS 'Keeps a live Slack agent installation''s privacy guardrail in force: it cannot be deleted, disabled, have a privacy switch turned back on, or be detached from the installation''s key until the agent is uninstalled.';

REVOKE ALL ON FUNCTION "public"."protect_slack_agent_guardrail"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_slack_agent_guardrail"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."protect_slack_agent_guardrail"() FROM PUBLIC, "anon", "authenticated";

CREATE TRIGGER protect_slack_agent_guardrail
  BEFORE DELETE OR UPDATE ON public.workspace_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_slack_agent_guardrail();

CREATE TRIGGER protect_slack_agent_guardrail
  BEFORE DELETE OR UPDATE ON public.key_guardrails
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_slack_agent_guardrail();
