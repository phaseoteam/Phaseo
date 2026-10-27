-- Each signed-in copy of the desktop app keeps its own key, so a person can sign in on several computers. The index
-- still allows one active delegated key per person, app and workspace for OAuth sign-ins (they revoke the earlier key
-- first), but no longer counts keys from a desktop Phaseo login (issued_via 'desktop'), which it made fail with a
-- duplicate key error for anyone who already had one. keys is small, so the rebuild is brief.
DROP INDEX "public"."keys_oauth_delegated_active_idx";

CREATE UNIQUE INDEX keys_oauth_delegated_active_idx ON public.keys USING btree (oauth_user_id, workspace_id, oauth_client_id) WHERE ((key_kind = 'oauth_delegated'::text) AND (status = 'active'::text) AND (issued_via <> 'desktop'::text));
