import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from "electron";
import { attachmentKey } from "../../shared/factory/attachments";
import { isGithubImage } from "../../shared/factory/githubImages";
import { decodeProofText } from "../../shared/factory/proofText";
import { proofKind } from "../../shared/factory/report";
import type { FactorySettings, FactorySnapshot, GithubChange, ItemAction, NewIssueInput, NotePatch, StartRunInput, WorkItem } from "../../shared/factory/types";
import { localClones } from "./clones";
import { checkoutRepo, githubToken } from "./github";
import type { FactoryService } from "./service";

/**
 * Factory's IPC: `factory:<method>` for each FactoryApi method, and `factory:changed` with the snapshot after changes.
 * Every handler answers only the app's own windows. Items go without their descriptions (itemBody reads one), and
 * the item list only when it changed, as Factory's own window had it.
 */

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const IMAGE_CACHE_BYTES = 40 * 1024 * 1024;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", pdf: "application/pdf", json: "application/json" };

const dataUrl = (type: string, bytes: Uint8Array) => `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;

/** A file a run or an issue keeps, as a data: URL: text as UTF-8 whatever the agent saved it in. */
async function fileUrl(file: { path: string } | { body: string; type: string } | null): Promise<string | null> {
	if (!file) return null;
	if ("body" in file) return dataUrl(file.type, Buffer.from(file.body, "utf8"));
	const size = await stat(file.path).then((info) => info.size, () => -1);
	if (size < 0 || size > MAX_FILE_BYTES) return null;
	const bytes = await readFile(file.path).catch(() => null);
	if (!bytes) return null;
	if (proofKind(file.path) === "text") return dataUrl("text/plain;charset=utf-8", Buffer.from(decodeProofText(bytes), "utf8"));
	return dataUrl(MIME[path.extname(file.path).slice(1).toLowerCase()] ?? "application/octet-stream", bytes);
}

export function registerFactoryIpc(ipcMain: IpcMain, factory: () => FactoryService | undefined, senderWindow: (event: IpcMainInvokeEvent) => BrowserWindow | null, chooseFolder: (window: BrowserWindow) => Promise<string | undefined>) {
	const service = (event: IpcMainInvokeEvent) => {
		const current = factory();
		if (!senderWindow(event) || !current) throw new Error("Factory is unavailable.");
		return current.store;
	};
	const text = (value: unknown, maximum = 1000) => {
		if (typeof value !== "string" || value.length > maximum) throw new Error("Invalid Factory request.");
		return value;
	};
	// Saved state loads after the window opens: anything but a snapshot waits for it, or loading would overwrite the change.
	const handle = (channel: string, run: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) => ipcMain.handle(`factory:${channel}`, async (event, ...args) => {
		if (channel !== "snapshot") await factory()?.start().catch(() => undefined);
		return run(event, ...args);
	});
	const images = new Map<string, string>();
	let imageBytes = 0;

	handle("snapshot", (event) => forWindow(service(event).get()));
	handle("refresh", async (event) => forWindow(await service(event).refresh()));
	handle("update-settings", async (event, patch) => forWindow(await service(event).updateSettings((patch ?? {}) as Partial<FactorySettings>)));
	handle("start-run", (event, input) => service(event).startRun(input as StartRunInput));
	handle("cancel-run", (event, runId) => service(event).cancelRun(text(runId)));
	handle("assign", (event, itemId, agentId) => service(event).assign(text(itemId), agentId === null ? null : text(agentId)));
	handle("set-effort", (event, itemId, effort) => service(event).setEffort(text(itemId), effort === null ? null : text(effort, 40)));
	handle("send-message", (event, itemId, message) => service(event).sendMessage(text(itemId), text(message, 100_000)));
	handle("act", (event, itemId, action) => service(event).act(text(itemId), action as ItemAction));
	handle("open-thread", (event, itemId) => service(event).openThread(text(itemId)));
	handle("create-issue", (event, input) => service(event).createIssue(input as NewIssueInput));
	handle("add-repo", (event, repo, checkout) => service(event).addRepo(text(repo), text(checkout, 4000)));
	handle("remove-repo", (event, repo) => service(event).removeRepo(text(repo)));
	handle("change-on-github", (event, itemId, change) => service(event).changeOnGithub(text(itemId), change as GithubChange));
	handle("merge-state", (event, itemId) => service(event).mergeState(text(itemId)));
	handle("item-timeline", (event, itemId) => service(event).itemTimeline(text(itemId)));
	handle("repo-labels", (event, itemId) => service(event).repoLabels(text(itemId)));
	handle("assignable", (event, itemId, query) => service(event).assignable(text(itemId), text(query, 100)));
	handle("item-checks", (event, itemId) => service(event).itemChecks(text(itemId)));
	handle("pull-files", (event, itemId) => service(event).pullFiles(text(itemId)));
	handle("check-log", (event, itemId, link) => service(event).checkLog(text(itemId), text(link, 4000)));
	handle("mentions", (event, itemId, query) => service(event).mentions(text(itemId), text(query, 100)));
	handle("order-repos", (event, order) => service(event).orderRepos(Array.isArray(order) ? order.map((repo) => text(repo)) : []));
	handle("import-repo", (event, repo) => service(event).importRepo(text(repo)));
	handle("pick-checkout", async (event) => {
		const window = senderWindow(event);
		if (!window) throw new Error("Factory is unavailable.");
		const dir = await chooseFolder(window);
		return dir ? { path: dir, repo: await checkoutRepo(dir) } : null;
	});
	handle("local-clones", (event) => {
		service(event);
		return localClones();
	});
	handle("item-body", (event, itemId) => service(event).itemBody(text(itemId)));
	handle("similar-items", (event, itemId) => service(event).similarItems(text(itemId)));
	handle("item-comments", (event, itemId) => service(event).itemComments(text(itemId)));
	handle("add-note", (event, repo, note) => service(event).addNote(text(repo), text(note, 20_000)));
	handle("remove-note", (event, repo, noteId) => service(event).removeNote(text(repo), text(noteId)));
	handle("update-note", (event, repo, noteId, patch) => service(event).updateNote(text(repo), text(noteId), (patch ?? {}) as NotePatch));
	handle("proof-file", (event, runId, name) => fileUrl(service(event).proofFile(text(runId), text(name, 300))));
	handle("attachment-file", (event, itemId, name) => {
		const store = service(event), item = store.get().items.find((candidate) => candidate.id === text(itemId));
		return item ? fileUrl(store.attachmentFile(attachmentKey(item), text(name, 300))) : null;
	});
	// GitHub's images, read with gh's sign-in so private repositories' ones load; the token only ever goes to GitHub.
	handle("github-image", async (event, url) => {
		service(event);
		const target = text(url, 4000);
		if (!isGithubImage(target)) return null;
		const cached = images.get(target);
		if (cached) return cached;
		const auth = await githubToken();
		const response = await fetch(target, { headers: auth ? { authorization: `token ${auth}` } : {}, redirect: "follow" }).catch(() => null);
		const type = response?.headers.get("content-type") ?? "";
		if (!response?.ok || !/^(image|video)\//.test(type)) return null;
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (bytes.byteLength > MAX_FILE_BYTES) return null;
		const value = dataUrl(type, bytes);
		if (bytes.byteLength <= IMAGE_CACHE_BYTES / 10) {
			images.set(target, value);
			imageBytes += value.length;
			for (const [oldest, entry] of images) {
				if (imageBytes <= IMAGE_CACHE_BYTES) break;
				images.delete(oldest);
				imageBytes -= entry.length;
			}
		}
		return value;
	});
}

/** The window's copy: items without their descriptions, made once per change to the list. */
const slimItems = new WeakMap<WorkItem[], WorkItem[]>();
export function forWindow(snapshot: FactorySnapshot): FactorySnapshot {
	let items = slimItems.get(snapshot.items);
	if (!items) {
		items = snapshot.items.map((item) => ({ ...item, body: "" }));
		slimItems.set(snapshot.items, items);
	}
	return { ...snapshot, items };
}

/**
 * Sends changes to the windows at most every 50 ms. Runs log a line every few seconds; the item list goes only when it
 * changed, so a window keeps the list it has when `items` is missing.
 */
export function factoryBroadcaster(windows: () => BrowserWindow[]) {
	let sentItems: WorkItem[] | null = null;
	let queued = false;
	let latest: FactorySnapshot | undefined;
	return (snapshot: FactorySnapshot) => {
		latest = snapshot;
		if (queued) return;
		queued = true;
		setTimeout(() => {
			queued = false;
			if (!latest) return;
			const slim = forWindow(latest);
			const message = slim.items === sentItems ? { ...slim, items: undefined } : slim;
			sentItems = slim.items;
			for (const window of windows()) if (!window.isDestroyed()) window.webContents.send("factory:changed", message);
		}, 50);
	};
}
