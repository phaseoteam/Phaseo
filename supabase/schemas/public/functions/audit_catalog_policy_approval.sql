CREATE OR REPLACE FUNCTION public.audit_catalog_policy_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.provider_catalog_policy_approval_events(provider_slug, previous_approval, current_approval)
  VALUES (coalesce(NEW.provider_slug, OLD.provider_slug), CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.audit_catalog_policy_approval() FROM PUBLIC, anon, authenticated;
