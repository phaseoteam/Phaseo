import { WorkerEntrypoint } from "cloudflare:workers";
import type { Env } from "./env";
import { loadInstallation } from "./installations";
import { MAX_LIVE_PAGES, PAGE_ID_PATTERN, pageSignInAvailable, pageStoreFor, pageStoreKey, pagesOrigin, pageUrl, type PageAccess } from "./pages";
import { createDb, type Db } from "./supabase";

// SlackAgentAdmin: what web-api asks of this Worker through its service binding
// (a named entrypoint, so nothing here is reachable from the internet). Settings
// → Slack lists and deletes an installation's shared pages, and uninstalling in
// Phaseo settings deletes them all. web-api checks that the caller is an owner or
// admin of the installation's workspace before it calls.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A page as Settings → Slack shows it. Times are ISO strings. */
export type AdminPage = {
	id: string;
	url: string;
	title: string;
	access: PageAccess;
	created_by: string;
	created_at: string;
	expires_at: string;
	views: number;
};

export type AdminPages = {
	/** Pages are served (this Worker knows its public origin). */
	available: boolean;
	/** People can sign in with Slack to view pages shared with the workspace. */
	sign_in: boolean;
	pages: AdminPage[];
	limit: number;
};

/** The admin calls, apart from the entrypoint so tests can run them with fakes. */
export async function listPages(env: Env, db: Db, installationId: string, now = Date.now()): Promise<AdminPages> {
	const origin = pagesOrigin(env);
	const installation = UUID_PATTERN.test(installationId) ? await loadInstallation(db, installationId) : null;
	if (!installation) return { available: Boolean(origin), sign_in: false, pages: [], limit: MAX_LIVE_PAGES };
	const storeKey = pageStoreKey(env, installation.id);
	const [pages, signIn] = await Promise.all([pageStoreFor(env, installation.id).list(now), pageSignInAvailable(env, db, installation)]);
	return {
		available: Boolean(origin),
		sign_in: signIn,
		limit: MAX_LIVE_PAGES,
		pages: pages.map((page) => ({
			id: page.id,
			// Owners and admins see every page of their installation; opening one follows its access, like anyone's.
			url: origin ? pageUrl(origin, storeKey, page.id) : "",
			title: page.title,
			access: page.access,
			created_by: page.createdBy,
			created_at: new Date(page.createdAt).toISOString(),
			expires_at: new Date(page.expiresAt).toISOString(),
			views: page.views,
		})),
	};
}

export async function deletePage(env: Env, installationId: string, pageId: string): Promise<boolean> {
	if (!UUID_PATTERN.test(installationId) || !PAGE_ID_PATTERN.test(pageId)) return false;
	return pageStoreFor(env, installationId).remove(pageId);
}

export async function deletePages(env: Env, installationId: string): Promise<void> {
	if (!UUID_PATTERN.test(installationId)) return;
	await pageStoreFor(env, installationId).removeAll();
}

export class SlackAgentAdmin extends WorkerEntrypoint<Env> {
	async listPages(installationId: string): Promise<AdminPages> {
		return listPages(this.env, createDb(this.env), String(installationId));
	}

	async deletePage(installationId: string, pageId: string): Promise<boolean> {
		return deletePage(this.env, String(installationId), String(pageId));
	}

	async deletePages(installationId: string): Promise<void> {
		await deletePages(this.env, String(installationId));
	}
}
