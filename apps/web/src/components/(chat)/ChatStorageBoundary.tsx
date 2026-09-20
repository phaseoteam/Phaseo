"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/utils/supabase/client";
import { assertChatStorageOwner, initializeChatStorage, observeChatStorageIdentity } from "@/lib/chat/userStorage";
import { migrateLegacyChatHistory } from "@/lib/chat/legacyMigration";
import { hideDocumentForSessionReset } from "@/lib/query/historyPrivacy";

/** Do not mount history readers or draft writers until browser auth is known. */
export function ChatStorageBoundary({ children }: { children: ReactNode }) {
	const [ready, setReady] = useState(false);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let active = true;
		let revision = 0;
		let migration: Promise<void> | undefined;
		const accept = (userId: string | null, signedOut = false) => {
			if (!active) return;
			observeChatStorageIdentity(userId, signedOut);
			if (!initializeChatStorage(userId)) {
				setReady(false);
				hideDocumentForSessionReset();
				window.location.reload();
				return;
			}
			if (!userId) { setReady(true); return; }
			const acceptedRevision = revision;
			migration ??= migrateLegacyChatHistory(userId);
			void migration.then(() => {
				if (!active || acceptedRevision !== revision) return;
				assertChatStorageOwner(userId);
				setReady(true);
			}).catch(() => {
				if (active && acceptedRevision === revision) setFailed(true);
			});
		};
		const auth = createClient().auth;
		const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
			revision += 1;
			accept(session?.user.id ?? null, event === "SIGNED_OUT");
		});
		const startedAt = revision;
		void auth.getSession().then(({ data, error }) => {
			if (!active || revision !== startedAt) return;
			if (error) { setFailed(true); return; }
			accept(data.session?.user.id ?? null);
		}).catch(() => { if (active) setFailed(true); });
		return () => { active = false; subscription.unsubscribe(); };
	}, []);
	if (!ready) return <p role="status" className="p-4 text-sm text-muted-foreground">{failed ? "Unable to prepare your chat history. Reload to retry." : "Loading chat…"}</p>;
	return children;
}
