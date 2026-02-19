-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.api_apps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  app_key text NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  first_seen timestamp with time zone NOT NULL DEFAULT now(),
  last_seen timestamp with time zone NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT api_apps_pkey PRIMARY KEY (id),
  CONSTRAINT api_apps_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.byok_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  provider_id text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  always_use boolean NOT NULL DEFAULT false,
  enc_value bytea NOT NULL,
  enc_iv bytea NOT NULL,
  enc_tag bytea NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  fingerprint_sha256 text NOT NULL,
  prefix text NOT NULL,
  suffix text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone,
  last_verified_at timestamp with time zone,
  verification_status text NOT NULL DEFAULT 'unknown'::text,
  error_message text,
  CONSTRAINT byok_keys_pkey PRIMARY KEY (id),
  CONSTRAINT byok_keys_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT byok_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id)
);
CREATE TABLE public.credit_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  event_time timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  kind text NOT NULL,
  amount_nanos bigint NOT NULL,
  before_balance_nanos bigint NOT NULL,
  after_balance_nanos bigint NOT NULL,
  ref_type text NOT NULL,
  ref_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  status text,
  CONSTRAINT credit_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT credit_ledger_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.data_api_model_aliases (
  alias_slug text NOT NULL,
  api_model_id text NOT NULL,
  channel text,
  is_enabled boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT data_api_model_aliases_pkey PRIMARY KEY (alias_slug)
);
CREATE TABLE public.data_api_pricing_rules (
  rule_id uuid NOT NULL DEFAULT gen_random_uuid(),
  model_key text NOT NULL,
  capability_id text NOT NULL,
  pricing_plan text NOT NULL DEFAULT 'standard'::text,
  meter text NOT NULL,
  unit text NOT NULL DEFAULT 'token'::text,
  unit_size numeric NOT NULL DEFAULT 1,
  price_per_unit numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD'::text,
  note text,
  match jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority integer NOT NULL DEFAULT 100,
  effective_from timestamp with time zone,
  effective_to timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT data_api_pricing_rules_pkey PRIMARY KEY (rule_id)
);
CREATE TABLE public.data_api_provider_model_capabilities (
  provider_api_model_id text NOT NULL,
  capability_id text NOT NULL,
  max_input_tokens integer,
  max_output_tokens integer,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from timestamp with time zone,
  effective_to timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  status USER-DEFINED NOT NULL DEFAULT 'active'::data_api_provider_capability_status,
  CONSTRAINT data_api_provider_model_capabilities_pkey PRIMARY KEY (provider_api_model_id, capability_id),
  CONSTRAINT data_api_provider_model_capabilities_provider_api_model_id_fkey FOREIGN KEY (provider_api_model_id) REFERENCES public.data_api_provider_models(provider_api_model_id)
);
CREATE TABLE public.data_api_provider_models (
  provider_api_model_id text NOT NULL,
  provider_id text NOT NULL,
  api_model_id text NOT NULL,
  provider_model_slug text,
  internal_model_id text,
  is_active_gateway boolean NOT NULL DEFAULT false,
  input_modalities ARRAY,
  output_modalities ARRAY,
  quantization_scheme text,
  effective_from timestamp with time zone,
  effective_to timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT data_api_provider_models_pkey PRIMARY KEY (provider_api_model_id),
  CONSTRAINT data_api_provider_models_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.data_api_providers(api_provider_id)
);
CREATE TABLE public.data_api_providers (
  uuid uuid NOT NULL DEFAULT gen_random_uuid(),
  api_provider_id text NOT NULL UNIQUE,
  api_provider_name text NOT NULL,
  description text,
  link text,
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  country_code text DEFAULT 'xx'::text,
  CONSTRAINT data_api_providers_pkey PRIMARY KEY (uuid)
);
CREATE TABLE public.data_benchmark_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  model_id text NOT NULL,
  benchmark_id text NOT NULL,
  score text NOT NULL,
  is_self_reported boolean NOT NULL,
  other_info text,
  source_link text,
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  rank integer,
  occur_idx integer NOT NULL DEFAULT 1,
  variant text,
  result_key text,
  CONSTRAINT data_benchmark_results_pkey PRIMARY KEY (id),
  CONSTRAINT data_benchmark_results_benchmark_id_fkey FOREIGN KEY (benchmark_id) REFERENCES public.data_benchmarks(id),
  CONSTRAINT data_benchmark_results_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.data_models(model_id)
);
CREATE TABLE public.data_benchmarks (
  id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL,
  category text,
  ascending_order boolean DEFAULT true,
  link text,
  total_models integer,
  type text,
  CONSTRAINT data_benchmarks_pkey PRIMARY KEY (id)
);
CREATE TABLE public.data_model_details (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  model_id text NOT NULL,
  detail_name text NOT NULL,
  detail_value text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT data_model_details_pkey PRIMARY KEY (id),
  CONSTRAINT data_model_details_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.data_models(model_id)
);
CREATE TABLE public.data_model_families (
  family_id text NOT NULL,
  organisation_id text NOT NULL,
  family_name text NOT NULL,
  family_description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT data_model_families_pkey PRIMARY KEY (family_id),
  CONSTRAINT data_model_families_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.data_organisations(organisation_id)
);
CREATE TABLE public.data_model_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  model_id text NOT NULL,
  platform text NOT NULL,
  url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT data_model_links_pkey PRIMARY KEY (id),
  CONSTRAINT data_model_links_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.data_models(model_id)
);
CREATE TABLE public.data_models (
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL,
  organisation_id text NOT NULL,
  status text,
  announcement_date timestamp with time zone,
  release_date timestamp with time zone,
  deprecation_date timestamp with time zone,
  retirement_date timestamp with time zone,
  license text,
  input_types text,
  output_types text,
  model_id text NOT NULL UNIQUE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  previous_model_id text,
  family_id text,
  timeline jsonb,
  CONSTRAINT data_models_pkey PRIMARY KEY (id),
  CONSTRAINT data_models_family_id_fkey FOREIGN KEY (family_id) REFERENCES public.data_model_families(family_id),
  CONSTRAINT data_models_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.data_organisations(organisation_id)
);
CREATE TABLE public.data_organisation_links (
  organisation_id text NOT NULL,
  platform USER-DEFINED NOT NULL,
  url text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  organisation_link_id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT data_organisation_links_pkey PRIMARY KEY (organisation_link_id),
  CONSTRAINT organisation_socials_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.data_organisations(organisation_id)
);
CREATE TABLE public.data_organisations (
  organisation_id text NOT NULL,
  name text NOT NULL UNIQUE,
  country_code text NOT NULL,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  colour text,
  CONSTRAINT data_organisations_pkey PRIMARY KEY (organisation_id)
);
CREATE TABLE public.data_subscription_plan_features (
  plan_uuid uuid NOT NULL,
  feature_name text NOT NULL,
  feature_value text,
  feature_description text,
  other_info jsonb,
  CONSTRAINT data_subscription_plan_features_pkey PRIMARY KEY (plan_uuid, feature_name),
  CONSTRAINT data_subscription_plan_features_plan_uuid_fkey FOREIGN KEY (plan_uuid) REFERENCES public.data_subscription_plans(plan_uuid)
);
CREATE TABLE public.data_subscription_plan_models (
  plan_uuid uuid NOT NULL,
  model_id text NOT NULL,
  model_info jsonb,
  rate_limit jsonb,
  other_info jsonb,
  CONSTRAINT data_subscription_plan_models_pkey PRIMARY KEY (plan_uuid, model_id),
  CONSTRAINT data_subscription_plan_models_plan_uuid_fkey FOREIGN KEY (plan_uuid) REFERENCES public.data_subscription_plans(plan_uuid),
  CONSTRAINT data_subscription_plan_models_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.data_models(model_id)
);
CREATE TABLE public.data_subscription_plans (
  plan_uuid uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id text NOT NULL,
  name text NOT NULL,
  organisation_id text NOT NULL,
  description text,
  frequency text NOT NULL,
  price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD'::text,
  link text,
  other_info jsonb,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT data_subscription_plans_pkey PRIMARY KEY (plan_uuid),
  CONSTRAINT data_subscription_plans_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES public.data_organisations(organisation_id)
);
CREATE TABLE public.gateway_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  team_id uuid NOT NULL,
  request_id text NOT NULL,
  app_id uuid,
  endpoint text NOT NULL,
  model_id text,
  provider text,
  native_response_id text,
  stream boolean NOT NULL DEFAULT false,
  byok boolean NOT NULL DEFAULT false,
  status_code integer,
  success boolean NOT NULL DEFAULT false,
  error_code text,
  error_message text,
  latency_ms integer,
  generation_ms integer,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_nanos bigint,
  currency text,
  pricing_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_id uuid,
  throughput numeric,
  CONSTRAINT gateway_requests_pkey PRIMARY KEY (id),
  CONSTRAINT gateway_requests_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT gateway_requests_key_id_fkey FOREIGN KEY (key_id) REFERENCES public.keys(id)
);
CREATE TABLE public.keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  name text NOT NULL,
  hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  scopes text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  last_used_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'utc'::text),
  kid text,
  soft_blocked boolean NOT NULL DEFAULT false,
  daily_limit_requests bigint NOT NULL DEFAULT 0,
  weekly_limit_requests bigint NOT NULL DEFAULT 0,
  monthly_limit_requests bigint NOT NULL DEFAULT 0,
  daily_limit_cost_nanos bigint NOT NULL DEFAULT 0,
  weekly_limit_cost_nanos bigint NOT NULL DEFAULT 0,
  monthly_limit_cost_nanos bigint NOT NULL DEFAULT 0,
  CONSTRAINT keys_pkey PRIMARY KEY (id),
  CONSTRAINT keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id),
  CONSTRAINT keys_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.team_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  creator_user_id uuid NOT NULL,
  role USER-DEFINED NOT NULL DEFAULT 'member'::team_role,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  token_encrypted text NOT NULL DEFAULT ''::text,
  token_preview text CHECK (token_preview IS NULL OR char_length(token_preview) >= 1 AND char_length(token_preview) <= 12),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  token_fingerprint text,
  key_version smallint NOT NULL DEFAULT 1,
  CONSTRAINT team_invites_pkey PRIMARY KEY (id),
  CONSTRAINT team_invites_inviter_user_id_fkey FOREIGN KEY (creator_user_id) REFERENCES public.users(user_id),
  CONSTRAINT team_invites_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.team_join_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL,
  invite_id uuid,
  requester_user_id uuid NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::join_request_status,
  decided_by uuid,
  decided_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT team_join_requests_pkey PRIMARY KEY (id),
  CONSTRAINT team_join_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES public.users(user_id),
  CONSTRAINT team_join_requests_invite_id_fkey FOREIGN KEY (invite_id) REFERENCES public.team_invites(id),
  CONSTRAINT team_join_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES public.users(user_id),
  CONSTRAINT team_join_requests_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.team_members (
  team_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role USER-DEFINED NOT NULL,
  joined_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT team_members_pkey PRIMARY KEY (team_id, user_id),
  CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id),
  CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(user_id)
);
CREATE TABLE public.updates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type text NOT NULL,
  who text NOT NULL,
  title text NOT NULL,
  link text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  CONSTRAINT updates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_recovery_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_recovery_codes_pkey PRIMARY KEY (id),
  CONSTRAINT user_recovery_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.users (
  user_id uuid NOT NULL,
  display_name text,
  default_team_id uuid,
  obfuscate_info boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  updated_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  role USER-DEFINED NOT NULL DEFAULT 'user'::user_role,
  CONSTRAINT users_pkey PRIMARY KEY (user_id),
  CONSTRAINT users_default_team_id_fkey FOREIGN KEY (default_team_id) REFERENCES public.teams(id),
  CONSTRAINT users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.wallets (
  team_id uuid NOT NULL UNIQUE,
  stripe_customer_id text NOT NULL,
  balance_nanos bigint NOT NULL DEFAULT '0'::bigint,
  auto_top_up_enabled boolean NOT NULL DEFAULT false,
  low_balance_threshold bigint NOT NULL DEFAULT '0'::bigint,
  auto_top_up_amount bigint NOT NULL DEFAULT '0'::bigint,
  updated_at timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  auto_top_up_account_id text,
  CONSTRAINT wallets_pkey PRIMARY KEY (team_id),
  CONSTRAINT wallets_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
