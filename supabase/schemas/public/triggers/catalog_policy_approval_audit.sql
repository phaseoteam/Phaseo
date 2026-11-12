CREATE TRIGGER catalog_policy_approval_audit AFTER INSERT OR UPDATE OR DELETE ON public.provider_catalog_policy_approvals
FOR EACH ROW EXECUTE FUNCTION public.audit_catalog_policy_approval();
