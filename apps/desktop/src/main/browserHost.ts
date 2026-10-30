import { BrowserWindow, clipboard, ClipboardItem, screen, session, WebContentsView } from "electron";
import { browserCommand, browserDeviceFrame, browserUrl, stepBrowserZoom, type BrowserCapture, type BrowserColorScheme, type BrowserController, type BrowserFailure, type BrowserKey, type BrowserPick, type BrowserSlot, type BrowserState, type BrowserViewport } from "../shared/browser";
import { browserAgentIdleMs, browserHumanInputMs, browserTabOfChat } from "../shared/browserAgent";
import { matchesKey } from "../shared/keybindings";

import { BrowserDownloads } from "./browserDownloads";
import { overlayControllerScript, overlayZoomScript } from "./browserOverlay";
import { BrowserPermissions } from "./browserPermissions";
import { pngPixels } from "./capturePixels";
import { pickScript } from "./browserPick";

/** Per-page settings and status the native web contents do not keep for us. */
type PageInfo = {
	viewport: BrowserViewport; zoom: number; colorScheme: BrowserColorScheme; configured: boolean; emulated: boolean; favicon?: string; failure?: BrowserFailure; crashed?: boolean;
	/** The slot showing the page, and the corner radius it asked for. */
	slot?: BrowserSlot; radius: number;
	/** Who drives the page; agent actions in flight do not count as the person's input. */
	controller: BrowserController; controllerTimer?: ReturnType<typeof setTimeout>; acting: number;
	/** An agent acted on this document, so its cursor may be drawn and the person's input is worth tracking. */
	agentSeen: boolean;
	/** The separate window the page was popped into. */
	popout?: BrowserWindow;
	emit: (error?: string) => void;
};
const pickWorld = 1001;
/** The isolated world of the agent cursor, the zoom pill and the agent's page scripts. */
export const overlayWorld = 1002;
const mac = process.platform === "darwin";
const popoutTitle = (title: string) => title.trim() ? `Browser · ${title.trim()}` : "Browser";

export class BrowserHost {
	private permissions = new BrowserPermissions(contents => {
		for (const [owner, views] of this.owners) for (const view of views.values()) {
			if (view.webContents !== contents || owner.isDestroyed()) continue;
			const popout = this.pages.get(view)?.popout;
			if (popout && !popout.isDestroyed()) return { owner: popout, visible: popout.isVisible() };
			return { owner, visible: owner.isVisible() && !owner.isMinimized() && owner.contentView.children.includes(view) };
		}
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
			if (view) {
				const page = this.page(view);
				// A slot lets go only of its own page, so a page moving between the pane and the floating player stays shown.
				const slot = command.type === "hide" ? command.slot : undefined;
				if (!slot || !page.slot || page.slot === slot) { this.permissions.cancel(view.webContents); owner.contentView.removeChildView(view); page.slot = undefined; }
				if (command.type === "close") { if (page.popout && !page.popout.isDestroyed()) page.popout.destroy(); clearTimeout(page.controllerTimer); view.webContents.close({ waitForBeforeUnload: false }); views.delete(command.id); }
			}
			return view && !view.webContents.isDestroyed() ? this.state(command.id, view) : undefined;
		}
		if (!view) view = this.create(owner, views, command.id);
		const contents = view.webContents, page = this.page(view);
		if (["navigate", "reload", "hardReload", "back", "forward"].includes(command.type)) { page.failure = undefined; page.crashed = undefined; }
		switch (command.type) {
			case "show": {
				const slot = command.slot ?? "pane";
				for (const candidate of views.values()) {
					if (candidate === view || this.page(candidate).slot !== slot) continue;
					this.permissions.cancel(candidate.webContents); owner.contentView.removeChildView(candidate); this.page(candidate).slot = undefined;
				}
				page.slot = slot; page.radius = command.radius ?? 0;
				// A popped-out page stays in its own window until that window closes.
				if (page.popout && !page.popout.isDestroyed()) break;
				const zoom = owner.webContents.getZoomFactor(); const [width, height] = owner.getContentSize();
				const x = Math.max(0, Math.min(width, Math.round(command.bounds.x * zoom))); const y = Math.max(0, Math.min(height, Math.round(command.bounds.y * zoom)));
				this.frames.set(view, { x, y, width: Math.max(0, Math.min(width - x, Math.round(command.bounds.width * zoom))), height: Math.max(0, Math.min(height - y, Math.round(command.bounds.height * zoom))) });
				this.applyViewport(view);
				view.setBorderRadius(Math.round(page.radius * zoom));
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
			case "zoom": { const changed = page.zoom !== command.zoom; page.zoom = command.zoom; contents.setZoomFactor(command.zoom); if (changed) this.showZoom(view); break; }
			case "colorScheme": page.colorScheme = command.colorScheme; void this.applyColorScheme(contents, command.colorScheme, page.emulated); break;
			case "mute": contents.setAudioMuted(command.muted); break;
			case "clearData": { const browserSession = this.session(); void (command.data === "cookies" ? browserSession.clearStorageData({ storages: ["cookies"] }) : browserSession.clearCache()); break; }
			case "popOut": this.popOut(owner, view); break;
			case "popIn": if (page.popout && !page.popout.isDestroyed()) page.popout.close(); break;
		}
		return this.state(command.id, view);
	}
	/** Screenshot of the visible page, also put on the clipboard. */
	async capture(owner: BrowserWindow, id: string): Promise<BrowserCapture> {
		const view = this.owned(owner, id);
		const image = await view.webContents.capturePage();
		if (image.isEmpty()) throw new Error("The page has nothing to capture yet.");
		const png = image.toPNG();
		await clipboard.write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(png)], { type: "image/png" }) })]);
		const size = pngPixels(png);
		return { png: png.toString("base64"), width: size.width, height: size.height, url: view.webContents.getURL(), title: view.webContents.getTitle() };
	}
	/** A stream id the app window can record the page with (getUserMedia, chromeMediaSource "tab"); valid for ten seconds. */
	mediaSource(owner: BrowserWindow, id: string): string { return this.owned(owner, id).webContents.getMediaSourceId(owner.webContents); }
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
		const image = await contents.capturePage(rect), png = image.toPNG();
		const size = pngPixels(png);
		return { selector: String(picked.selector).slice(0, 500), text: String(picked.text).slice(0, 500), tag: String(picked.tag).slice(0, 40), png: png.toString("base64"), width: size.width, height: size.height, url: contents.getURL(), title: contents.getTitle() };
	}

	// Agent browser tools reach pages only through these, and only pages whose id belongs to the agent's chat.
	/** One chat's live pages in a window. */
	chatPages(owner: BrowserWindow, chatId: string): { id: string; contents: Electron.WebContents; visible: boolean }[] {
		const views = this.owners.get(owner);
		if (!views || owner.isDestroyed()) return [];
		return [...views].filter(([id, view]) => browserTabOfChat(id, chatId) && !view.webContents.isDestroyed())
			.map(([id, view]) => { const popout = this.page(view).popout; return { id, contents: view.webContents, visible: popout && !popout.isDestroyed() ? popout.isVisible() : owner.contentView.children.includes(view) && view.getVisible() }; });
	}
	/** A chat's page, created blank when asked to and missing. Throws for a tab of another chat. */
	chatPage(owner: BrowserWindow, chatId: string, id: string, create: boolean): Electron.WebContents | undefined {
		if (!browserTabOfChat(id, chatId)) throw new Error("That browser tab belongs to another chat.");
		const views = this.viewsFor(owner);
		const view = views.get(id) ?? (create ? this.create(owner, views, id) : undefined);
		return view && !view.webContents.isDestroyed() ? view.webContents : undefined;
	}
	/** The page zoom of a chat's page. */
	chatZoom(owner: BrowserWindow, id: string) { const view = this.owners.get(owner)?.get(id); return view ? this.page(view).zoom : 1; }
	/** Marks a page as driven by an agent while fn runs, and for a while after; input it causes does not count as the person's. */
	async agentAction<T>(owner: BrowserWindow, id: string, fn: () => Promise<T>): Promise<T> {
		const view = this.owners.get(owner)?.get(id);
		if (!view) return fn();
		const page = this.page(view);
		page.acting++; page.agentSeen = true; this.control(view, "agent");
		try { return await fn(); }
		finally { setTimeout(() => { page.acting = Math.max(0, page.acting - 1); }, 100); this.control(view, "agent"); }
	}
	/** Asks the person's window to list a page an agent opened among the chat's tabs. */
	announce(owner: BrowserWindow, chatId: string, id: string, url: string) { if (!owner.isDestroyed()) owner.webContents.send("desktop:browser-agent-tab", { context: chatId, id, url }); }

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
		const cancelPermissions = () => { for (const view of ownedViews.values()) if (!this.page(view).popout) this.permissions.cancel(view.webContents); };
		owner.on("hide", cancelPermissions); owner.on("minimize", cancelPermissions);
		owner.webContents.on("did-start-loading", () => { if (!owner.isDestroyed()) for (const view of ownedViews.values()) { this.permissions.cancel(view.webContents); owner.contentView.removeChildView(view); this.page(view).slot = undefined; } });
		owner.once("closed", () => {
			for (const view of ownedViews.values()) if (!view.webContents.isDestroyed()) {
				const page = this.page(view); clearTimeout(page.controllerTimer); if (page.popout && !page.popout.isDestroyed()) page.popout.destroy();
				this.permissions.cancel(view.webContents); view.webContents.close({ waitForBeforeUnload: false });
			}
			this.owners.delete(owner);
		});
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
		const contents = view.webContents;
		const emit = (error?: string) => { if (!owner.isDestroyed() && !contents.isDestroyed()) owner.webContents.send("desktop:browser-state", { ...this.state(id, view), ...(error ? { error } : {}) }); };
		const page: PageInfo = { viewport: { mode: "fill" }, zoom: 1, colorScheme: "system", configured: false, emulated: false, radius: 0, controller: "none", acting: 0, agentSeen: false, emit };
		this.pages.set(view, page);
		contents.setIgnoreMenuShortcuts(true);
		this.permissions.register(contents);
		contents.on("did-start-loading", () => { page.crashed = undefined; emit(); }); contents.on("did-stop-loading", () => emit()); contents.on("did-navigate-in-page", () => emit());
		contents.on("page-title-updated", () => { if (page.popout && !page.popout.isDestroyed()) page.popout.setTitle(popoutTitle(contents.getTitle())); emit(); });
		contents.on("did-start-navigation", details => { if (details.isMainFrame && !details.isSameDocument && !details.url.startsWith("chrome-error:")) { page.failure = undefined; page.favicon = undefined; if (!page.acting) page.agentSeen = false; } });
		// Chromium keeps zoom per site; each tab keeps its own, so it is set again after every navigation.
		contents.on("did-navigate", () => { if (contents.getZoomFactor() !== page.zoom) contents.setZoomFactor(page.zoom); if ((owner.contentView.children.includes(view) || page.popout) && !page.failure) view.setVisible(true); emit(); });
		contents.on("dom-ready", () => { this.applyViewport(view); if (page.colorScheme !== "system") void this.applyColorScheme(contents, page.colorScheme); });
		contents.on("devtools-opened", () => emit()); contents.on("devtools-closed", () => emit());
		contents.on("audio-state-changed", () => emit());
		contents.on("page-favicon-updated", (_event, favicons) => { void this.favicon(contents, favicons).then(value => { page.favicon = value; emit(); }); });
		contents.on("render-process-gone", (_event, details) => { if (details.reason === "clean-exit") return; page.crashed = true; page.emulated = false; emit(); });
		contents.on("zoom-changed", (_event, direction) => { page.zoom = stepBrowserZoom(page.zoom, direction === "in" ? 1 : -1); contents.setZoomFactor(page.zoom); this.showZoom(view); emit(); });
		// The person's clicks, scrolls and keys make the page theirs for a moment (T3 Code); the agent's own input does not.
		contents.on("before-mouse-event", (_event, mouse) => { if (!page.acting && (mouse.type === "mouseDown" || mouse.type === "mouseWheel")) this.control(view, "human"); });
		contents.on("before-input-event", (event, input) => {
			if (input.type !== "keyDown" || input.isComposing) return;
			if (!page.acting) this.control(view, "human");
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
		contents.setWindowOpenHandler(({ url, disposition }) => { try { const target = browserUrl(url); if (!owner.isDestroyed() && (owner.contentView.children.includes(view) || page.popout)) owner.webContents.send("desktop:browser-open-tab", { sourceId: id, url: target, background: disposition === "background-tab" }); } catch { emit("This address cannot be opened in the browser."); } return { action: "deny" }; });
		return view;
	}
	private page(view: WebContentsView): PageInfo { return this.pages.get(view)!; }
	/** Sets who drives a page; it returns to nobody after a pause (ten seconds for an agent, 750 ms for the person). */
	private control(view: WebContentsView, controller: Exclude<BrowserController, "none">) {
		const page = this.page(view), contents = view.webContents;
		// The person's input matters only where an agent has been: it fades the agent cursor and is never worth an update otherwise.
		if (controller === "human" && !page.agentSeen && page.controller === "none") return;
		clearTimeout(page.controllerTimer);
		const changed = page.controller !== controller;
		page.controller = controller;
		const tell = () => { if (!contents.isDestroyed()) void contents.executeJavaScriptInIsolatedWorld(overlayWorld, [{ code: overlayControllerScript(page.controller) }]).catch(() => undefined); };
		page.controllerTimer = setTimeout(() => { page.controller = "none"; tell(); page.emit(); }, controller === "agent" ? browserAgentIdleMs : browserHumanInputMs);
		if (changed) { tell(); page.emit(); }
	}
	/** T3 Code's zoom pill, drawn inside the page so it shows above the native view. */
	private showZoom(view: WebContentsView) {
		const contents = view.webContents;
		if (contents.isDestroyed() || !contents.getURL() || contents.isLoading()) return;
		void contents.executeJavaScriptInIsolatedWorld(overlayWorld, [{ code: overlayZoomScript(this.page(view).zoom) }]).catch(() => undefined);
	}
	/** Moves the page into its own small window that stays on top, as T3 Code's separate preview window; closing it brings the page back. */
	private popOut(owner: BrowserWindow, view: WebContentsView) {
		const page = this.page(view), contents = view.webContents;
		if (page.popout && !page.popout.isDestroyed()) { page.popout.show(); page.popout.focus(); return; }
		if (!contents.getURL()) throw new Error("Open a page first.");
		const window = new BrowserWindow({
			width: 480, height: 320, minWidth: 240, minHeight: 160, title: popoutTitle(contents.getTitle()), show: false, alwaysOnTop: true, autoHideMenuBar: true,
			fullscreenable: false, maximizable: false, minimizable: false, skipTaskbar: true, backgroundColor: "#111111", ...(mac ? { type: "panel" as const } : {}),
			webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
		});
		window.setMenu(null);
		page.popout = window;
		this.permissions.cancel(contents); owner.contentView.removeChildView(view);
		const fit = () => { if (window.isDestroyed()) return; const [width, height] = window.getContentSize(); this.frames.set(view, { x: 0, y: 0, width, height }); this.applyViewport(view); };
		window.contentView.addChildView(view); view.setBorderRadius(0); view.setVisible(!page.failure); fit();
		window.on("resize", fit);
		window.setAlwaysOnTop(true, mac ? "floating" : "normal");
		// The page goes back before the window is torn down, so its web contents survive.
		window.on("close", () => { window.contentView.removeChildView(view); this.permissions.cancel(contents); });
		window.once("closed", () => { if (page.popout === window) page.popout = undefined; this.frames.delete(view); page.emit(); });
		window.show();
		page.emit();
	}
	private applyViewport(view: WebContentsView) {
		const page = this.page(view), viewport = page.viewport, contents = view.webContents;
		const frame = this.frames.get(view) ?? view.getBounds();
		if (viewport.mode === "fill") { view.setBounds(frame); if (page.emulated && contents.getURL()) { contents.disableDeviceEmulation(); page.emulated = false; void this.applyDeviceMetrics(contents, undefined, 1, page.colorScheme !== "system"); } return; }
		const bounds = browserDeviceFrame(frame, viewport);
		view.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
		if (!contents.getURL()) return;
		const size = { width: viewport.width, height: viewport.height };
		page.emulated = true;
		void this.applyDeviceMetrics(contents, size, Math.max(.1, Math.min(1, bounds.width / size.width, bounds.height / size.height)));
	}
	/**
	 * The device size through the DevTools protocol. Electron 45's enableDeviceEmulation ignores the page's viewport tag
	 * and lays pages out 980px wide, so it is only the fallback for a page whose debugger is taken.
	 */
	private async applyDeviceMetrics(contents: Electron.WebContents, size: { width: number; height: number } | undefined, scale: number, keepAttached = false) {
		const debug = contents.debugger;
		try {
			if (!size) { if (debug.isAttached()) { await debug.sendCommand("Emulation.clearDeviceMetricsOverride"); if (!keepAttached) debug.detach(); } return; }
			if (!debug.isAttached()) debug.attach("1.3");
			await debug.sendCommand("Emulation.setDeviceMetricsOverride", { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: true, screenWidth: size.width, screenHeight: size.height, scale });
		} catch {
			if (size && !contents.isDestroyed()) contents.enableDeviceEmulation({ screenPosition: "mobile", screenSize: size, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 1, viewSize: size, scale });
		}
	}
	/** prefers-color-scheme for one page, through the DevTools protocol; System detaches and lets the page follow the computer. */
	private async applyColorScheme(contents: Electron.WebContents, scheme: BrowserColorScheme, keepAttached = false) {
		const debug = contents.debugger;
		try {
			// An emulated device size also lives on this debugger, so it stays attached while one is set.
			if (scheme === "system") { if (debug.isAttached()) { await debug.sendCommand("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "" }] }); if (!keepAttached) debug.detach(); } return; }
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
		const contents = view.webContents, page = this.page(view), popped = Boolean(page.popout && !page.popout.isDestroyed());
		return { id, url: contents.getURL(), title: contents.getTitle(), loading: contents.isLoading(), canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward(), devToolsOpen: contents.isDevToolsOpened(), viewport: page.viewport, zoom: page.zoom, colorScheme: page.colorScheme, audible: contents.isCurrentlyAudible(), muted: contents.isAudioMuted(), configured: page.configured, ...(page.favicon ? { favicon: page.favicon } : {}), ...(page.failure ? { failure: page.failure } : {}), ...(page.crashed ? { crashed: true } : {}), ...(page.controller !== "none" ? { controller: page.controller } : {}), ...(popped ? { poppedOut: true } : {}) };
	}
}
