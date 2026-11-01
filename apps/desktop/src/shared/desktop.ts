import type { BrowserDownload, BrowserDownloadCommand } from "./browserDownloads";
import type { KeybindingEntry } from "./keybindings";
import type { BrowserAgentTabOpened, BrowserCapture, BrowserCommand, BrowserKey, BrowserLocalServer, BrowserOpenTab, BrowserPick, BrowserRecording, BrowserState } from "./browser";
import type { WorkspaceApi } from "./workspace";
import type { DiagnosticsApi } from "./diagnostics";
import type { FactoryApi } from "./factory/types";

export type DesktopRuntimeInfo = {
	platform: NodeJS.Platform;
	version: string;
	isPackaged: boolean;
	/** The commit the app was built from, when the build knew it. */
	commit?: string;
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
	/** Code ▸ Factory: work items, their stages and runs (see shared/factory/types.ts). */
	factory: FactoryApi;
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
	/** Whether a local address answers HTTP yet (only addresses on this computer). */
	browserProbe: (url: string) => Promise<boolean>;
	/** A stream id for recording a tab's page with getUserMedia (chromeMediaSource "tab"); valid for ten seconds. */
	browserRecordingSource: (id: string) => Promise<string>;
	/** Saves a recording (MP4 or WebM) in the app's recordings folder. */
	browserRecordingSave: (mimeType: string, data: Uint8Array) => Promise<BrowserRecording>;
	/** Shows a saved recording in the file manager. */
	browserRecordingReveal: (path: string) => Promise<void>;
	/** A page an agent opened in one of a chat's browser tabs. */
	onBrowserAgentTab: (listener: (tab: BrowserAgentTabOpened) => void) => () => void;
	/** An app shortcut pressed while a page had focus. */
	onBrowserKey: (listener: (key: BrowserKey) => void) => () => void;
	/** The mouse's back and forward buttons, or a macOS swipe, outside a browser page. */
	onNavigate: (listener: (direction: "back" | "forward") => void) => () => void;
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
	/** Settings → Diagnostics: the app's processes, their recent resource use and its local trace file. */
	diagnostics: DiagnosticsApi;
	checkForUpdates: () => Promise<DesktopUpdateState>;
	installUpdate: () => Promise<void>;
	onWindowStateChange: (listener: (state: DesktopWindowState) => void) => () => void;
	onUpdateStateChange: (listener: (state: DesktopUpdateState) => void) => () => void;
	openExternal: (url: string) => Promise<boolean>;
	/** The unread count on the dock or launcher icon; Windows shows `overlay`, a PNG data URL the renderer draws, on the taskbar button. */
	setBadge: (count: number, overlay?: string) => Promise<void>;
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
