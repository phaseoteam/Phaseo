CREATE TABLE "public"."catalogue_interaction_puzzles" (
  "puzzle_id"      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "game_key"       text                     NOT NULL,
  "puzzle_date"    date                     NOT NULL,
  "public_payload" jsonb                    NOT NULL,
  "answer_payload" jsonb                    NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalogue_interaction_puzzles_game_key_check"
    CHECK ((game_key = ANY (ARRAY['modele'::text, 'timeline'::text, 'pricele'::text, 'head-to-head'::text, 'sprint'::text]))),
  CONSTRAINT "catalogue_interaction_puzzles_game_key_puzzle_date_key" UNIQUE (game_key, puzzle_date),
  CONSTRAINT "catalogue_interaction_puzzles_pkey" PRIMARY KEY (puzzle_id)
);

ALTER TABLE "public"."catalogue_interaction_puzzles"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX catalogue_interaction_puzzles_date_idx ON public.catalogue_interaction_puzzles USING btree (puzzle_date DESC, game_key);

CREATE POLICY "service_role_full_access" ON "public"."catalogue_interaction_puzzles"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."catalogue_interaction_puzzles" TO "service_role";

COMMENT ON TABLE "public"."catalogue_interaction_puzzles" IS 'Server-only frozen payloads for date-based catalogue interactions.';

REVOKE ALL ON TABLE "public"."catalogue_interaction_puzzles" FROM "anon", "authenticated";
