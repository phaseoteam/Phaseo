CREATE TABLE "public"."feedback_requests" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         uuid                     NOT NULL,
  "campaign"        text                     NOT NULL,
  "access_token"    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "segment"         text                     NOT NULL,
  "recency"         text                     NOT NULL,
  "requested_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "responded_at"    timestamp with time zone,
  "answers"         jsonb,
  "reward_grant_id" uuid,
  "reward_code"     text,
  "opted_out_at"    timestamp with time zone,
  CONSTRAINT "feedback_requests_answers_size_check" CHECK (((answers IS NULL) OR (octet_length((answers)::text) <= 20000))),
  CONSTRAINT "feedback_requests_campaign_check" CHECK ((campaign ~ '^[a-z0-9_-]{1,64}$'::text)),
  CONSTRAINT "feedback_requests_recency_check" CHECK ((recency = ANY (ARRAY['active'::text, 'lapsed'::text, 'dormant'::text]))),
  CONSTRAINT "feedback_requests_segment_check" CHECK ((segment = ANY (ARRAY['never_requested'::text, 'used_not_paid'::text, 'paid'::text]))),
  CONSTRAINT "feedback_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "feedback_requests_reward_grant_id_fkey" FOREIGN KEY (reward_grant_id) REFERENCES public.credit_grants(id) ON DELETE SET NULL,
  CONSTRAINT "feedback_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."feedback_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX feedback_requests_access_token_key ON public.feedback_requests USING btree (access_token);

CREATE INDEX feedback_requests_campaign_rewarded_idx ON public.feedback_requests USING btree (campaign)
  WHERE (reward_grant_id IS NOT NULL);

CREATE UNIQUE INDEX feedback_requests_user_campaign_key ON public.feedback_requests USING btree (user_id, campaign);

CREATE POLICY "deny_direct_client_access" ON "public"."feedback_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."feedback_requests" IS 'One feedback email per user and campaign. The access token is the unguessable id in the emailed feedback and unsubscribe links; answers and the thank-you credit code are stored here. Rows go with the account.';

REVOKE ALL ON TABLE "public"."feedback_requests" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."feedback_requests" TO "service_role";

REVOKE ALL ON TABLE "public"."feedback_requests" FROM "anon", "authenticated";
