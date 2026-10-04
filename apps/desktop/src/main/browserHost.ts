import { session, WebContentsView, type BrowserWindow } from "electron";
import { browserUrl, browserViewport, browserViewportSizes, type BrowserViewport, type BrowserCommand, type BrowserState } from "../shared/browser";

import { BrowserDownloads } from "./browserDownloads";

export class BrowserHost {
 readonly downloads = new BrowserDownloads();
 private downloadSession?: Electron.Session;
 private configureDownloads(browserSession: Electron.Session) {
  if (this.downloadSession === browserSession) return;
  this.downloadSession = browserSession;
  browserSession.on("will-download", (event, item, contents) => {
   for (const [owner, views] of this.owners) for (const [id, view] of views) if (view.webContents === contents && !owner.isDestroyed()) { this.downloads.accept(owner, id, item); return; }
   event.preventDefault();
  });
 }
	private configured = new WeakSet<WebContentsView>();
	private frames = new WeakMap<WebContentsView, Electron.Rectangle>();
	private viewports = new WeakMap<WebContentsView, BrowserViewport>();
	private owners = new Map<BrowserWindow, Map<string, WebContentsView>>();
	command(owner: BrowserWindow, value: unknown): BrowserState | undefined {
		if (!value || typeof value !== "object") throw new Error("Invalid browser request.");
		const command = value as BrowserCommand;
		if (typeof command.id !== "string" || !command.id || command.id.length > 200) throw new Error("Invalid browser context.");
		let views = this.owners.get(owner);
		if (!views) {
			views = new Map(); this.owners.set(owner, views);
			const ownedViews = views;
			owner.webContents.on("did-start-loading", () => { if (!owner.isDestroyed()) for (const view of ownedViews.values()) owner.contentView.removeChildView(view); });
			owner.once("closed", () => { for (const view of ownedViews.values()) if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false }); this.owners.delete(owner); });
		}
		let view = views.get(command.id);
		if (command.type === "hide" || command.type === "close") {
			if (view) { owner.contentView.removeChildView(view); if (command.type === "close") { view.webContents.close({ waitForBeforeUnload: false }); views.delete(command.id); } }
			return view && !view.webContents.isDestroyed() ? this.state(command.id, view) : undefined;
		}
		if (!["show", "navigate", "back", "forward", "reload", "stop", "devtools", "viewport"].includes(command.type)) throw new Error("Invalid browser action.");
		const viewport = command.type === "viewport" ? browserViewport(command.viewport) : undefined;
		const url = command.type === "navigate" ? browserUrl(command.url) : undefined;
		if (command.type === "show" && (!command.bounds || ![command.bounds.x, command.bounds.y, command.bounds.width, command.bounds.height].every(Number.isFinite) || command.bounds.width < 0 || command.bounds.height < 0)) throw new Error("Invalid browser bounds.");
		if (!view) {
			const browserSession = session.fromPartition("persist:phaseo-browser");
			this.configureDownloads(browserSession);
			browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
			browserSession.setPermissionCheckHandler(() => false);
			view = new WebContentsView({ webPreferences: { session: browserSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
			views.set(command.id, view);
			const createdView = view;
			const contents = createdView.webContents;
			const emit = (error?: string) => { if (!owner.isDestroyed() && !contents.isDestroyed()) owner.webContents.send("desktop:browser-state", { ...this.state(command.id, createdView), ...(error ? { error } : {}) }); };
			contents.on("did-start-loading", () => emit()); contents.on("did-stop-loading", () => emit()); contents.on("did-navigate", () => emit()); contents.on("did-navigate-in-page", () => emit()); contents.on("page-title-updated", () => emit());
			contents.on("dom-ready", () => this.applyViewport(createdView, this.viewports.get(createdView) ?? "desktop"));
			contents.on("devtools-opened", () => emit()); contents.on("devtools-closed", () => emit());
			contents.on("before-input-event", (event, input) => { if (input.type === "keyDown" && !input.isAutoRepeat && (input.key === "F12" || (input.key.toLowerCase() === "i" && ((input.control && input.shift) || (input.meta && input.alt))))) { event.preventDefault(); this.toggleDevTools(contents); } });
			contents.on("did-fail-load", (_event, code, description, _url, mainFrame) => { if (mainFrame && code !== -3) emit(description); });
			contents.on("will-navigate", event => { try { browserUrl(event.url); } catch { event.preventDefault(); emit("This address cannot be opened in the browser."); } });
			contents.on("will-redirect", event => { try { browserUrl(event.url); } catch { event.preventDefault(); } });
			contents.setWindowOpenHandler(({ url, disposition }) => { try { const target = browserUrl(url); if (!owner.isDestroyed() && owner.contentView.children.includes(createdView)) owner.webContents.send("desktop:browser-open-tab", { sourceId: command.id, url: target, background: disposition === "background-tab" }); } catch { emit("This address cannot be opened in the browser."); } return { action: "deny" }; });
		}
		const contents = view.webContents;
		if (command.type === "show") {
			for (const candidate of views.values()) owner.contentView.removeChildView(candidate);
			const zoom = owner.webContents.getZoomFactor(); const [width, height] = owner.getContentSize();
			const x = Math.max(0, Math.min(width, Math.round(command.bounds.x * zoom))); const y = Math.max(0, Math.min(height, Math.round(command.bounds.y * zoom)));
			this.frames.set(view, { x, y, width: Math.max(0, Math.min(width - x, Math.round(command.bounds.width * zoom))), height: Math.max(0, Math.min(height - y, Math.round(command.bounds.height * zoom))) });
			this.applyViewport(view, this.viewports.get(view) ?? "desktop");
			owner.contentView.addChildView(view); view.setVisible(Boolean(contents.getURL()));
		} else if (url) { this.configured.add(view); view.setVisible(true); void contents.loadURL(url).catch(reason => { if (!owner.isDestroyed() && !contents.isDestroyed()) owner.webContents.send("desktop:browser-state", { ...this.state(command.id, view), error: String(reason) }); }); }
		else if (command.type === "back" && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
		else if (command.type === "forward" && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
		else if (command.type === "reload") contents.reload();
		else if (command.type === "stop") contents.stop();
		else if (command.type === "devtools") this.toggleDevTools(contents);
		else if (viewport) { this.applyViewport(view, viewport); this.viewports.set(view, viewport); this.configured.add(view); }
		return this.state(command.id, view);
	}
	private applyViewport(view: WebContentsView, viewport: BrowserViewport) {
		const frame = this.frames.get(view) ?? view.getBounds();
		if (viewport === "desktop") { view.setBounds(frame); if (view.webContents.getURL() && (this.viewports.get(view) ?? "desktop") !== "desktop") view.webContents.disableDeviceEmulation(); return; }
		const size = browserViewportSizes[viewport];
		const scale = Math.min(1, frame.width / size.width, frame.height / size.height);
		const width = Math.max(0, Math.round(size.width * scale)); const height = Math.max(0, Math.round(size.height * scale));
		view.setBounds({ x: frame.x + Math.round((frame.width - width) / 2), y: frame.y + Math.round((frame.height - height) / 2), width, height });
		if (!view.webContents.getURL()) return;
		const bounds = view.getBounds();
		view.webContents.enableDeviceEmulation({ screenPosition: "mobile", screenSize: size, viewPosition: { x: 0, y: 0 }, deviceScaleFactor: 1, viewSize: size, scale: Math.max(.1, Math.min(1, bounds.width / size.width, bounds.height / size.height)) });
	}
	private toggleDevTools(contents: Electron.WebContents) { if (contents.isDevToolsOpened()) contents.closeDevTools(); else contents.openDevTools({ mode: "detach" }); }
	private state(id: string, view: WebContentsView): BrowserState {
		const contents = view.webContents;
		return { id, url: contents.getURL(), title: contents.getTitle(), loading: contents.isLoading(), canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward(), devToolsOpen: contents.isDevToolsOpened(), viewport: this.viewports.get(view) ?? "desktop", configured: this.configured.has(view) };
	}
}
