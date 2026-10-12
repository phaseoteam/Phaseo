import type { DatabaseSync } from "node:sqlite";
import type { BrowserDownload } from "../shared/browserDownloads";
export class BrowserDownloadStore {
 constructor(private readonly db: DatabaseSync) {
  db.exec("CREATE TABLE IF NOT EXISTS browser_downloads (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, finished INTEGER NOT NULL, data TEXT NOT NULL)");
  for (const row of db.prepare("SELECT data FROM browser_downloads WHERE finished=0").all()) { const state = JSON.parse(row.data as string) as BrowserDownload; this.put({ ...state, finished: true, resumable: false, status: "interrupted", error: "The app stopped during this download. Download the file again to continue." }); }
 }
 list(): BrowserDownload[] { return this.db.prepare("SELECT data FROM browser_downloads ORDER BY sequence ASC").all().map(row => JSON.parse(row.data as string) as BrowserDownload); }
 put(state: BrowserDownload) {
  this.db.prepare("INSERT INTO browser_downloads (id, finished, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET finished=excluded.finished, data=excluded.data").run(state.id, Number(state.finished), JSON.stringify(state));
  this.db.prepare("DELETE FROM browser_downloads WHERE sequence IN (SELECT sequence FROM browser_downloads WHERE finished=1 ORDER BY sequence ASC LIMIT MAX((SELECT COUNT(*) FROM browser_downloads)-100, 0))").run();
 }
 remove(id: string) { this.db.prepare("DELETE FROM browser_downloads WHERE id=?").run(id); }
}
