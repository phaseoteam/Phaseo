CREATE TABLE "public"."preset_lineage" (
  "ancestor_preset_id"   uuid    NOT NULL,
  "descendant_preset_id" uuid    NOT NULL,
  "depth"                integer NOT NULL,
  CONSTRAINT "preset_lineage_depth_check" CHECK ((depth >= 0)),
  CONSTRAINT "preset_lineage_pkey" PRIMARY KEY (ancestor_preset_id, descendant_preset_id),
  CONSTRAINT "preset_lineage_ancestor_preset_id_fkey" FOREIGN KEY (ancestor_preset_id) REFERENCES public.presets(id) ON DELETE CASCADE,
  CONSTRAINT "preset_lineage_descendant_preset_id_fkey" FOREIGN KEY (descendant_preset_id) REFERENCES public.presets(id) ON DELETE CASCADE
);

ALTER TABLE "public"."preset_lineage"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX preset_lineage_descendant_idx ON public.preset_lineage USING btree (descendant_preset_id, depth);

CREATE POLICY "service_role_full_access" ON "public"."preset_lineage"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."preset_lineage" TO "service_role";

REVOKE ALL ON TABLE "public"."preset_lineage" FROM "anon", "authenticated";
