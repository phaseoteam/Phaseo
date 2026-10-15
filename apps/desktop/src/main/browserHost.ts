import { clipboard, screen, session, WebContentsView, type BrowserWindow } from "electron";
import { browserCommand, browserDeviceFrame, browserUrl, stepBrowserZoom, type BrowserCapture, type BrowserColorScheme, type BrowserFailure, type BrowserKey, type BrowserPick, type BrowserState, type BrowserViewport } from "../shared/browser";
import { matchesKey } from "../shared/keybindings";

import { BrowserDownloads } from "./browserDownloads";
import { BrowserPermissions } from "./browserPermissions";
import { pickScript } from "./browserPick";

/** Per-page settings and status the native web contents do not keep for us. */
type PageInfo = { viewport: BrowserViewport; zoom: number; colorScheme: BrowserColorScheme; configured: boolean; emulated: boolean; favicon?: string; failure?: BrowserFailure; crashed?: boolean };
const pickWorld = 1001;
const mac = process.platform === "darwin";

export class BrowserHost {
 private permissions = new BrowserPermissions(contents => {
  for (const [owner, views] of this.owners) for (const view of views.values()) if (view.webContents === contents && !owner.isDestroyed()) return { owner, visible: owner.isVisible() && !owner.isMinimized() && owner.contentView.children.includes(view) };
  return undefined;
 });
 readonly downloads = new BrowserDownloads();
 /** Keys the app's shortcuts use; pressed in a page, they go to the app instead. */
 shortcutKeys: readonly { key: string; keepPageFocus: boolean }[] = [];
 private downloadSession?: Electron.Session;
 private configureDownloads(browserSession: Electron.Session) {
  if (this.downloadSession === browserSession) return;
  this.downloadSession = browserSession;
  browserSession.on("will-download", (event, item, contents) => {
   for (const [owner, views] of this.owners) for (const [id, view] of views) if (view.webContents === contents && !owner.isDestroyed()) { this.downloads.accept(owner, id, item); return; }
   event.preventDefault();
  });
 }
	private pages = new WeakMap<WebContentsView, PageInfo>();
	private frames = new WeakMap<WebContentsView, Electron.Rectangle>();
	private owners = new Map<BrowserWindow, Map<string, WebContentsView>>();
	private favicons = new Map<string, string>();
	private session() { return session.fromPartition("persist:phaseo-browser"); }
	command(owner: BrowserWindow, value: unknown): BrowserState | undefined {
		const command = browserCommand(value);
		const views = this.viewsFor(owner);
		let view = views.get(command.id);
		if (command.type === "hide" || command.type === "close") {
			if (view) { this.permissions.cancel(view.webContents); owner.contentView.removeChildView(view); if (command.type === "close") { view.webContents.close({ waitForBeforeUnload: false }); views.delete(command.id); } }
			return view && !view.webContents.isDestroyed() ? this.state(command.id, view) : undefined;
		}
		if (!view) view = this.create(owner, views, command.id);
		const contents = view.webContents, page = this.page(view);
		if (["navigate", "reload", "hardReload", "back", "forward"].includes(command.type)) { page.failure = undefined; page.crashed = undefined; }
		switch (command.type) {
			case "show": {
				for (const candidate of views.values()) { if (candidate !== view) this.permissions.cancel(candidate.webContents); owner.contentView.removeChildView(candidate); }
				const zoom = owner.webContents.getZoomFactor(); const [width, height] = owner.getContentSize();
				const x = Math.max(0, Math.min(width, Math.round(command.bounds.x * zoom))); const y = Math.max(0, Math.min(height, Math.round(command.bounds.y * zoom)));
				this.frames.set(view, { x, y, width: Math.max(0, Math.min(width - x, Math.round(command.bounds.width * zoom))), height: Math.max(0, Math.min(height - y, Math.round(command.bounds.height * zoom))) });
				this.applyViewport(view);
				owner.contentView.addChildView(view); view.setVisible(Boolean(contents.getURL()) && !page.failure);
				break;
			}
			case "navigate": page.configured = true; view.setVisible(true); void contents.loadURL(command.url).catch(() => undefined); break;
			case "back": if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack(); break;
			case "forward": if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward(); break;
			case "reload": contents.reload(); break;
			case "hardReload": contents.reloadIgnoringCache(); break;
			case "stop": contents.stop(); break;
			case "devtools": this.toggleDevTools(contents); break;
			case "focus": contents.focus(); break;
			case "viewport": page.viewport = command.viewport; page.configured = true; this.applyViewport(view); break;
			case "zoom": page.zoom = command.zoom; contents.setZoomFactor(command.zoom); break;
			case "colorScheme": page.colorScheme = command.colorScheme; void this.applyColorScheme(contents, command.colorScheme); break;
			case "mute": contents.setAudioMuted(command.muted); break;
			case "clearData": { const browserSession = this.session(); void (command.data === "cookies" ? browserSession.clearStorageData({ storages: ["cookies"] }) : browserSession.clearCache()); break; }
		}
		return this.state(command.id, view);
	}
	/** Screenshot of the visible page, also put on the clipboard. */
	async capture(owner: BrowserWindow, id: string): Promise<BrowserCapture> {
		const view = this.owned(owner, id);
		const image = await view.webContents.capturePage();
		if (image.isEmpty()) throw new Error("The page has nothing to capture yet.");
		clipboard.writeImage(image);
		const size = image.getSize();
		return { png: image.toPNG().toString("base64"), width: size.width, height: size.height, url: view.webContents.getURL(), title: view.webContents.getTitle() };
	}
	/** Lets the person click an element on the page; resolves with it and a screenshot of it, or undefined when cancelled. */
	async pick(owner: BrowserWindow, id: string, cancel: boolean): Promise<BrowserPick | undefined> {
		const view = this.owned(owner, id); const contents = view.webContents;
		if (cancel) { await contents.executeJavaScriptInIsolatedWorld(pickWorld, [{ code: "window.__phaseoPick?.cancel()" }]).catch(() => undefined); return; }
		contents.focus();
		// A page that navigates or crashes mid-pick takes the picker with it, so that ends the pick too.
		let stop = () => {};
		const interrupted = new Promise<null>(resolve => {
			const navigation = (details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>) => { if (details.isMainFrame && !details.isSameDocument) resolve(null); };
			const gone = () => resolve(null);
			contents.on("did-start-navigation", navigation); contents.once("render-process-gone", gone); contents.once("destroyed", gone);
			stop = () => { contents.off("did-start-navigation", navigation); contents.off("render-process-gone", gone); contents.off("destroyed", gone); };
		});
		const script = contents.executeJavaScriptInIsolatedWorld(pickWorld, [{ code: pickScript }], true) as Promise<{ selector: string; text: string; tag: string; rect: { x: number; y: number; width: number; height: number } } | null>;
		const picked = await Promise.race([script.catch(() => null), interrupted]).finally(stop);
		if (!picked || contents.isDestroyed()) return;
		const page = this.page(view), bounds = view.getBounds();
		const scale = page.zoom * (page.viewport.mode === "device" ? bounds.width / page.viewport.width : 1);
		const pad = 8, x = Math.max(0, Math.floor((picked.rect.x - pad) * scale)), y = Math.max(0, Math.floor((picked.rect.y - pad) * scale));
		const rect = { x, y, width: Math.max(1, Math.min(bounds.width - x, Math.ceil((picked.rect.width + pad * 2) * scale))), height: Math.max(1, Math.min(bounds.height - y, Math.ceil((picked.rect.height + pad * 2) * scale))) };
		const image = await contents.capturePage(rect);
		const size = image.getSize();
		return { selector: String(picked.selector).slice(0, 500), text: String(picked.text).slice(0, 500), tag: String(picked.tag).slice(0, 40), png: image.toPNG().toString("base64"), width: size.width, height: size.height, url: contents.getURL(), title: contents.getTitle() };
	}
	private owned(owner: BrowserWindow, id: string) {
		const view = this.owners.get(owner)?.get(id);
		if (!view || view.webContents.isDestroyed() || !view.webContents.getURL()) throw new Error("Open a page first.");
		return view;
	}
	private viewsFor(owner: BrowserWindow) {
		let views = this.owners.get(owner);
		if (views) return views;
		views = new Map(); this.owners.set(owner, views);
		const ownedViews = views;
		const cancelPermissions = () => { for (const view of ownedViews.values()) this.permissions.cancel(view.webContents); };
		owner.on("hide", cancelPermissions); owner.on("minimize", cancelPermissions);
		owner.webContents.on("did-start-loading", () => { if (!owner.isDestroyed()) for (const view of ownedViews.values()) { this.permissions.cancel(view.webContents); owner.contentView.removeChildView(view); } });
		owner.once("closed", () => { for (const view of ownedViews.values()) if (!view.webContents.isDestroyed()) { this.permissions.cancel(view.webContents); view.webContents.close({ waitForBeforeUnload: false }); } this.owners.delete(owner); });
		// The mouse's back and forward buttons arrive as window commands on Windows and Linux; they act on the page under the pointer.
		owner.on("app-command", (_event, name) => {
			if (name !== "browser-backward" && name !== "browser-forward") return;
			const point = screen.getCursorScreenPoint(), content = owner.getContentBounds();
			const x = point.x - content.x, y = point.y - content.y;
			for (const view of ownedViews.values()) {
				const bounds = view.getBounds(), history = view.webContents.navigationHistory;
				if (!owner.contentView.children.includes(view) || !view.getVisible() || x < bounds.x || y < bounds.y || x >= bounds.x + bounds.width || y >= bounds.y + bounds.height) continue;
				if (name === "browser-backward" && history.canGoBack()) history.goBack();
				if (name === "browser-forward" && history.canGoForward()) history.goForward();
			}
		});
		return views;
	}
	private create(owner: BrowserWindow, views: Map<string, WebContentsView>, id: string) {
		const browserSession = this.session();
		this.configureDownloads(browserSession);
		this.permissions.configure(browserSession);
		const view = new WebContentsView({ webPreferences: { session: browserSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
		views.set(id, view);
		const page: PageInfo = { viewport: { mode: "fill" }, zoom: 1, colorScheme: "system", configured: false, emulated: false };
		this.pages.set(view, page);
		const contents = view.webContents;
		contents.setIgnoreMenuShortcuts(true);
		this.permissions.register(contents);
		const emit = (error?: string) => { if (!owner.isDestroyed() && !contents.isDestroyed()) owner.webContents.send("desktop:browser-state", { ...this.state(id, view), ...(error ? { error } : {}) }); };
		contents.on("did-start-loading", () => { page.crashed = undefined; emit(); }); contents.on("did-stop-loading", () => emit()); contents.on("did-navigate-in-page", () => emit()); contents.on("page-title-updated", () => emit());
		contents.on("did-start-navigation", details => { if (details.isMainFrame && !details.isSameDocument && !details.url.startsWith("chrome-error:")) { page.failure = undefined; page.favicon = undefined; } });
		// Chromium keeps zoom per site; each tab keeps its own, so it is set again after every navigation.
		contents.on("did-navigate", () => { if (contents.getZoomFactor() !== page.zoom) contents.setZoomFactor(page.zoom); if (owner.contentView.children.includes(view) && !page.failure) view.setVisible(true); emit(); });
		contents.on("dom-ready", () => { this.applyViewport(view); if (page.colorScheme !== "system") void this.applyColorScheme(contents, page.colorScheme); });
		contents.on("devtools-opened", () => emit()); contents.on("devtools-closed", () => emit());
		contents.on("audio-state-changed", () => emit());
		contents.on("page-favicon-updated", (_event, favicons) => { void this.favicon(contents, favicons).then(value => { page.favicon = value; emit(); }); });
		contents.on("render-process-gone", (_event, details) => { if (details.reason === "clean-exit") return; page.crashed = true; page.emulated = false; emit(); });
		contents.on("zoom-changed", (_event, direction) => { page.zoom = stepBrowserZoom(page.zoom, direction === "in" ? 1 : -1); contents.setZoomFactor(page.zoom); emit(); });
		contents.on("before-input-event", (event, input) => {
			if (input.type !== "keyDown" || input.isComposing) return;
			if (!input.isAutoRepeat && (input.key === "F12" || (input.key.toLowerCase() === "i" && ((input.control && input.shift) || (input.meta && input.alt))))) { event.preventDefault(); this.toggleDevTools(contents); return; }
			// Ctrl+Alt with a symbol is AltGr typing on Windows keyboards, never a shortcut.
			if (!mac && input.control && input.alt && /^(?:[^a-zA-Z0-9]|Dead)$/.test(input.key)) return;
			const key = { key: input.key, ctrlKey: input.control, metaKey: input.meta, altKey: input.alt, shiftKey: input.shift };
			const matched = this.shortcutKeys.filter(value => matchesKey(value.key, key, mac));
			if (!matched.length) return;
			event.preventDefault();
			if (owner.isDestroyed()) return;
			// App commands such as the command palette need the keyboard; reload and zoom leave it with the page.
			if (!matched.some(value => value.keepPageFocus)) owner.webContents.focus();
			owner.webContents.send("desktop:browser-key", { id, key: input.key, ctrl: input.control, meta: input.meta, alt: input.alt, shift: input.shift } satisfies BrowserKey);
		});
		contents.on("did-fail-load", (_event, code, description, url, mainFrame) => { if (!mainFrame || code === -3) return; page.failure = { url, code, description }; view.setVisible(false); emit(); });
		contents.on("will-navigate", event => { try { browserUrl(event.url); } catch { event.preventDefault(); emit("This address cannot be opened in the browser."); } });
		contents.on("will-redirect", event => { try { browserUrl(event.url); } catch { event.preventDefault(); } });
		contents.setWindowOpenHandler(({ url, disposition }) => { try { const target = browserUrl(url); if (!owner.isDestroyed() && owner.contentView.children.includes(view)) owner.webContents.send("desktop:browser-open-tab", { sourceId: id, url: target, background: disposition === "background-tab" }); } catch { emit("This address cannot be opened in the browser."); } return { action: "deny" }; });
		return view;
	}
	private page(view: WebContentsView): PageInfo { return this.pages.get(view)!; }
	private applyViewport(view: WebContentsView) {
		const page = this.page(view), viewport = page.viewport, contents = view.webContents;
		const frame = this.frames.get(view) ?? view.getBounds();
		if (viewport.mode === "fill") { view.setBounds(frame); if (page.emulated && contents.getURL()) { contents.disableDeviceEmulation(); page.emulated = false; } return; }
		const bounds = browserDeviceFrame(frame, viewport);
		view.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
		if (!contents.getURL()) return;
		const size = { width: viewport.width, height: viewport.height };
		contents.enableDeviceEmulation({ screenPosition: "mobile", screenSize: size, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 1, viewSize: size, scale: Math.max(.1, Math.min(1, bounds.width / size.width, bounds.height / size.height)) });
		page.emulated = true;
	}
	/** prefers-color-scheme for one page, through the DevTools protocol; System detaches and lets the page follow the computer. */
	private async applyColorScheme(contents: Electron.WebContents, scheme: BrowserColorScheme) {
		const debug = contents.debugger;
		try {
			if (scheme === "system") { if (debug.isAttached()) { await debug.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "" }] }); debug.detach(); } return; }
			if (!debug.isAttached()) debug.attach("1.3");
			await debug.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
		} catch { /* A page that is closing or has its own debugger keeps its colours. */ }
	}
	/** The page's icon as an address the app may show: HTTPS as is, anything else read through the browser session into a data address. */
	private async favicon(contents: Electron.WebContents, candidates: string[]): Promise<string | undefined> {
		const source = candidates.find(value => /^(?:https?:|data:image\/)/i.test(value));
		if (!source) return;
		if (source.startsWith("https:")) return source;
		if (source.startsWith("data:")) return source.length <= 65536 ? source : undefined;
		const cached = this.favicons.get(source); if (cached) return cached;
		try {
			const response = await contents.session.fetch(source, { signal: AbortSignal.timeout(3000) });
			const type = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
			if (!response.ok || !type.startsWith("image/")) return;
			const bytes = Buffer.from(await response.arrayBuffer());
			if (bytes.length > 65536) return;
			const value = `data:${type};base64,${bytes.toString("base64")}`;
			if (this.favicons.size > 200) this.favicons.clear();
			this.favicons.set(source, value);
			return value;
		} catch { return; }
	}
	private toggleDevTools(contents: Electron.WebContents) { if (contents.isDevToolsOpened()) contents.closeDevTools(); else contents.openDevTools({ mode: "detach" }); }
	private state(id: string, view: WebContentsView): BrowserState {
		const contents = view.webContents, page = this.page(view);
		return { id, url: contents.getURL(), title: contents.getTitle(), loading: contents.isLoading(), canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward(), devToolsOpen: contents.isDevToolsOpened(), viewport: page.viewport, zoom: page.zoom, colorScheme: page.colorScheme, audible: contents.isCurrentlyAudible(), muted: contents.isAudioMuted(), configured: page.configured, ...(page.favicon ? { favicon: page.favicon } : {}), ...(page.failure ? { failure: page.failure } : {}), ...(page.crashed ? { crashed: true } : {}) };
	}
}
