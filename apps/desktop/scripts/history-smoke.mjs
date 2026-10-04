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
  db.prepare("INSERT INTO tasks VALUES (?, ?)").run(id, JSON.stringify({ id, title: `History ${id}`, harness: "phaseo", model: "default", mode: "chat", status: index === 154 ? "failed" : "completed", pinned: index === 0, archived: index >= 155, queue: [], createdAt: timestamp, updatedAt: timestamp, messages: [{ id: `message-${id}`, role: "user", text: index === 42 ? "Résumé needle in the conversation body" : `Sample message ${id}`, createdAt: timestamp }] }));
}
db.close();
const entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice("--app-entry=".length);
const originalHandle = ipcMain.handle;
let failNextHistory = false;
let failNextDetail = false;
let delayedTaskId = "001";
const activeDetails = new Map(); const peakDetails = new Map();
let fullWorkspaceReads = 0;
ipcMain.handle = function (channel, listener) {
  return originalHandle.call(this, channel, channel === "workspace:get" ? (event, ...args) => {
    fullWorkspaceReads++;
    return listener(event, ...args);
  } : channel === "workspace:task-history" ? (event, ...args) => {
    if (failNextHistory) { failNextHistory = false; throw new Error("Owned history failure"); }
    return listener(event, ...args);
  } : channel === "workspace:task" ? async (event, id) => {
    const active = (activeDetails.get(id) ?? 0) + 1;
    activeDetails.set(id, active); peakDetails.set(id, Math.max(peakDetails.get(id) ?? 0, active));
    try {
      if (failNextDetail) { failNextDetail = false; throw new Error("Owned detail failure"); }
      const task = listener(event, id);
      if (id === delayedTaskId) await new Promise(resolve => setTimeout(resolve, 300));
      return task;
    } finally { activeDetails.set(id, activeDetails.get(id) - 1); }
  } : listener);
};
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
ipcMain.handle = originalHandle;
app.whenReady().then(async () => {
const window = BrowserWindow.getAllWindows()[0];
const originalSend = window.webContents.send;
let overviewBroadcasts = 0;
window.webContents.send = function (channel, ...args) {
  if (channel === "workspace:changed") throw new Error("Full conversation history was broadcast.");
  if (channel === "workspace:overview-changed") {
    overviewBroadcasts++;
    if (args[0].tasks.some(task => "messages" in task || "queue" in task || "activities" in task)) throw new Error("Overview broadcast contains task bodies.");
  }
  return originalSend.call(this, channel, ...args);
};
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
  for (let attempt = 0; attempt < 50 && !activeDetails.get("001"); attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  if (!activeDetails.get("001")) throw new Error("Delayed task detail read did not start.");
  await run(`Array.from(document.querySelectorAll('.task-row')).find(button=>button.textContent.includes('History 002')).click()`);
  await wait(`document.querySelector('.task-title')?.value==='History 002'`, "later-page selection");
  await new Promise(resolve => setTimeout(resolve, 350));
  if (!await run(`document.querySelector('.task-title')?.value==='History 002' && document.querySelector('.task-messages').textContent.includes('Sample message 002')`)) throw new Error("An obsolete detail response replaced the selected conversation.");
  delayedTaskId = "002";
  for (const title of ["Revision A", "Revision B", "Final revision"]) {
    await run(`window.phaseoDesktop.workspace.command({type:'update-task',id:'002',title:${JSON.stringify(title)}})`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await wait(`document.querySelector('.task-title')?.value==='Final revision'`, "coalesced detail refresh");
  if (peakDetails.get("002") !== 1) throw new Error("Detail refreshes overlapped for one task.");
  delayedTaskId = undefined; failNextDetail = true;
  await run(`window.phaseoDesktop.workspace.command({type:'update-task',id:'002',title:'Recovered detail'})`);
  await wait(`Boolean(document.querySelector('.task-detail [role="alert"]'))`, "failed detail read");
  await run(`Array.from(document.querySelectorAll('.task-detail button')).find(button=>button.textContent==='Retry').click()`);
  await wait(`document.querySelector('.task-title')?.value==='Recovered detail'`, "detail retry");
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
  for (const page of ["Home", "Inbox"]) {
    await run(`Array.from(document.querySelectorAll('.sidebar-item')).find(button=>button.textContent.trim()===${JSON.stringify(page)}).click()`);
    await wait(`Array.from(document.querySelectorAll('.attention-item')).some(row=>row.textContent.includes('History 154')&&row.textContent.includes('Task failed'))`, `${page} attention metadata`);
    await run(`Array.from(document.querySelectorAll('.attention-item')).find(row=>row.textContent.includes('History 154')).querySelector('button').click()`);
    await wait(`document.querySelector('.task-title')?.value==='History 154'`, `${page} detail navigation`);
  }
  if (fullWorkspaceReads !== 0 || overviewBroadcasts < 4) throw new Error("History navigation must use metadata reads and broadcasts.");
  console.log("HISTORY_SMOKE", JSON.stringify({ pages: true, retry: true, pinned: true, selection: true, staleDetails: true, coalescedDetails: true, detailRetry: true, bodySearch: true, rapidSearch: true, archived: true, empty: true, homeAttention: true, inboxAttention: true, metadataOnly: true }), "ISOLATED_DATA", data);
  app.exit(0);
} catch (error) { console.error(error); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
