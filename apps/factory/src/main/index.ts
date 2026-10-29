import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, shell } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decodeProofText } from "../shared/proofText";
import { proofKind } from "../shared/report";
import type { FactorySettings, FactorySnapshot, GithubChange, ItemAction, NewIssueInput, StartRunInput, WindowUpdate, WorkItem } from "../shared/types";
import { localClones } from "./clones";
import { isGithubImage } from "../shared/githubImages";
import { checkoutRepo, githubToken } from "./github";
import { FactoryStore } from "./store";
import { version as FACTORY_VERSION } from "../../package.json";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.join(currentDirectory, "../preload/index.cjs");
const rendererPath = path.join(currentDirectory, "../renderer/index.html");
// The window and taskbar icon; macOS takes the app bundle's instead. Packaging copies assets beside dist.
const iconPath = path.join(currentDirectory, "../../assets/icon.png");
const developmentUrl = process.env.PHASEO_FACTORY_DEV_URL;
const demo = process.env.PHASEO_FACTORY_DEMO === "1" || process.argv.includes("--demo");

// Factory keeps its own profile so it never shares storage with the Phaseo desktop app.
app.setName("Phaseo Factory");
// Its own taskbar entry and icon on Windows, rather than grouping with every other Electron app.
if (process.platform === "win32") app.setAppUserModelId("app.phaseo.factory");
if (process.env.PHASEO_FACTORY_USER_DATA) app.setPath("userData", process.env.PHASEO_FACTORY_USER_DATA);

// Proof files (screenshots, recordings, logs) are served from each run's folder as factory-proof://<run>/<file>.
// Images on GitHub show through factory-image://image/?url=<GitHub URL>, fetched with gh's sign-in so private repositories' ones load.
protocol.registerSchemesAsPrivileged([
	{ scheme: "factory-proof", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
	{ scheme: "factory-image", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

/** The last images read, so scrolling back up doesn't ask GitHub again: up to this much, none bigger than a tenth of it. */
const IMAGE_CACHE_BYTES = 40 * 1024 * 1024;
const images = new Map<string, { type: string; bytes: ArrayBuffer }>();
let imageBytes = 0;

let store: FactoryStore;

function isAllowedExternalUrl(url: string) {
	try {
		const parsed = new URL(url);
		// Comments and reports link anywhere on the web; a click opens the link in the browser, never in this window.
		return parsed.protocol === "https:" || parsed.protocol === "http:";
	} catch {
		return false;
	}
}

export function createWindow(options: { show?: boolean; width?: number; height?: number } = {}): BrowserWindow {
	const window = new BrowserWindow({
		width: options.width ?? 1440,
		height: options.height ?? 900,
		// Narrower than about 820 the list and an item take turns, so the window can go as narrow as a phone.
		minWidth: 400,
		minHeight: 640,
		show: false,
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#0a0a0a" : "#ffffff",
		title: "Phaseo Factory",
		icon: process.platform === "darwin" ? undefined : iconPath,
		frame: process.platform === "darwin",
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
		trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 14 } : undefined,
		webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true },
	});
	if (options.show !== false) window.once("ready-to-show", () => window.show());
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (isAllowedExternalUrl(url)) void shell.openExternal(url);
		return { action: "deny" };
	});
	// The window only ever moves within its own page (the #/ routes); anything else is stopped.
	window.webContents.on("will-navigate", (event, url) => {
		const page = (address: string) => {
			const parsed = new URL(address);
			return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
		};
		if (page(url) !== page(window.webContents.getURL())) event.preventDefault();
	});
	if (developmentUrl) void window.loadURL(developmentUrl);
	else void window.loadFile(rendererPath);
	return window;
}

/** The window's copy: items without their descriptions, made once per change to the list. */
const slimItems = new WeakMap<WorkItem[], WorkItem[]>();
function forWindow(snapshot: FactorySnapshot): FactorySnapshot {
	let items = slimItems.get(snapshot.items);
	if (!items) {
		items = snapshot.items.map((item) => ({ ...item, body: "" }));
		slimItems.set(snapshot.items, items);
	}
	return { ...snapshot, items };
}

/** Runs log a line every few seconds; the list only goes again when it changed. */
let sentItems: WorkItem[] | null = null;
function broadcast() {
	const snapshot = forWindow(store.get());
	const message: WindowUpdate = snapshot.items === sentItems ? { ...snapshot, items: undefined } : snapshot;
	sentItems = snapshot.items;
	for (const window of BrowserWindow.getAllWindows()) window.webContents.send("factory:changed", message);
}

let broadcastQueued = false;
function broadcastSoon() {
	if (broadcastQueued) return;
	broadcastQueued = true;
	setTimeout(() => {
		broadcastQueued = false;
		broadcast();
	}, 50);
}

function registerIpc() {
	ipcMain.handle("factory:snapshot", () => forWindow(store.get()));
	ipcMain.handle("factory:refresh", async () => forWindow(await store.refresh()));
	ipcMain.handle("factory:update-settings", async (_event, patch: Partial<FactorySettings>) => forWindow(await store.updateSettings(patch)));
	ipcMain.handle("factory:item-body", (_event, itemId: string) => store.itemBody(itemId));
	ipcMain.handle("factory:similar-items", (_event, itemId: string) => store.similarItems(itemId));
	ipcMain.handle("factory:item-comments", (_event, itemId: string) => store.itemComments(itemId));
	ipcMain.handle("factory:chat-send", (_event, itemId: string, text: string) => store.chatSend(itemId, text));
	ipcMain.handle("factory:chat-stop", (_event, itemId: string) => store.chatStop(itemId));
	ipcMain.handle("factory:chat-agent", (_event, itemId: string, agentId: string) => store.chatAgent(itemId, agentId));
	ipcMain.handle("factory:chat-clear", (_event, itemId: string) => store.chatClear(itemId));
	ipcMain.handle("factory:add-note", (_event, repo: string, text: string) => store.addNote(repo, text));
	ipcMain.handle("factory:remove-note", (_event, repo: string, noteId: string) => store.removeNote(repo, noteId));
	ipcMain.handle("factory:update-note", (_event, repo: string, noteId: string, patch: { text?: string; pinned?: boolean; flagged?: false; acceptProposed?: boolean; moveTo?: string }) => store.updateNote(repo, noteId, patch));
	ipcMain.handle("factory:start-run", (_event, input: StartRunInput) => store.startRun(input));
	ipcMain.handle("factory:cancel-run", (_event, runId: string) => store.cancelRun(runId));
	ipcMain.handle("factory:assign", (_event, itemId: string, agentId: string | null) => store.assign(itemId, agentId));
	ipcMain.handle("factory:send-message", (_event, itemId: string, text: string) => store.sendMessage(itemId, text));
	ipcMain.handle("factory:create-issue", (_event, input: NewIssueInput) => store.createIssue(input));
	ipcMain.handle("factory:add-repo", (_event, repo: string, checkout: string) => store.addRepo(repo, checkout));
	ipcMain.handle("factory:remove-repo", (_event, repo: string) => store.removeRepo(repo));
	ipcMain.handle("factory:order-repos", (_event, order: string[]) => store.orderRepos(order));
	ipcMain.handle("factory:change-on-github", (_event, itemId: string, change: GithubChange) => store.changeOnGithub(itemId, change));
	ipcMain.handle("factory:merge-state", (_event, itemId: string) => store.mergeState(itemId));
	ipcMain.handle("factory:item-timeline", (_event, itemId: string) => store.itemTimeline(itemId));
	ipcMain.handle("factory:repo-labels", (_event, itemId: string) => store.repoLabels(itemId));
	ipcMain.handle("factory:assignable", (_event, itemId: string, query: string) => store.assignable(itemId, query));
	ipcMain.handle("factory:item-checks", (_event, itemId: string) => store.itemChecks(itemId));
	ipcMain.handle("factory:check-update", () => store.checkForUpdate(FACTORY_VERSION));
	ipcMain.handle("factory:pull-files", (_event, itemId: string) => store.pullFiles(itemId));
	ipcMain.handle("factory:check-log", (_event, itemId: string, link: string) => store.checkLog(itemId, link));
	ipcMain.handle("factory:mentions", (_event, itemId: string, query: string) => store.mentions(itemId, query));
	ipcMain.handle("factory:import-repo", (_event, repo: string) => store.importRepo(repo));
	ipcMain.handle("factory:pick-checkout", async (event) => {
		const window = BrowserWindow.fromWebContents(event.sender);
		const options = { title: "Choose a local clone of the repository", properties: ["openDirectory" as const] };
		const picked = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
		const dir = picked.canceled ? undefined : picked.filePaths[0];
		return dir ? { path: dir, repo: await checkoutRepo(dir) } : null;
	});
	ipcMain.handle("factory:local-clones", () => localClones());
	ipcMain.handle("factory:act", (_event, itemId: string, action: ItemAction) => store.act(itemId, action));
	ipcMain.handle("factory:open-external", (_event, url: string) => (isAllowedExternalUrl(url) ? shell.openExternal(url) : undefined));
	ipcMain.handle("factory:window", (event, action: "minimize" | "maximize" | "close") => {
		const window = BrowserWindow.fromWebContents(event.sender);
		if (!window) return;
		if (action === "minimize") window.minimize();
		else if (action === "maximize") {
			if (window.isMaximized()) window.unmaximize();
			else window.maximize();
		} else window.close();
	});
}

export async function startFactory(options: { createMainWindow?: boolean } = {}) {
	await app.whenReady();
	store = new FactoryStore(app.getPath("userData"), demo, broadcastSoon);
	registerIpc();
	protocol.handle("factory-image", async (request) => {
		const target = new URL(request.url).searchParams.get("url") ?? "";
		// Only GitHub's own image addresses, and the token only ever goes to GitHub.
		if (!isGithubImage(target)) return new Response("Not a GitHub image", { status: 400 });
		const cached = images.get(target);
		if (cached) return new Response(cached.bytes, { headers: { "content-type": cached.type, "cache-control": "private, max-age=3600" } });
		const auth = await githubToken();
		const response = await fetch(target, { headers: auth ? { authorization: `token ${auth}` } : {}, redirect: "follow" }).catch(() => null);
		const type = response?.headers.get("content-type") ?? "";
		if (!response?.ok || !/^(image|video)\//.test(type)) return new Response("Couldn't load the image", { status: response?.status ?? 502 });
		const bytes = await response.arrayBuffer();
		if (bytes.byteLength <= IMAGE_CACHE_BYTES / 10) {
			images.set(target, { type, bytes });
			imageBytes += bytes.byteLength;
			for (const [oldest, entry] of images) {
				if (imageBytes <= IMAGE_CACHE_BYTES) break;
				images.delete(oldest);
				imageBytes -= entry.bytes.byteLength;
			}
		}
		return new Response(bytes, { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
	});

	protocol.handle("factory-proof", async (request) => {
		const url = new URL(request.url);
		// factory-proof://inputs/<repo>-<issue>/<image> is an image someone attached to an issue.
		const [first, second] = url.pathname.slice(1).split("/").map(decodeURIComponent);
		const file = url.hostname === "inputs" ? store.attachmentFile(first ?? "", second ?? "") : store.proofFile(url.hostname, decodeURIComponent(url.pathname.slice(1)));
		// The page comes from file://, so text proof read with fetch() is a cross-origin request and needs this header.
		const cors = { "access-control-allow-origin": "*" };
		if (!file) return new Response("Not found", { status: 404, headers: cors });
		if ("body" in file) return new Response(file.body, { headers: { "content-type": file.type, ...cors } });
		// Logs and diffs go out as plain UTF-8, whatever encoding the agent saved them in.
		if (url.hostname !== "inputs" && proofKind(file.path) === "text") {
			const text = await readFile(file.path).then((bytes) => decodeProofText(bytes), () => null);
			return text === null ? new Response("Not found", { status: 404, headers: cors }) : new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", ...cors } });
		}
		const response = await net.fetch(pathToFileURL(file.path).toString(), { headers: request.headers });
		const headers = new Headers(response.headers);
		headers.set("access-control-allow-origin", "*");
		return new Response(response.body, { status: response.status, headers });
	});
	app.on("browser-window-focus", () => store.refreshIfStale());
	await store.load();
	if (options.createMainWindow !== false) createWindow();
	void store.start().catch(() => undefined);
	// Releases come out every few days at most: at the start, then every six hours, is plenty.
	void store.checkForUpdate(FACTORY_VERSION);
	setInterval(() => void store.checkForUpdate(FACTORY_VERSION), UPDATE_EVERY).unref();
}

const UPDATE_EVERY = 6 * 3_600_000;

// Every way of quitting (closing the last window, Cmd+Q, the Dock, app.quit) comes through here once. Quitting
// waits for Factory to save, with the runs going marked to carry on next time, and then goes ahead.
let quitting: "no" | "saving" | "done" = "no";
app.on("before-quit", (event) => {
	if (!store || quitting === "done") return;
	event.preventDefault();
	if (quitting === "saving") return;
	quitting = "saving";
	// It never hangs on the way out: after a few seconds Factory quits anyway, with its last finished save.
	void Promise.race([store.shutdown(), new Promise((resolve) => setTimeout(resolve, 5_000))]).finally(() => {
		quitting = "done";
		app.quit();
	});
});

app.on("window-all-closed", () => {
	// On macOS the app stays in the Dock without a window, as Mac apps do; the Dock icon opens it again.
	if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
	if (store && quitting === "no" && BrowserWindow.getAllWindows().length === 0) createWindow();
});

if (!process.env.PHASEO_FACTORY_CAPTURE) void startFactory();
