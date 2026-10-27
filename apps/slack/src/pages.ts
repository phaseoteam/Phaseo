import { DurableObject } from "cloudflare:workers";
import type { AgentTool } from "@phaseo/agent-sdk";
import type { Env } from "./env";
import { appClientCredentials, loadInstallation, type Installation } from "./installations";
import { base64UrlEncode } from "./lib/slack-secrets";
import { createDb, type Db } from "./supabase";
import type { TurnRef } from "./turns";
import { ToolInputError } from "./usage-tools";

// Shared pages: the agent publishes a self-contained HTML page (a report, a
// table, a chart or a small interactive view) with publish_page and links it in
// its reply. Each installation's pages live in its PageStore (SQLite storage),
// under a random 128-bit id, until they expire (the installation's
// page_expiry_days: 7, 30 or 90) or an admin deletes them in Settings → Slack.
// The store deletes everything when the installation is uninstalled: at once
// when the app is removed in Slack or in Phaseo settings, and otherwise the next
// time it checks (a view, or its daily alarm).
//
// A page can hold Slack text (from the thread, or anything the agent read), so
// it is kept only until it expires, and its HTML, title and id never go into
// logs or Workflow step outputs. Publishing is part of the answer: no extra
// charge, at most MAX_PAGES_PER_ANSWER per answer and MAX_LIVE_PAGES live per
// installation. Someone from another organisation (Slack Connect) is never
// offered the tool. A scheduled run answers as the person who set it up, with
// their current external flag, so it is offered only when they could publish.
//
// Who can view a page (page-viewer.ts serves them):
//   link       anyone with the link, while the installation allows link sharing
//   workspace  people in the installation's Slack workspace, after Sign in with
//              Slack with the client credentials of the app it was installed
//              through. Without them, this mode isn't offered.

export const PUBLISH_PAGE_TOOL_ID = "publish_page";
/** The largest page, in UTF-8 bytes. */
export const MAX_PAGE_BYTES = 512 * 1024;
export const MAX_PAGE_TITLE_CHARS = 120;
export const MAX_PAGES_PER_ANSWER = 3;
/** Live (unexpired) pages an installation may keep. */
export const MAX_LIVE_PAGES = 200;
export const PAGE_EXPIRY_DAYS = [7, 30, 90] as const;
const DEFAULT_EXPIRY_DAYS = 30;
const DAY_MS = 24 * 60 * 60_000;
/** A store with pages checks this often that its installation is still installed. */
const INSTALLATION_CHECK_MS = DAY_MS;
/** After a failed check, the next try. */
const CHECK_RETRY_MS = 60 * 60_000;
const PAGE_ID_BYTES = 16;
/** A page id: 128 random bits, base64url. */
export const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
/** A store's key in page URLs: its Durable Object id, which doesn't reveal the installation. */
export const STORE_KEY_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PageAccess = "link" | "workspace";

/** A page as Settings → Slack lists it: never its HTML. */
export type PageSummary = {
	id: string;
	title: string;
	access: PageAccess;
	createdBy: string;
	createdAt: number;
	expiresAt: number;
	views: number;
};

export type StoredPage = PageSummary & { installationId: string; html: string };

export type PublishInput = {
	installationId: string;
	/** The Slack event of the answer; its pages are counted against MAX_PAGES_PER_ANSWER, across retries and questions. */
	eventId: string;
	title: string;
	html: string;
	access: PageAccess;
	createdBy: string;
	expiresAt: number;
	now: number;
};

export type PublishResult =
	| { status: "published"; id: string; expiresAt: number; answerPages: number }
	| { status: "answer_limit" | "full" | "too_large" };

type PageRow = {
	id: string;
	title: string;
	access: PageAccess;
	created_by: string;
	created_at: number;
	expires_at: number;
	views: number;
};

const SUMMARY_COLUMNS = "id, title, access, created_by, created_at, expires_at, views";

function summary(row: PageRow): PageSummary {
	return { id: row.id, title: row.title, access: row.access, createdBy: row.created_by, createdAt: row.created_at, expiresAt: row.expires_at, views: row.views };
}

export function utf8Bytes(text: string): number {
	return new TextEncoder().encode(text).byteLength;
}

export function newPageId(): string {
	return base64UrlEncode(crypto.getRandomValues(new Uint8Array(PAGE_ID_BYTES)));
}

/** One installation's shared pages. */
export class PageStore extends DurableObject<Env> {
	/** Postgres, for the installation check; replaced in tests. */
	db: Db;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.db = createDb(env);
		this.migrate();
	}

	private get sql() {
		return this.ctx.storage.sql;
	}

	private migrate(): void {
		this.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
		this.sql.exec(`CREATE TABLE IF NOT EXISTS pages (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			html TEXT NOT NULL,
			access TEXT NOT NULL,
			created_by TEXT NOT NULL,
			event_id TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL,
			views INTEGER NOT NULL DEFAULT 0
		)`);
		this.sql.exec("CREATE INDEX IF NOT EXISTS pages_expires_at ON pages (expires_at)");
		this.sql.exec("CREATE INDEX IF NOT EXISTS pages_event_id ON pages (event_id)");
	}

	private installationId(): string | null {
		return this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'installation_id'").toArray()[0]?.value ?? null;
	}

	private deleteExpired(now: number): void {
		this.sql.exec("DELETE FROM pages WHERE expires_at <= ?", now);
	}

	/** Wakes at the next expiry, and at least daily to check the installation, while any page is kept. */
	private async schedule(now: number): Promise<void> {
		const next = this.sql.exec<{ next: number | null }>("SELECT min(expires_at) AS next FROM pages").one().next;
		if (next === null) {
			await this.ctx.storage.deleteAlarm();
			return;
		}
		await this.ctx.storage.setAlarm(Math.min(next, now + INSTALLATION_CHECK_MS));
	}

	/** Stores a page, within the answer's and the installation's limits. */
	async publish(input: PublishInput): Promise<PublishResult> {
		if (utf8Bytes(input.html) > MAX_PAGE_BYTES) return { status: "too_large" };
		const result = this.ctx.storage.transactionSync((): PublishResult => {
			const owner = this.installationId();
			if (owner && owner !== input.installationId) throw new Error("page_store_installation_mismatch");
			if (!owner) this.sql.exec("INSERT INTO meta (key, value) VALUES ('installation_id', ?)", input.installationId);
			this.deleteExpired(input.now);
			const answerPages = this.sql.exec<{ count: number }>("SELECT count(*) AS count FROM pages WHERE event_id = ?", input.eventId).one().count;
			if (answerPages >= MAX_PAGES_PER_ANSWER) return { status: "answer_limit" };
			const live = this.sql.exec<{ count: number }>("SELECT count(*) AS count FROM pages").one().count;
			if (live >= MAX_LIVE_PAGES) return { status: "full" };
			const id = newPageId();
			this.sql.exec(
				"INSERT INTO pages (id, title, html, access, created_by, event_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
				id, input.title, input.html, input.access, input.createdBy, input.eventId, input.now, input.expiresAt,
			);
			return { status: "published", id, expiresAt: input.expiresAt, answerPages: answerPages + 1 };
		});
		await this.schedule(input.now);
		return result;
	}

	/** A page to serve, or null when there is none (an expired one is deleted here). */
	page(id: string, now = Date.now()): StoredPage | null {
		const installationId = this.installationId();
		if (!installationId || !PAGE_ID_PATTERN.test(id)) return null;
		const row = this.sql.exec<PageRow & { html: string }>(`SELECT ${SUMMARY_COLUMNS}, html FROM pages WHERE id = ?`, id).toArray()[0];
		if (!row) return null;
		if (row.expires_at <= now) {
			this.sql.exec("DELETE FROM pages WHERE id = ?", id);
			return null;
		}
		return { ...summary(row), installationId, html: row.html };
	}

	/** Counts a view by someone allowed to see the page. */
	recordView(id: string): void {
		this.sql.exec("UPDATE pages SET views = views + 1 WHERE id = ?", id);
	}

	/** The live pages, newest first, without their HTML. */
	list(now = Date.now()): PageSummary[] {
		this.deleteExpired(now);
		return this.sql.exec<PageRow>(`SELECT ${SUMMARY_COLUMNS} FROM pages ORDER BY created_at DESC, id`).toArray().map(summary);
	}

	/** Deletes one page. False when there was none. */
	async remove(id: string, now = Date.now()): Promise<boolean> {
		const removed = this.sql.exec<{ id: string }>("DELETE FROM pages WHERE id = ? RETURNING id", id).toArray().length > 0;
		await this.schedule(now);
		return removed;
	}

	/** Deletes every page: the installation was uninstalled. */
	async removeAll(): Promise<void> {
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.deleteAll();
		this.migrate();
	}

	/** Deletes expired pages, and everything once the installation is gone. */
	async alarm(): Promise<void> {
		const now = Date.now();
		this.deleteExpired(now);
		const installationId = this.installationId();
		if (installationId && this.sql.exec("SELECT 1 FROM pages LIMIT 1").toArray().length) {
			try {
				if (!(await loadInstallation(this.db, installationId))) {
					console.log("[slack-agent] pages deleted after uninstall", { installationId });
					await this.removeAll();
					return;
				}
			} catch {
				console.error("[slack-agent] page store could not check its installation", { installationId });
				await this.ctx.storage.setAlarm(now + CHECK_RETRY_MS);
				return;
			}
		}
		await this.schedule(now);
	}
}

export function pageStoreKey(env: Pick<Env, "PAGES">, installationId: string): string {
	return env.PAGES.idFromName(installationId).toString();
}

export function pageStoreFor(env: Pick<Env, "PAGES">, installationId: string) {
	return env.PAGES.get(env.PAGES.idFromName(installationId));
}

/** The store a page URL names, or null when the key isn't one of this namespace's ids. */
export function pageStoreByKey(env: Pick<Env, "PAGES">, key: string) {
	if (!STORE_KEY_PATTERN.test(key)) return null;
	try {
		return env.PAGES.get(env.PAGES.idFromString(key));
	} catch {
		return null;
	}
}

/** Where pages are served: PUBLIC_ORIGIN, https (http only outside production). Null: pages are off. */
export function pagesOrigin(env: Pick<Env, "PUBLIC_ORIGIN" | "ENV">): string | null {
	const configured = env.PUBLIC_ORIGIN?.trim();
	if (!configured) return null;
	try {
		const url = new URL(configured);
		if (url.protocol === "https:" || (env.ENV !== "production" && url.protocol === "http:")) return url.origin;
	} catch {}
	return null;
}

export function pageUrl(origin: string, storeKey: string, pageId: string): string {
	return `${origin}/p/${storeKey}/${pageId}`;
}

/** Days a new page is kept: the installation's setting, when it is one of the allowed values. */
export function pageExpiryDays(installation: Pick<Installation, "page_expiry_days">): number {
	return (PAGE_EXPIRY_DAYS as readonly number[]).includes(installation.page_expiry_days) ? installation.page_expiry_days : DEFAULT_EXPIRY_DAYS;
}

type PageSettings = Pick<Installation, "page_default_access" | "page_link_access">;

/** Who the agent may share new pages with: link (when allowed) and workspace (when Sign in with Slack works). */
export function pageAccessModes(installation: PageSettings, signIn: boolean): PageAccess[] {
	return [...(installation.page_link_access ? ["link" as const] : []), ...(signIn ? ["workspace" as const] : [])];
}

/** The admins' default when it is available, otherwise the one mode there is. */
export function defaultPageAccess(installation: PageSettings, modes: PageAccess[]): PageAccess | null {
	return modes.includes(installation.page_default_access) ? installation.page_default_access : modes[0] ?? null;
}

/** Who may view a published page now: a link page needs a sign-in once admins turn link sharing off. */
export function effectivePageAccess(access: PageAccess, installation: Pick<Installation, "page_link_access">): PageAccess {
	return access === "link" && installation.page_link_access ? "link" : "workspace";
}

/** Whether people can sign in with Slack to view the installation's workspace pages. A failed read counts as no. */
export async function pageSignInAvailable(env: Env, db: Db, installation: Pick<Installation, "slack_app_id">): Promise<boolean> {
	if (!pagesOrigin(env)) return false;
	try {
		return (await appClientCredentials(env, db, installation)) !== null;
	} catch {
		return false;
	}
}

function accessText(access: PageAccess): string {
	return access === "link" ? "anyone with the link" : "people in this Slack workspace, after they sign in with Slack";
}

/** One line on one page for the tool's reply; never in logs. */
function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

export type PublishPageOptions = {
	modes: PageAccess[];
	defaultAccess: PageAccess;
	expiryDays: number;
	now: () => number;
	publish: (page: { title: string; html: string; access: PageAccess; expiresAt: number }) => Promise<PublishResult>;
	url: (pageId: string) => string;
	/** Short notes for the thread's working memory. */
	notes: string[];
};

export function publishPageTool(options: PublishPageOptions): AgentTool<any, any> {
	const { modes, defaultAccess, expiryDays } = options;
	const other = modes.find((mode) => mode !== defaultAccess);
	const who = other
		? `Who can view it: ${accessText(defaultAccess)} ("${defaultAccess}", the default), or ${accessText(other)} ("${other}") when someone asks for that.`
		: `Who can view it: ${accessText(defaultAccess)}.`;
	return {
		id: PUBLISH_PAGE_TOOL_ID,
		description: [
			"Publish a web page (a report, a table, a chart or a small interactive view) and get its link.",
			"Use it when someone asks for a page, report or dashboard, or when the answer is too long or too rich for a Slack message. Then give the link in your reply as a Markdown link with the page's title, and sum up the page in a sentence or two.",
			"Write one complete, self-contained HTML document with inline <style> and <script> only. The page can't load anything: no external scripts, styles, fonts, images or requests, so draw charts with inline SVG or canvas and embed any image as a data: URL.",
			"Scripts run in a sandbox: no forms, pop-ups, alert dialogs, cookies, storage or network.",
			`At most ${(MAX_PAGE_BYTES / 1024).toLocaleString("en-US")} KB, and ${MAX_PAGES_PER_ANSWER} pages per answer. The page is kept for ${expiryDays} days, then deleted.`,
			who,
			"Put only what the people in this conversation would share with its viewers on it, and never secrets or credentials.",
		].join(" "),
		parameters: {
			type: "object",
			properties: {
				title: { type: "string", description: `The page's title, up to ${MAX_PAGE_TITLE_CHARS} characters. It is the link text in Slack and the page's <title>.` },
				html: { type: "string", description: "The whole HTML document, starting with <!doctype html>." },
				...(modes.length > 1 ? { access: { type: "string", enum: modes, description: `Who can view the page. Default: ${defaultAccess}.` } } : {}),
			},
			required: ["title", "html"],
			additionalProperties: false,
		},
		onError: "return-to-model",
		execute: async (input: Record<string, unknown>) => {
			const title = typeof input.title === "string" ? oneLine(input.title) : "";
			if (!title) throw new ToolInputError("title must not be empty");
			if ([...title].length > MAX_PAGE_TITLE_CHARS) throw new ToolInputError(`title must be at most ${MAX_PAGE_TITLE_CHARS} characters`);
			const html = typeof input.html === "string" ? input.html.trim() : "";
			if (!html) throw new ToolInputError("html must not be empty");
			const bytes = utf8Bytes(html);
			if (bytes > MAX_PAGE_BYTES) throw new ToolInputError(`html is ${Math.ceil(bytes / 1024).toLocaleString("en-US")} KB; a page may be at most ${(MAX_PAGE_BYTES / 1024).toLocaleString("en-US")} KB. Make it smaller.`);
			const asked = input.access ?? defaultAccess;
			if (typeof asked !== "string" || !(modes as string[]).includes(asked)) throw new ToolInputError(`access must be one of: ${modes.join(", ")}`);
			const access = asked as PageAccess;
			const now = options.now();
			const result = await options.publish({ title, html, access, expiresAt: now + expiryDays * DAY_MS });
			options.notes.push(PUBLISH_PAGE_TOOL_ID);
			switch (result.status) {
				case "answer_limit":
					throw new Error(`You've published ${MAX_PAGES_PER_ANSWER} pages in this answer, the most one answer may publish. Link the ones you have.`);
				case "full":
					throw new Error(`This Slack workspace already keeps ${MAX_LIVE_PAGES} pages, the most it may keep. Say so: an admin can delete old pages in Phaseo settings (Settings → Slack), or they expire.`);
				case "too_large":
					throw new ToolInputError(`a page may be at most ${(MAX_PAGE_BYTES / 1024).toLocaleString("en-US")} KB. Make it smaller.`);
				case "published":
					return {
						url: options.url(result.id),
						title,
						who_can_view: accessText(access),
						expires_on: new Date(result.expiresAt).toISOString().slice(0, 10),
						pages_left_in_answer: MAX_PAGES_PER_ANSWER - result.answerPages,
					};
			}
		},
	};
}

/**
 * publish_page for a turn, when it may publish: pages are on and served here, the
 * person isn't from another organisation, and at least one way of sharing is
 * allowed. Its pages go to the installation's store.
 */
export async function turnPageTools(deps: { env: Env; db: Db; now: () => number }, turn: Pick<TurnRef, "eventId" | "slackUserId" | "external">, installation: Installation, notes: string[]): Promise<AgentTool<any, any>[]> {
	if (!installation.pages_enabled || turn.external || !UUID_PATTERN.test(installation.id)) return [];
	const origin = pagesOrigin(deps.env);
	if (!origin) return [];
	const modes = pageAccessModes(installation, await pageSignInAvailable(deps.env, deps.db, installation));
	const defaultAccess = defaultPageAccess(installation, modes);
	if (!defaultAccess) return [];
	const store = pageStoreFor(deps.env, installation.id);
	const storeKey = pageStoreKey(deps.env, installation.id);
	return [publishPageTool({
		modes,
		defaultAccess,
		expiryDays: pageExpiryDays(installation),
		now: deps.now,
		notes,
		url: (pageId) => pageUrl(origin, storeKey, pageId),
		publish: async (page) => {
			const result: PublishResult = await store.publish({ ...page, installationId: installation.id, eventId: turn.eventId, createdBy: turn.slackUserId, now: deps.now() });
			console.log("[slack-agent] page publish", { installationId: installation.id, eventId: turn.eventId, status: result.status, access: page.access, bytes: utf8Bytes(page.html) });
			return result;
		},
	})];
}
