CREATE TABLE "public"."broadcast_destination_keys" (
  "destination_id" uuid                     NOT NULL,
  "key_id"         uuid                     NOT NULL,
  "created_at"     timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "filter_mode"    text                     NOT NULL DEFAULT 'include'::text,
  CONSTRAINT "broadcast_destination_keys_filter_mode_check" CHECK ((filter_mode = ANY (ARRAY['include'::text, 'exclude'::text]))),
  CONSTRAINT "broadcast_destination_keys_pkey" PRIMARY KEY (destination_id, key_id),
  CONSTRAINT "broadcast_destination_keys_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE CASCADE,
  CONSTRAINT "broadcast_destination_keys_destination_id_fkey" FOREIGN KEY (destination_id) REFERENCES public.workspace_broadcast_destinations(id) ON DELETE CASCADE
);

ALTER TABLE "public"."broadcast_destination_keys"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX broadcast_destination_keys_key_id_idx ON public.broadcast_destination_keys USING btree (key_id);

CREATE POLICY "broadcast_destination_keys_delete_own_team" ON "public"."broadcast_destination_keys"
  FOR DELETE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_broadcast_destinations d
  WHERE ((d.id = broadcast_destination_keys.destination_id) AND public.is_workspace_admin(d.workspace_id)))));

CREATE POLICY "broadcast_destination_keys_insert_own_team" ON "public"."broadcast_destination_keys"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workspace_broadcast_destinations d
     JOIN public.keys k ON ((k.id = broadcast_destination_keys.key_id)))
  WHERE ((d.id = broadcast_destination_keys.destination_id) AND (d.workspace_id = k.workspace_id) AND public.is_workspace_admin(d.workspace_id)))));

CREATE POLICY "broadcast_destination_keys_select_own_team" ON "public"."broadcast_destination_keys"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_broadcast_destinations d
  WHERE ((d.id = broadcast_destination_keys.destination_id) AND public.is_workspace_member(d.workspace_id)))));

CREATE POLICY "broadcast_destination_keys_update_own_team" ON "public"."broadcast_destination_keys"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.workspace_broadcast_destinations d
  WHERE ((d.id = broadcast_destination_keys.destination_id) AND public.is_workspace_admin(d.workspace_id)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspace_broadcast_destinations d
  WHERE ((d.id = broadcast_destination_keys.destination_id) AND public.is_workspace_admin(d.workspace_id)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."broadcast_destination_keys" TO "anon", "authenticated", "service_role";
