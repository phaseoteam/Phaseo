CREATE TABLE "public"."catalogue_game_results" (
  "user_id"      uuid                     NOT NULL,
  "game_key"     text                     NOT NULL,
  "puzzle_id"    uuid                     NOT NULL,
  "puzzle_date"  date                     NOT NULL,
  "won"          boolean                  NOT NULL,
  "score"        integer                  NOT NULL,
  "max_score"    integer                  NOT NULL,
  "attempts"     integer,
  "completed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalogue_game_results_attempts_check" CHECK (((attempts IS NULL) OR (attempts >= 0))),
  CONSTRAINT "catalogue_game_results_check" CHECK (((max_score > 0) AND (score <= max_score))),
  CONSTRAINT "catalogue_game_results_game_key_check" CHECK ((game_key = ANY (ARRAY['modele'::text, 'timeline'::text, 'pricele'::text, 'head-to-head'::text, 'sprint'::text]))),
  CONSTRAINT "catalogue_game_results_pkey" PRIMARY KEY (user_id, game_key, puzzle_date),
  CONSTRAINT "catalogue_game_results_score_check" CHECK ((score >= 0)),
  CONSTRAINT "catalogue_game_results_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "catalogue_game_results_puzzle_id_fkey" FOREIGN KEY (puzzle_id) REFERENCES public.catalogue_interaction_puzzles(puzzle_id) ON DELETE CASCADE
);

ALTER TABLE "public"."catalogue_game_results"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX catalogue_game_results_puzzle_id_idx ON public.catalogue_game_results USING btree (puzzle_id);

CREATE INDEX catalogue_game_results_user_date_idx ON public.catalogue_game_results USING btree (user_id, puzzle_date DESC);

CREATE POLICY "service_role_full_access" ON "public"."catalogue_game_results"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."catalogue_game_results" TO "service_role";

COMMENT ON TABLE "public"."catalogue_game_results" IS 'Server-verified daily catalogue game results for signed-in profiles.';

REVOKE ALL ON TABLE "public"."catalogue_game_results" FROM "anon", "authenticated";
