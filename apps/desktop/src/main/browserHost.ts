import { session, WebContentsView, type BrowserWindow } from "electron";
import { browserUrl, type BrowserCommand, type BrowserState } from "../shared/browser";

export class BrowserHost {
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
		if (!["show", "navigate", "back", "forward", "reload", "stop", "devtools"].includes(command.type)) throw new Error("Invalid browser action.");
		const url = command.type === "navigate" ? browserUrl(command.url) : undefined;
		if (command.type === "show" && (!command.bounds || ![command.bounds.x, command.bounds.y, command.bounds.width, command.bounds.height].every(Number.isFinite) || command.bounds.width < 0 || command.bounds.height < 0)) throw new Error("Invalid browser bounds.");
		if (!view) {
			const browserSession = session.fromPartition("persist:phaseo-browser");
			browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
			browserSession.setPermissionCheckHandler(() => false);
			view = new WebContentsView({ webPreferences: { session: browserSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
			views.set(command.id, view);
			const createdView = view;
			const contents = createdView.webContents;
			const emit = (error?: string) => { if (!owner.isDestroyed() && !contents.isDestroyed()) owner.webContents.send("desktop:browser-state", { ...this.state(command.id, createdView), ...(error ? { error } : {}) }); };
			contents.on("did-start-loading", () => emit()); contents.on("did-stop-loading", () => emit()); contents.on("did-navigate", () => emit()); contents.on("did-navigate-in-page", () => emit()); contents.on("page-title-updated", () => emit());
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
			view.setBounds({ x, y, width: Math.max(0, Math.min(width - x, Math.round(command.bounds.width * zoom))), height: Math.max(0, Math.min(height - y, Math.round(command.bounds.height * zoom))) });
			owner.contentView.addChildView(view); view.setVisible(Boolean(contents.getURL()));
		} else if (url) { view.setVisible(true); void contents.loadURL(url).catch(reason => { if (!owner.isDestroyed() && !contents.isDestroyed()) owner.webContents.send("desktop:browser-state", { ...this.state(command.id, view), error: String(reason) }); }); }
		else if (command.type === "back" && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
		else if (command.type === "forward" && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
		else if (command.type === "reload") contents.reload();
		else if (command.type === "stop") contents.stop();
		else if (command.type === "devtools") this.toggleDevTools(contents);
		return this.state(command.id, view);
	}
	private toggleDevTools(contents: Electron.WebContents) { if (contents.isDevToolsOpened()) contents.closeDevTools(); else contents.openDevTools({ mode: "detach" }); }
	private state(id: string, view: WebContentsView): BrowserState {
		const contents = view.webContents;
		return { id, url: contents.getURL(), title: contents.getTitle(), loading: contents.isLoading(), canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward(), devToolsOpen: contents.isDevToolsOpened() };
	}
}
