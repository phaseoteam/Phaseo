import type { BrowserCommand, BrowserState } from "./browser";
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
	browser: (command: BrowserCommand) => Promise<BrowserState | undefined>;
	onBrowserState: (listener: (state: BrowserState) => void) => () => void;
	getRuntimeInfo: () => Promise<DesktopRuntimeInfo>;
	getWindowState: () => Promise<DesktopWindowState>;
	performWindowAction: (action: DesktopWindowAction) => Promise<void>;
	performAppAction: (action: DesktopAppAction) => Promise<void>;
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
