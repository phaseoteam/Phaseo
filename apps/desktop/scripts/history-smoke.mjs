import { app, BrowserWindow, ipcMain } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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
const longHistory = JSON.parse(db.prepare("SELECT data FROM tasks WHERE id='042'").get().data);
longHistory.messages = Array.from({ length: 125 }, (_, index) => ({ id: `long-${index}`, role: "user", text: index === 0 ? "Résumé needle in the conversation body" : `Conversation item ${String(index).padStart(3, "0")}`, createdAt: timestamp }));
longHistory.activities = Array.from({ length: 120 }, (_, index) => ({ id: `activity-${index}`, type: "tool", title: `History activity ${index}`, text: `Tool result ${index}`, status: "completed" }));
db.prepare("UPDATE tasks SET data=? WHERE id='042'").run(JSON.stringify(longHistory));
const largeHistory = JSON.parse(db.prepare("SELECT data FROM tasks WHERE id='043'").get().data);
largeHistory.messages = Array.from({ length: 1000 }, (_, index) => ({ id: `large-${index}`, role: "user", text: `Large history item ${index}`, createdAt: timestamp }));
db.prepare("UPDATE tasks SET data=? WHERE id='043'").run(JSON.stringify(largeHistory));
db.close();
const entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice("--app-entry=".length);
const originalHandle = ipcMain.handle;
let failNextHistory = false;
let failNextDetail = false;
let failNextConversation = false;
let detailBodiesBounded = true;
let delayedConversation = false;
const activeConversation = new Map(); let peakConversation = 0;
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
  } : channel === "workspace:conversation-page" ? async (event, query) => {
    if(failNextConversation){failNextConversation=false;throw new Error("Owned conversation page failure");}
    const key=query.taskId+':'+query.kind, count=(activeConversation.get(key)??0)+1;activeConversation.set(key,count);peakConversation=Math.max(peakConversation,count);
    try{const page=listener(event,query);if(delayedConversation&&query.taskId==='043'&&query.beforeId){delayedConversation=false;await new Promise(resolve=>setTimeout(resolve,300));}return page;}finally{activeConversation.set(key,activeConversation.get(key)-1);}
  } : channel === "workspace:task" ? async (event, id) => {
    const active = (activeDetails.get(id) ?? 0) + 1;
    activeDetails.set(id, active); peakDetails.set(id, Math.max(peakDetails.get(id) ?? 0, active));
    try {
      if (failNextDetail) { failNextDetail = false; throw new Error("Owned detail failure"); }
      const task = listener(event, id);
      if(task.messages.length>50||(task.activities?.length??0)>50)detailBodiesBounded=false;
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
async function publishReply(text, title) {
  const liveHistory = new DatabaseSync(path.join(data, "workspace/workspace.sqlite"));
  try {
    const task = JSON.parse(liveHistory.prepare("SELECT data FROM tasks WHERE id='042'").get().data);
    task.messages.push({ id: `live-${task.messages.length}`, role: "assistant", text, createdAt: timestamp });
    task.activities.push({ id: `live-activity-${task.activities.length}`, type: "tool", title, text: "Owned live activity", status: "completed" });
    liveHistory.prepare("UPDATE tasks SET data=? WHERE id='042'").run(JSON.stringify(task));
  } finally { liveHistory.close(); }
  await run(`window.phaseoDesktop.workspace.command({type:'update-task',id:'042',title:'History 042'})`);
}
const atLatest = `(()=>{const host=document.querySelector('.task-messages');return Boolean(host)&&host.scrollHeight-host.clientHeight-host.scrollTop<2})()`;
try {
  const conversationPages = await run(`(async()=>{const read=window.phaseoDesktop.workspace.conversationPage;const latest=await read({taskId:'042',kind:'messages',limit:50});const older=await read({taskId:'042',kind:'messages',limit:50,beforeId:latest.entries[0].id});const newer=await read({taskId:'042',kind:'messages',limit:50,afterId:older.entries.at(-1).id});const activities=await read({taskId:'042',kind:'activities',limit:50});let invalid=false;try{await read({taskId:'042',kind:'messages',limit:10000})}catch{invalid=true}return {latest:latest.entries.length===50&&latest.earlier===75&&latest.later===0&&latest.entries[0].id==='long-75',older:older.entries.length===50&&older.earlier===25&&older.later===50,newer:JSON.stringify(newer.entries)===JSON.stringify(latest.entries),activities:activities.entries.length===50&&activities.earlier===70&&activities.entries[0].id==='activity-70',isolated:!JSON.stringify(latest).includes('Tool result'),invalid}})()`);
  if(Object.values(conversationPages).some(value=>!value))throw new Error("Bounded conversation IPC pages failed: "+JSON.stringify(conversationPages));
  await run(`Array.from(document.querySelectorAll('.sidebar-item')).find(button=>button.textContent.trim()==='Tasks').click()`);
  await wait(`document.querySelectorAll('.task-row').length===50`, "first page");
  const historyLayout=await run(`(()=>{const list=document.querySelector('.task-history-list');list.scrollTop=list.scrollHeight;const search=document.querySelector('.task-search').getBoundingClientRect(),archive=document.querySelector('.task-archive-filter').getBoundingClientRect();return {scrolled:list.scrollTop>0,searchVisible:search.top>=0&&search.bottom<=innerHeight,archiveVisible:archive.top>=0&&archive.bottom<=innerHeight,clamp:getComputedStyle(list.querySelector('.task-row span')).webkitLineClamp}})()`);
  if(!historyLayout.scrolled||!historyLayout.searchVisible||!historyLayout.archiveVisible||historyLayout.clamp!=="2")throw new Error("Task history must scroll independently and retain its controls.");
  await run(`document.querySelector('.task-history-list').scrollTop=0`);
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
  await run(`document.querySelector('.task-row').click()`);
  await wait(`document.querySelector('.task-title')?.value==='History 042'&&document.querySelectorAll('.task-message').length===50&&document.querySelectorAll('.task-activity').length===50`, "recent conversation history");
  await wait(atLatest, "conversation opens at latest");
  if (!await run(`document.querySelector('.task-message').textContent.includes('Conversation item 075')`)) throw new Error("Conversation did not open at recent history.");
  const captures = path.resolve("../../output/playwright/history-smoke"); mkdirSync(captures, { recursive: true });
  writeFileSync(path.join(captures, entry ? "packaged-conversation.png" : "conversation.png"), (await window.webContents.capturePage()).toPNG());
  const anchorTop = await run(`(()=>{document.querySelector('.task-messages').scrollTop=150;return Array.from(document.querySelectorAll('.task-message')).find(row=>row.textContent.includes('Conversation item 075')).getBoundingClientRect().top})()`);
  await wait(`Boolean(document.querySelector('.conversation-latest'))`, "jump control while reading older history");
  writeFileSync(path.join(captures, entry ? "packaged-reading-history.png" : "reading-history.png"), (await window.webContents.capturePage()).toPNG());
  failNextConversation=true;
  await run(`Array.from(document.querySelectorAll('.task-messages button')).find(button=>button.textContent==='Load older messages').click()`);
  await wait(`document.querySelector('.task-messages [role="alert"]')?.textContent.includes('Owned conversation page failure')`, "older conversation failure");
  if(!await run(`document.querySelectorAll('.task-message').length===50`))throw new Error("Failed paging replaced readable history.");
  await run(`Array.from(document.querySelectorAll('.task-messages button')).find(button=>button.textContent==='Retry messages').click()`);
  await wait(`document.querySelectorAll('.task-message').length===100`, "older conversation page");
  const restoredTop = await run(`Array.from(document.querySelectorAll('.task-message')).find(row=>row.textContent.includes('Conversation item 075')).getBoundingClientRect().top`);
  if (Math.abs(anchorTop - restoredTop) > 1) throw new Error("Loading older messages moved the reading position.");
  await run(`Array.from(document.querySelectorAll('.task-messages button')).find(button=>button.textContent==='Load older messages').click()`);
  await wait(`document.querySelectorAll('.task-message').length===100&&document.querySelector('.task-message').textContent.includes('Résumé needle')`, "oldest conversation page");
  if (!await run(`document.querySelector('.task-message').textContent.includes('Résumé needle')&&!Array.from(document.querySelectorAll('.task-messages button')).some(button=>button.textContent==='Load older messages')`)) throw new Error("Oldest conversation history is inaccessible.");
  for (const count of [100, 100]) {
    await run(`Array.from(document.querySelectorAll('.task-messages button')).find(button=>button.textContent==='Load older activities').click()`);
    await wait(`document.querySelectorAll('.task-activity').length===${count}&&!Array.from(document.querySelectorAll('.task-messages button')).some(button=>button.disabled&&button.textContent==='Load older activities')`, `activity page ${count}`);
  }
  await wait(`document.querySelector('.task-activity')?.dataset.conversationId==='activity:activity-0'&&Boolean(Array.from(document.querySelectorAll('.task-messages button')).find(button=>button.textContent==='Load newer activities'))`, "oldest activity window");
  await run(`Array.from(document.querySelectorAll('.task-messages button')).find(button=>button.textContent==='Load newer activities').click()`);
  await wait(`document.querySelectorAll('.task-activity').length===100&&document.querySelector('.task-activity')?.dataset.conversationId==='activity:activity-20'&&!Array.from(document.querySelectorAll('.task-messages button')).some(button=>button.textContent==='Load newer activities')`, "newer activity window remains bounded");
  await run(`Array.from(document.querySelectorAll('.sidebar-item')).find(button=>button.textContent.trim()==='Home').click()`);
  await run(`Array.from(document.querySelectorAll('.sidebar-item')).find(button=>button.textContent.trim()==='Tasks').click()`);
  await wait(`document.querySelector('.task-title')?.value==='History 042'&&document.querySelectorAll('.task-message').length===50`, "conversation history resets on reopen");
  await wait(atLatest, "reopened conversation follows latest");
  await run(`document.querySelector('.task-messages').scrollTop=100`);
  await wait(`Boolean(document.querySelector('.conversation-latest'))`, "reading history pauses automatic following");
  await publishReply("New reply while reading history", "New activity while reading history");
  await wait(`document.querySelectorAll('.task-message').length===51&&document.querySelector('.task-message').textContent.includes('Conversation item 075')&&document.querySelector('.task-messages').textContent.includes('New reply while reading history')`, "new reply retains the visible history boundary");
  if (!await run(`Math.abs(document.querySelector('.task-messages').scrollTop-100)<1&&Boolean(document.querySelector('.conversation-latest'))`)) throw new Error("A live update pulled the reader away from older history.");
  await run(`document.querySelector('.conversation-latest').click()`);
  await wait(`${atLatest}&&!document.querySelector('.conversation-latest')`, "jump resumes latest following");
  await publishReply("Reply while following latest", "Activity while following latest");
  await wait(`document.querySelectorAll('.task-message').length===52&&document.querySelector('.task-messages').textContent.includes('Activity while following latest')&&${atLatest}`, "new content follows the latest position");
  await run(`(()=>{const activity=Array.from(document.querySelectorAll('.task-activity')).at(-1);activity.open=true;activity.querySelector('pre').textContent='Owned delayed result\\n'.repeat(30)})()`);
  await wait(atLatest, "delayed content resizing follows latest");
  await run(`document.querySelector('.task-messages').scrollTop=100`);
  await wait(`Boolean(document.querySelector('.conversation-latest'))`, "pause after delayed content");
  await run(`Array.from(document.querySelectorAll('.task-activity')).at(-1).querySelector('pre').textContent='Short owned result'`);
  await new Promise(resolve => setTimeout(resolve, 100));
  if (!await run(`Math.abs(document.querySelector('.task-messages').scrollTop-100)<1`)) throw new Error("Delayed resizing moved a reader away from older history.");
  await search("History 043");
  await wait(`document.querySelectorAll('.task-row').length===1&&document.querySelector('.task-row').textContent.includes('History 043')`, "large conversation search");
  await run(`document.querySelector('.task-row').click()`);
  await wait(`document.querySelector('.task-title')?.value==='History 043'&&document.querySelector('.task-message')?.dataset.conversationId==='message:large-950'`, "bounded large conversation initial page");
  const contiguous = `(()=>{const ids=Array.from(document.querySelectorAll('.task-message')).map(row=>Number(row.dataset.conversationId.split('large-')[1]));return ids.length<=100&&ids.every((id,index)=>index===0||id===ids[index-1]+1)})()`;
  for(let index=0;index<19;index++){
    if(index===0)delayedConversation=true;
    await run(`(()=>{const button=Array.from(document.querySelectorAll('.task-messages button')).find(button=>button.textContent==='Load older messages');button.click();button.click()})()`);
    if(index===0){
      const updateDb=new DatabaseSync(path.join(data,"workspace/workspace.sqlite"));
      try{const task=JSON.parse(updateDb.prepare("SELECT data FROM tasks WHERE id='043'").get().data);task.messages[950].text="Updated while paging";updateDb.prepare("UPDATE tasks SET data=? WHERE id='043'").run(JSON.stringify(task));}finally{updateDb.close();}
      await run(`window.phaseoDesktop.workspace.command({type:'update-task',id:'043',title:'History 043'})`);
      await wait(`Array.from(document.querySelectorAll('.task-message')).some(row=>row.dataset.conversationId==='message:large-950'&&row.textContent.includes('Updated while paging'))`, "pending page refresh retains newer task data");
    }
    await wait(`document.querySelector('.task-message')?.dataset.conversationId==='message:large-${900-index*50}'`, "large conversation older page "+index);
    if(!await run(contiguous))throw new Error("Older history lost order or exceeded its DOM bound.");
  }
  if(!await run(`!Array.from(document.querySelectorAll('.task-messages button')).some(button=>button.textContent==='Load older messages')&&Boolean(document.querySelector('.conversation-latest'))`))throw new Error("Oldest large history is unreachable.");
  for(let index=0;index<18;index++){
    await run(`Array.from(document.querySelectorAll('.task-messages button')).find(button=>button.textContent==='Load newer messages').click()`);
    await wait(`document.querySelector('.task-message')?.dataset.conversationId==='message:large-${50+index*50}'`, "large conversation newer page "+index);
    if(!await run(contiguous))throw new Error("Newer history lost order or exceeded its DOM bound.");
  }
  await run(`Array.from(document.querySelectorAll('.task-messages button')).find(button=>button.textContent==='Load older messages').click()`);
  await wait(`document.querySelector('.task-message')?.dataset.conversationId==='message:large-850'`, "large history before jumping");
  await run(`document.querySelector('.conversation-latest').click()`);
  await wait(`document.querySelectorAll('.task-message').length===50&&document.querySelector('.task-message')?.dataset.conversationId==='message:large-950'&&${atLatest}`, "large conversation jumps to latest");
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
  if (fullWorkspaceReads !== 0 || overviewBroadcasts < 4 || !detailBodiesBounded || peakConversation>1) throw new Error("History navigation must use metadata broadcasts, bounded bodies and coalesced page requests.");
  console.log("HISTORY_SMOKE", JSON.stringify({ pages: true, retry: true, pinned: true, selection: true, staleDetails: true, coalescedDetails: true, detailRetry: true, bodySearch: true, rapidSearch: true, archived: true, empty: true, homeAttention: true, inboxAttention: true, metadataOnly: true, recentMessages: true, recentActivities: true, readingAnchor: true, liveHistory: true, followLatest: true, pauseFollowing: true, jumpToLatest: true, delayedLayout: true, boundedDetails: true, boundedMessages: true, boundedActivities: true, pageRetry: true, pageRefresh: true, coalescedPages: true }), "ISOLATED_DATA", data);
  app.exit(0);
} catch (error) { console.error(error); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
