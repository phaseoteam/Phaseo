import { randomUUID } from "node:crypto";
import { shell, type BrowserWindow, type DownloadItem } from "electron";
import type { BrowserDownload, BrowserDownloadCommand } from "../shared/browserDownloads";

type Entry = { state: BrowserDownload; item?: DownloadItem };
export class BrowserDownloads {
 private owners = new Map<BrowserWindow, Map<string, Entry>>();
 accept(owner: BrowserWindow, sourceId: string, item: DownloadItem) {
  let entries = this.owners.get(owner);
  if (!entries) {
   entries = new Map(); this.owners.set(owner, entries);
   const owned = entries;
   owner.once("closed", () => { for (const entry of owned.values()) entry.item?.cancel(); this.owners.delete(owner); });
  }
  const limited = Array.from(entries.values()).filter(entry => !entry.state.finished).length >= 20;
  // Keep active transfers; bound completed metadata for this app session.
  while (entries.size >= 100) { const oldest = Array.from(entries.values()).find(entry => entry.state.finished); if (!oldest) break; entries.delete(oldest.state.id); }
  const state: BrowserDownload = { id: randomUUID(), sourceId, filename: item.getFilename(), url: item.getURL(), path: "", received: 0, total: item.getTotalBytes(), status: "progressing", resumable: false, finished: false, ...(limited ? { error: "Twenty downloads are already running. Wait for one to finish or cancel it, then try again." } : {}) };
  const entry: Entry = { state, item }; entries.set(state.id, entry);
  const update = (status: BrowserDownload["status"], finished: boolean) => {
   Object.assign(state, { status: !finished && item.isPaused() ? "paused" : status, finished, path: item.getSavePath(), received: item.getReceivedBytes(), total: item.getTotalBytes(), resumable: !finished && item.canResume() });
   if (finished) entry.item = undefined;
   this.emit(owner);
  };
  item.on("updated", (_event, status) => update(status, false));
  item.once("done", (_event, status) => update(status, true));
  if (limited) item.cancel();
  this.emit(owner);
 }
 command(owner: BrowserWindow, value: unknown): BrowserDownload[] {
  if (!value || typeof value !== "object") throw new Error("Invalid download request.");
  const command = value as BrowserDownloadCommand;
  if (command.type === "list") return this.list(owner);
  if (!["pause", "resume", "cancel", "reveal", "dismiss"].includes(command.type) || typeof command.id !== "string") throw new Error("Invalid download action.");
  const entries = this.owners.get(owner); const entry = entries?.get(command.id);
  if (!entry) throw new Error("Download is no longer available.");
  if (command.type === "dismiss") { if (!entry.state.finished) throw new Error("Cancel the download before removing it."); entries!.delete(command.id); }
  else if (command.type === "reveal") { if (entry.state.status !== "completed" || !entry.state.path) throw new Error("Download has not completed."); shell.showItemInFolder(entry.state.path); }
  else {
   const item = entry.item; if (!item) throw new Error("Download has already finished.");
   if (command.type === "pause") { item.pause(); entry.state.status = "paused"; entry.state.resumable = item.canResume(); }
   else if (command.type === "resume") { if (!item.isPaused() && !item.canResume()) throw new Error("This download cannot resume."); item.resume(); entry.state.status = "progressing"; }
   else item.cancel();
  }
  this.emit(owner); return this.list(owner);
 }
 private list(owner: BrowserWindow): BrowserDownload[] { return Array.from(this.owners.get(owner)?.values() ?? [], entry => ({ ...entry.state })).reverse(); }
 private emit(owner: BrowserWindow) { if (!owner.isDestroyed()) owner.webContents.send("desktop:browser-downloads", this.list(owner)); }
}
