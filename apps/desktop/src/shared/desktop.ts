import type { BrowserDownload, BrowserDownloadCommand } from "./browserDownloads";
import type { KeybindingEntry } from "./keybindings";
import type { BrowserCapture, BrowserCommand, BrowserKey, BrowserLocalServer, BrowserOpenTab, BrowserPick, BrowserState } from "./browser";
import type { WorkspaceApi } from "./workspace";

export type DesktopRuntimeInfo = {
	platform: NodeJS.Platform;
	version: string;
	isPackaged: boolean;
};

export type DesktopWindowState = {
	isFocused: boolean;
	isFullScreen: boolean;
	isMaximized: boolean;
};

export type DesktopWindowAction = "close" | "minimize" | "toggle-maximize";
export type DesktopAppAction =
	| "copy"
	| "cut"
	| "paste"
	| "quit"
	| "reload"
	| "select-all"
	| "toggle-full-screen"
	| "zoom-in"
	| "zoom-out"
	| "zoom-reset";

export type DesktopUpdateState = {
	status: "checking" | "available" | "downloading" | "ready" | "unavailable" | "unsupported" | "error";
	version?: string;
	message?: string;
};

export type PhaseoDesktopApi = {
	readonly platform: NodeJS.Platform;
	workspace: WorkspaceApi;
	browserDownload: (command: BrowserDownloadCommand) => Promise<BrowserDownload[]>;
	onBrowserDownloads: (listener: (downloads: BrowserDownload[]) => void) => () => void;
	browser: (command: BrowserCommand) => Promise<BrowserState | undefined>;
	onBrowserOpenTab: (listener: (request: BrowserOpenTab) => void) => () => void;
	onBrowserState: (listener: (state: BrowserState) => void) => () => void;
	/** Screenshot of a tab's page, also copied to the clipboard. */
	browserCapture: (id: string) => Promise<BrowserCapture>;
	/** Lets the person click an element on the page; undefined when cancelled. Pass cancel to stop a pick in progress. */
	browserPick: (id: string, cancel?: boolean) => Promise<BrowserPick | undefined>;
	browserLocalServers: () => Promise<BrowserLocalServer[]>;
	/** An app shortcut pressed while a page had focus. */
	onBrowserKey: (listener: (key: BrowserKey) => void) => () => void;
	getRuntimeInfo: () => Promise<DesktopRuntimeInfo>;
	getWindowState: () => Promise<DesktopWindowState>;
	performWindowAction: (action: DesktopWindowAction) => Promise<void>;
	performAppAction: (action: DesktopAppAction) => Promise<void>;
	/** keybindings.json: the person's own shortcuts. */
	keybindings: {
		get: () => Promise<KeybindingsState>;
		save: (entries: KeybindingEntry[]) => Promise<KeybindingsState>;
		open: () => Promise<void>;
		onChange: (listener: (state: KeybindingsState) => void) => () => void;
	};
	checkForUpdates: () => Promise<DesktopUpdateState>;
	installUpdate: () => Promise<void>;
	onWindowStateChange: (listener: (state: DesktopWindowState) => void) => () => void;
	onUpdateStateChange: (listener: (state: DesktopUpdateState) => void) => () => void;
	openExternal: (url: string) => Promise<boolean>;
};

export const ALLOWED_EXTERNAL_HOSTS = new Set([
	"phaseo.app",
	"docs.phaseo.app",
	"github.com",
]);

export function isAllowedExternalUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" && ALLOWED_EXTERNAL_HOSTS.has(url.hostname);
	} catch {
		return false;
	}
}

export type KeybindingsState = { entries: KeybindingEntry[]; path: string; error?: string };
