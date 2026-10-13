DROP INDEX "public"."v2_subscription_plan_identity_idx";

CREATE UNIQUE INDEX v2_subscription_plan_identity_idx ON public.v2_subscription_plans USING btree (COALESCE(lab_slug, ''::text), plan_id)
  WHERE (status <> 'merged'::text);

-- The source explicitly describes an account base plus developer seats.
UPDATE public.v2_subscription_offer_prices c SET charge_basis='account'
FROM public.v2_subscription_plan_offers o
JOIN public.v2_subscription_plans p ON p.plan_uuid=o.plan_uuid
WHERE c.offer_uuid=o.offer_uuid AND c.component_key='base'
  AND p.plan_id='windsurf-teams' AND p.lab_slug='windsurf'
  AND o.metadata::text ~* 'base team plan.*additional.*40';

-- These are feature availability statements, not measurable allowances.
-- Retire only the derived rows; the feature records and evidence are preserved.
UPDATE public.v2_subscription_plan_allowances a SET effective_to=now()
FROM public.v2_subscription_plans p
WHERE a.plan_uuid=p.plan_uuid AND p.lab_slug='spacex-ai'
  AND a.allowance_key IN ('Group-level settings and spend limits','Usage analytics','Video generation')
  AND a.quantity IS NULL AND a.window_kind='none'
  AND a.display_text IN ('Included','Not included') AND a.effective_to IS NULL;
