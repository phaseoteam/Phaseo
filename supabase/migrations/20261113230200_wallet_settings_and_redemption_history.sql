SET LOCAL lock_timeout = '10s';

-- Auto top-up settings change only through update_workspace_auto_top_up, which checks MFA or
-- recorded consent and writes the workspace audit event. Signed-in clients keep read access.
REVOKE UPDATE ("auto_top_up_enabled", "auto_top_up_amount", "low_balance_threshold", "updated_at")
  ON TABLE public.wallets FROM authenticated;

DROP POLICY IF EXISTS "wallets: update settings if owner" ON public.wallets;

-- A credit code redemption stays recorded for the user after the workspace it was redeemed
-- into is deleted, so one redemption per user holds across workspaces.
ALTER TABLE public.credit_grant_redemptions
  ALTER COLUMN workspace_id DROP NOT NULL;

ALTER TABLE public.credit_grant_redemptions
  DROP CONSTRAINT credit_grant_redemptions_workspace_id_fkey,
  ADD CONSTRAINT credit_grant_redemptions_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;
