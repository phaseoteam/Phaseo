CREATE TABLE "public"."work_github_repos" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "repo"              text                     NOT NULL,
  "bridge_token_hash" text                     NOT NULL,
  "bridge_token_prefix" text                   NOT NULL,
  "github_token_ciphertext" text,
  "sync_issues"       boolean                  NOT NULL DEFAULT true,
  "created_by"        uuid,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "last_event_at"     timestamp with time zone,
  CONSTRAINT "work_github_repos_bridge_token_hash_key" UNIQUE (bridge_token_hash),
  CONSTRAINT "work_github_repos_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_github_repos_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_github_repos_repo_check" CHECK ((repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'::text)),
  CONSTRAINT "work_github_repos_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
  CONSTRAINT "work_github_repos_workspace_repo_key" UNIQUE (workspace_id, repo)
);

ALTER TABLE "public"."work_github_repos"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_github_repos_created_by_idx ON public.work_github_repos USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE POLICY "deny_direct_client_access" ON "public"."work_github_repos"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_github_repos" IS 'GitHub repositories linked to the work tracker. The repository''s Phaseo workflow (GitHub Actions) reports issue, comment and pull request events with the bridge token, whose SHA-256 hash is stored. github_token_ciphertext is an optional encrypted fine-grained token used to create issues from Phaseo.';

REVOKE ALL ON TABLE "public"."work_github_repos" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_github_repos" TO "service_role";

REVOKE ALL ON TABLE "public"."work_github_repos" FROM "anon", "authenticated";
