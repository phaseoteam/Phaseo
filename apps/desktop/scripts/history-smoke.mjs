import { app, BrowserWindow, ipcMain } from "electron";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const data = mkdtempSync(path.join(tmpdir(), "phaseo-history-smoke-"));
app.setPath("userData", data);
mkdirSync(path.join(data, "workspace"));
const db = new DatabaseSync(path.join(data, "workspace/workspace.sqlite"));
db.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
const timestamp = "2026-10-04T00:00:00.000Z";
for (let index = 0; index < 157; index++) {
  const id = String(index).padStart(3, "0");
  db.prepare("INSERT INTO tasks VALUES (?, ?)").run(id, JSON.stringify({ id, title: `History ${id}`, harness: "phaseo", model: "default", mode: "chat", status: "completed", pinned: index === 0, archived: index >= 155, queue: [], createdAt: timestamp, updatedAt: timestamp, messages: [{ id: `message-${id}`, role: "user", text: index === 42 ? "Résumé needle in the conversation body" : `Sample message ${id}`, createdAt: timestamp }] }));
}
db.close();
const entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice("--app-entry=".length);
const originalHandle = ipcMain.handle;
let failNextHistory = false;
ipcMain.handle = function (channel, listener) {
  return originalHandle.call(this, channel, channel === "workspace:task-history" ? (event, ...args) => {
    if (failNextHistory) { failNextHistory = false; throw new Error("Owned history failure"); }
    return listener(event, ...args);
  } : listener);
};
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
ipcMain.handle = originalHandle;
app.whenReady().then(async () => {
const window = BrowserWindow.getAllWindows()[0];
if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
const run = expression => window.webContents.executeJavaScript(expression);
async function wait(expression, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await run(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`History workflow did not settle: ${label}`);
}
async function search(query) {
  await run(`(()=>{const input=document.querySelector('input[aria-label="Search tasks"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(query)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
try {
  await run(`Array.from(document.querySelectorAll('.sidebar-item')).find(button=>button.textContent.trim()==='Tasks').click()`);
  await wait(`document.querySelectorAll('.task-row').length===50`, "first page");
  if (!await run(`document.querySelector('.task-row').textContent.includes('History 000')`)) throw new Error("Pinned history is not first.");
  failNextHistory = true;
  await run(`Array.from(document.querySelectorAll('.task-list button')).find(button=>button.textContent==='Load more tasks').click()`);
  await wait(`Boolean(document.querySelector('.task-list [role="alert"]'))`, "failed page");
  if (!await run(`document.querySelectorAll('.task-row').length===50`)) throw new Error("A failed page discarded visible history.");
  await run(`Array.from(document.querySelectorAll('.task-list button')).find(button=>button.textContent==='Retry').click()`);
  await wait(`document.querySelectorAll('.task-row').length===100`, "retry page");
  for (const count of [150, 155]) {
    await run(`Array.from(document.querySelectorAll('.task-list button')).find(button=>button.textContent==='Load more tasks').click()`);
    await wait(`document.querySelectorAll('.task-row').length===${count}`, `page ${count}`);
  }
  if (await run(`Array.from(document.querySelectorAll('.task-list button')).some(button=>button.textContent==='Load more tasks')`)) throw new Error("History still offers an exhausted page.");
  await run(`Array.from(document.querySelectorAll('.task-row')).find(button=>button.textContent.includes('History 001')).click()`);
  await wait(`document.querySelector('.task-title')?.value==='History 001'`, "later-page selection");
  await search("RÉSUMÉ");
  await wait(`document.querySelectorAll('.task-row').length===1&&document.querySelector('.task-row').textContent.includes('History 042')`, "body search");
  await search("absent"); await search("History 154");
  await wait(`document.querySelectorAll('.task-row').length===1&&document.querySelector('.task-row').textContent.includes('History 154')`, "rapid search");
  await search("");
  await wait(`document.querySelectorAll('.task-row').length===50`, "search resets pagination");
  await run(`document.querySelector('.task-archive-filter').click()`);
  await wait(`document.querySelectorAll('.task-row').length===2`, "archived history");
  await search("absent");
  await wait(`Array.from(document.querySelectorAll('.task-list p')).some(p=>p.textContent==='No matching tasks.')`, "empty search");
  await search(""); await run(`document.querySelector('.task-archive-filter').click()`);
  await wait(`document.querySelectorAll('.task-row').length===50`, "active history");
  console.log("HISTORY_SMOKE", JSON.stringify({ pages: true, retry: true, pinned: true, selection: true, bodySearch: true, rapidSearch: true, archived: true, empty: true }), "ISOLATED_DATA", data);
  app.exit(0);
} catch (error) { console.error(error); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
