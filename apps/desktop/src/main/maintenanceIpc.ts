import { randomUUID } from "node:crypto";
import { copyFile, stat } from "node:fs/promises";
import path from "node:path";
import { shell, type BrowserWindow, type IpcMain, type IpcMainInvokeEvent } from "electron";
import type { RetentionKind, RetentionPreview, RetentionReport } from "../shared/maintenance";
import type { ThreadPreferences } from "../shared/threadPreferences";
import { countRetention, removeRetention, scanRetention, type RetentionFile, type RetentionRules } from "./storageRetention";

const automaticEveryMs = 6 * 3_600_000;

/**
 * Settings → Maintenance: storage retention (browser recordings and rotated logs, removed after the days the person set,
 * on a schedule and with Clean up now) and the third-party notices for About. No path comes from the renderer.
 */
export function registerMaintenanceIpc(ipcMain: IpcMain, options: { senderWindow: (event: IpcMainInvokeEvent) => BrowserWindow | null; userData: string; appPath: string; temp: string; preferences: () => ThreadPreferences; closing: () => boolean }) {
	const directories: Record<RetentionKind, string> = { recordings: path.join(options.userData, "browser-recordings"), logs: path.join(options.userData, "logs") };
	const rules = (): RetentionRules => { const value = options.preferences(); return { recordings: value.recordingsAfterDays, logs: value.logsAfterDays }; };
	const trusted = (event: IpcMainInvokeEvent) => { if (!options.senderWindow(event)) throw new Error("Untrusted maintenance request."); };
	let preview: { id: string; files: RetentionFile[] } | undefined, last: RetentionReport | undefined, running: Promise<RetentionReport> | undefined;
	const run = (files: RetentionFile[]) => {
		if (running) throw new Error("A cleanup is already running.");
		running = removeRetention(files, directories, rules()).then(report => (last = report)).finally(() => { running = undefined; });
		return running;
	};
	ipcMain.handle("maintenance:retention-preview", async event => {
		trusted(event);
		const current = rules(), files = await scanRetention(directories, current);
		preview = { id: randomUUID(), files };
		const counts = countRetention(files);
		return { id: preview.id, kinds: { recordings: { ...counts.recordings, afterDays: current.recordings }, logs: { ...counts.logs, afterDays: current.logs } } } satisfies RetentionPreview;
	});
	// Only what the confirmed preview listed, and only what is still past its days under the current setting.
	ipcMain.handle("maintenance:retention-clean", async (event, id: unknown) => {
		trusted(event);
		if (typeof id !== "string" || !preview || preview.id !== id) throw new Error("The list of files changed. Check again before cleaning up.");
		const { files } = preview; preview = undefined;
		return run(files);
	});
	ipcMain.handle("maintenance:retention-last", event => { trusted(event); return last; });
	// The notices are inside the app archive, so a copy goes to the temporary folder for the system to open.
	ipcMain.handle("maintenance:open-notices", async event => {
		trusted(event);
		const source = path.join(options.appPath, "dist", "THIRD-PARTY-NOTICES.txt");
		if (!await stat(source).then(info => info.isFile(), () => false)) throw new Error("The licence notices are written when Phaseo is built, so this development copy has none.");
		const target = path.join(options.temp, "Phaseo third-party notices.txt");
		await copyFile(source, target);
		const problem = await shell.openPath(target);
		if (problem) throw new Error(problem);
	});
	// Automatic cleanup runs only for kinds the person gave a number of days; "Forever" (the default) never removes anything.
	const automatic = () => {
		const current = rules();
		if (options.closing() || running || (current.recordings === null && current.logs === null)) return;
		void scanRetention(directories, current).then(files => files.length ? run(files) : undefined).catch(() => undefined);
	};
	setTimeout(automatic, 180_000).unref?.();
	const timer = setInterval(automatic, automaticEveryMs); timer.unref?.();
	return () => clearInterval(timer);
}
