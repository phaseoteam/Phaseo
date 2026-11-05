import { app, BrowserWindow, Menu, nativeImage, Tray } from "electron";

let tray: Tray | undefined;

/** Starts Phaseo at sign-in when asked. Installed builds only: a development run would register Electron itself. */
export function applyOpenAtLogin(open: boolean) {
	if (!app.isPackaged || process.platform === "linux") return;
	if (app.getLoginItemSettings().openAtLogin !== open) app.setLoginItemSettings({ openAtLogin: open });
}

const show = () => { const window = BrowserWindow.getAllWindows().find(value => !value.isDestroyed()); if (!window) return; if (window.isMinimized()) window.restore(); window.show(); window.focus(); };

/** The tray icon while Phaseo keeps running with no window showing: click to open, or quit from its menu. */
export function ensureTray(icon: string) {
	if (tray && !tray.isDestroyed()) return tray;
	tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }));
	tray.setToolTip("Phaseo");
	tray.setContextMenu(Menu.buildFromTemplate([{ label: "Open Phaseo", click: show }, { type: "separator" }, { label: "Quit Phaseo", click: () => app.quit() }]));
	tray.on("click", show);
	return tray;
}

export function removeTray() { tray?.destroy(); tray = undefined; }
