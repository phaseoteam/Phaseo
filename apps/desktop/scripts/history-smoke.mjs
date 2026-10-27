import { installChatNavigation } from "./chat-navigation.mjs";
import { javascriptLiteral } from "./javascript-literal.mjs";
import { app, BrowserWindow, ipcMain } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { openFixtureStore, storeFixtureTasks } from "./fixtures/workspaceFixture.mjs";

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
const byteHistory=JSON.parse(db.prepare("SELECT data FROM tasks WHERE id='044'").get().data);
byteHistory.messages=Array.from({length:8},(_,index)=>({id:'bytes-'+index,role:'user',text:'😀\t'.repeat(100000),createdAt:timestamp}));
byteHistory.activities=Array.from({length:8},(_,index)=>({id:'byte-activity-'+index,type:'tool',title:'Owned large output '+index,text:'😀\t'.repeat(100000),status:'completed'}));
db.prepare("UPDATE tasks SET data=? WHERE id='044'").run(JSON.stringify(byteHistory));
db.close();
await storeFixtureTasks(path.join(data, "workspace", "workspace.sqlite"));
const entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice("--app-entry=".length);
const originalHandle = ipcMain.handle;
let failNextHistory = false;
let failNextDetail = false;
let failNextConversation = false;
let detailBodiesBounded = true, byteBodiesBounded = true, peakPageBytes = 0;
let delayedConversation = false;
const activeConversation = new Map(); let peakConversation = 0;
let delayedTaskId = "001";
const activeDetails = new Map(); const peakDetails = new Map();
let fullWorkspaceReads = 0;
const historyReads = [];
ipcMain.handle = function (channel, listener) {
  return originalHandle.call(this, channel, channel === "workspace:get" ? (event, ...args) => {
    fullWorkspaceReads++;
    return listener(event, ...args);
  } : channel === "workspace:task-history" ? (event, ...args) => {
    historyReads.push({ query: args[0].query, archived: args[0].archived, offset: args[0].offset });
    if (failNextHistory) { failNextHistory = false; throw new Error("Owned history failure"); }
    return listener(event, ...args);
  } : channel === "workspace:conversation-page" ? async (event, query) => {
    if(failNextConversation){failNextConversation=false;throw new Error("Owned conversation page failure");}
    const key=query.taskId+':'+query.kind, count=(activeConversation.get(key)??0)+1;activeConversation.set(key,count);peakConversation=Math.max(peakConversation,count);
    try{const page=listener(event,query);const bytes=Buffer.byteLength(JSON.stringify(page.entries));peakPageBytes=Math.max(peakPageBytes,bytes);if(bytes>2*1024*1024)byteBodiesBounded=false;if(delayedConversation&&query.taskId==='043'&&query.beforeId){delayedConversation=false;await new Promise(resolve=>setTimeout(resolve,300));}return page;}finally{activeConversation.set(key,activeConversation.get(key)-1);}
  } : channel === "workspace:task" ? async (event, id) => {
    const active = (activeDetails.get(id) ?? 0) + 1;
    activeDetails.set(id, active); peakDetails.set(id, Math.max(peakDetails.get(id) ?? 0, active));
    try {
      if (failNextDetail) { failNextDetail = false; throw new Error("Owned detail failure"); }
      const task = listener(event, id);
      if(task.messages.length>50||(task.activities?.length??0)>2000)detailBodiesBounded=false;if(Buffer.byteLength(JSON.stringify(task.messages))>2*1024*1024||Buffer.byteLength(JSON.stringify(task.activities??[]))>2*1024*1024)byteBodiesBounded=false;
      if (id === delayedTaskId) await new Promise(resolve => setTimeout(resolve, 300));
      return task;
    } finally { activeDetails.set(id, activeDetails.get(id) - 1); }
  } : listener);
};
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
ipcMain.handle = originalHandle;
app.whenReady().then(async () => {
const window = BrowserWindow.getAllWindows()[0];
 window.webContents.setBackgroundThrottling(false);
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
await installChatNavigation(window);
  const run = async expression => { try { return await window.webContents.executeJavaScript(expression); } catch(error) { console.error("FAILED_HISTORY_SCRIPT", expression); throw error; } };
async function wait(expression, label) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await run(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`History workflow did not settle: ${label}`);
}
async function search(query) {
  await run(`(()=>{const input=document.querySelector('input[aria-label="Search chats"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${javascriptLiteral(query)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
// Changes made while the app runs go through a second connection to the app's own store, as another writer would.
async function publishReply(text, title) {
  const liveHistory = await openFixtureStore(path.join(data, "workspace/workspace.sqlite"));
  try {
    const task = liveHistory.getTask("042");
    task.messages.push({ id: `live-${task.messages.length}`, role: "assistant", text, createdAt: timestamp });
    task.activities.push({ id: `live-activity-${task.activities.length}`, type: "tool", title, text: "Owned live activity", status: "completed" });
    liveHistory.saveTask(task, true);
  } finally { liveHistory.close(); }
  await run(`window.phaseoDesktop.workspace.command({type:'update-task',id:'042',title:'History 042'})`);
}
const atLatest = `(()=>{const host=document.querySelector('main [data-conversation-viewport]');return Boolean(host)&&host.scrollHeight-host.clientHeight-host.scrollTop<2})()`;
try {
  const conversationPages = await run(`(async()=>{const read=window.phaseoDesktop.workspace.conversationPage;const latest=await read({taskId:'042',kind:'messages',limit:50});const older=await read({taskId:'042',kind:'messages',limit:50,beforeId:latest.entries[0].id});const newer=await read({taskId:'042',kind:'messages',limit:50,afterId:older.entries.at(-1).id});const activities=await read({taskId:'042',kind:'activities',limit:50});let invalid=false;try{await read({taskId:'042',kind:'messages',limit:10000})}catch{invalid=true}return {latest:latest.entries.length===50&&latest.earlier===75&&latest.later===0&&latest.entries[0].id==='long-75',older:older.entries.length===50&&older.earlier===25&&older.later===50,newer:JSON.stringify(newer.entries)===JSON.stringify(latest.entries),activities:activities.entries.length===50&&activities.earlier===70&&activities.entries[0].id==='activity-70',isolated:!JSON.stringify(older).includes('Tool result')&&(latest.activities?.length??0)<=50,invalid}})()`);
  if(Object.values(conversationPages).some(value=>!value))throw new Error("Bounded conversation IPC pages failed: "+JSON.stringify(conversationPages));
  // The redesigned sidebar lists every active chat from metadata; paged, body-searchable history remains a bridge API.
  failNextHistory = true;
  const historyFailure = await run(`window.phaseoDesktop.workspace.taskHistory({query:'',archived:false,offset:0,limit:50}).then(()=>'',error=>String(error))`);
  if (!historyFailure.includes("Owned history failure")) throw new Error("History failure was not reported.");
  const history = await run(`(async()=>{const api=window.phaseoDesktop.workspace,page=(query,archived,offset)=>api.taskHistory({query,archived,offset,limit:50});const pages=[await page('',false,0)];while(pages.at(-1).hasMore)pages.push(await page('',false,pages.length*50));const ids=pages.flatMap(value=>value.tasks.map(task=>task.id));return {count:ids.length,unique:new Set(ids).size,pages:pages.length,pinnedFirst:pages[0].tasks[0].id==='000',metadataOnly:!pages.some(value=>value.tasks.some(task=>'messages' in task||'queue' in task)),body:(await page(${javascriptLiteral("RÉSUMÉ")},false,0)).tasks.map(task=>task.id),rapid:(await Promise.all([page('absent',false,0),page('History 154',false,0)]))[1].tasks.map(task=>task.id),archived:(await page('',true,0)).tasks.length,empty:(await page('absent',true,0)).tasks.length};})()`);
  if (JSON.stringify(history) !== JSON.stringify({ count: 155, unique: 155, pages: 4, pinnedFirst: true, metadataOnly: true, body: ["042"], rapid: ["154"], archived: 2, empty: 0 })) throw new Error("Task history pages failed: " + JSON.stringify(history));
  const rows = `Array.from(document.querySelectorAll('aside[aria-label="Chats"] nav [role=button]'))`;
  // Scrolls the virtualised list until the row is mounted, then clicks it.
  const clickRow = title => `(async()=>{const list=document.querySelector('aside[aria-label="Chats"] nav').closest('[data-slot=scroll-area-viewport]');for(let top=0;top<=list.scrollHeight;top+=200){list.scrollTop=top;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const row=${rows}.find(row=>row.textContent===${JSON.stringify(title)});if(row){row.click();return true;}}return false})()`;
  await run(`window.__auditNavigate('Tasks')`);
  // Rows outside the view are not mounted, so the list publishes how many chats it holds.
  await wait(`document.querySelector('aside[aria-label="Chats"] [data-chat-count]')?.dataset.chatCount==='155'&&${rows}.length>0`, "sidebar lists every active chat");
  if (!await run(`${rows}[0].textContent==='History 000'&&Array.from(document.querySelectorAll('aside[aria-label="Chats"] nav div')).some(value=>value.textContent==='Pinned')`)) throw new Error("Pinned history is not first.");
  if (!await run(`(()=>{const list=document.querySelector('aside[aria-label="Chats"] nav').closest('[data-slot=scroll-area-viewport]');list.scrollTop=list.scrollHeight;const scrolled=list.scrollTop>0;const footer=document.querySelector('aside[aria-label="Chats"] button[aria-label="Settings"]').getBoundingClientRect();list.scrollTop=0;return scrolled&&footer.bottom<=innerHeight})()`)) throw new Error("Chat list must scroll independently and keep its footer.");
  // Selecting another chat before a slow detail read finishes keeps the newer selection.
  if (!await run(clickRow('History 001'))) throw new Error('History 001 row missing');
  for (let attempt = 0; attempt < 50 && !activeDetails.get("001"); attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  if (!activeDetails.get("001")) throw new Error("Delayed task detail read did not start.");
  if (!await run(clickRow('History 002'))) throw new Error('History 002 row missing');
  await wait(`window.__auditChatTitle()==='History 002'`, "later selection");
  await new Promise(resolve => setTimeout(resolve, 350));
  if (!await run(`window.__auditChatTitle()==='History 002' && document.querySelector('main [data-conversation-viewport]').textContent.includes('Sample message 002')`)) throw new Error("An obsolete detail response replaced the selected conversation.");
  delayedTaskId = "002";
  for (const title of ["Revision A", "Revision B", "Final revision"]) {
    await run(`window.phaseoDesktop.workspace.command({type:'update-task',id:'002',title:${JSON.stringify(title)}})`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await wait(`window.__auditChatTitle()==='Final revision'`, "coalesced detail refresh");
  if (peakDetails.get("002") !== 1) throw new Error("Detail refreshes overlapped for one task.");
  // A failed detail refresh keeps the loaded chat; the next revision recovers it.
  delayedTaskId = undefined; failNextDetail = true;
  await run(`window.phaseoDesktop.workspace.command({type:'update-task',id:'002',title:'Missed detail'})`);
  await new Promise(resolve => setTimeout(resolve, 200));
  if (!await run(`window.__auditChatTitle()==='Final revision'&&document.querySelector('main [data-conversation-viewport]').textContent.includes('Sample message 002')`)) throw new Error("A failed detail read discarded the loaded chat.");
  await run(`window.phaseoDesktop.workspace.command({type:'update-task',id:'002',title:'Recovered detail'})`);
  await wait(`window.__auditChatTitle()==='Recovered detail'`, "detail recovery");
  // Conversations open at their latest page and keep the reader's place while older pages load.
  const host = "document.querySelector('main [data-conversation-viewport]')";
  const messages = `Array.from(document.querySelectorAll('main [data-conversation-id^="message:"]'))`;
  const control = pattern => `Array.from(document.querySelectorAll('main button')).find(button=>${pattern}.test(button.textContent.trim()))`;
  const earlierMessages = control("/^Load \\d+ earlier messages$/"), newerMessages = control("/^Load newer messages$/"), jump = control("/^Jump to latest$/");
  // Pages load by themselves near either end; these steps drive them one at a time. Automatic paging is checked last.
  await run(`window.__phaseoManualPaging=true`);
  await run(`window.__auditOpenChat('History 042')`);
  await wait(`${messages}.length===50`, "recent conversation history");
  // Activities with no turn or position stay with the latest window, newest 50.
  if (!await run(`window.phaseoDesktop.workspace.task('042').then(task=>task.activities.length===50&&task.activities[0].id==='activity-70'&&task.activities.at(-1).id==='activity-119')`)) throw new Error("Unplaced activities did not open with the latest window.");
  await wait(atLatest, "conversation opens at latest");
  if (!await run(`${messages}[0].textContent.includes('Conversation item 075')&&${earlierMessages}?.textContent==='Load 75 earlier messages'`)) throw new Error("Conversation did not open at recent history.");
  const captures = path.resolve("../../output/playwright/history-smoke"); mkdirSync(captures, { recursive: true });
  writeFileSync(path.join(captures, entry ? "packaged-conversation.png" : "conversation.png"), (await window.webContents.capturePage()).toPNG());
  const anchorTop = await run(`(()=>{${host}.scrollTop=150;${host}.dispatchEvent(new Event('scroll'));return ${messages}.find(row=>row.textContent.includes('Conversation item 075')).getBoundingClientRect().top})()`);
  await wait(`Boolean(${jump})`, "jump control while reading older history");
  writeFileSync(path.join(captures, entry ? "packaged-reading-history.png" : "reading-history.png"), (await window.webContents.capturePage()).toPNG());
  failNextConversation = true;
  await run(`${earlierMessages}.click()`);
  await wait(`document.querySelector('main [role="alert"]')?.textContent.includes('Owned conversation page failure')`, "older conversation failure");
  if (!await run(`${messages}.length===50`)) throw new Error("Failed paging replaced readable history.");
  await run(`Array.from(document.querySelectorAll('main [role="alert"] button')).find(button=>button.textContent==='Retry').click()`);
  await wait(`${messages}.length===100`, "older conversation page");
  const restoredTop = await run(`${messages}.find(row=>row.textContent.includes('Conversation item 075')).getBoundingClientRect().top`);
  if (Math.abs(anchorTop - restoredTop) > 1) throw new Error("Loading older messages moved the reading position: " + anchorTop + " -> " + restoredTop);
  await run(`${earlierMessages}.click()`);
  await wait(`${messages}.length===100&&${messages}[0].textContent.includes('Résumé needle')`, "oldest conversation page");
  if (await run(`Boolean(${earlierMessages})`)) throw new Error("Oldest conversation history offers more pages.");
  // Switching chats and returning starts again at the latest page.
  await run(`window.__auditOpenChat('History 043')`);
  await run(`window.__auditOpenChat('History 042')`);
  await wait(`${messages}.length===50&&${messages}[0].textContent.includes('Conversation item 075')`, "conversation history resets on reopen");
  await wait(atLatest, "reopened conversation follows latest");
  await run(`(()=>{${host}.scrollTop=100;${host}.dispatchEvent(new Event('scroll'))})()`);
  await wait(`Boolean(${jump})`, "reading history pauses automatic following");
  await publishReply("New reply while reading history", "New activity while reading history");
  await wait(`${messages}.length===51&&${messages}[0].textContent.includes('Conversation item 075')&&${host}.textContent.includes('New reply while reading history')`, "new reply retains the visible history boundary");
  if (!await run(`Math.abs(${host}.scrollTop-100)<1&&Boolean(${jump})`)) throw new Error("A live update pulled the reader away from older history.");
  await run(`${jump}.click()`);
  await wait(`${atLatest}&&!${jump}`, "jump resumes latest following");
  await publishReply("Reply while following latest", "Activity while following latest");
  // Both replies share the last turn: the newest is its answer and the earlier one folds into the turn's work log.
  await wait(`${messages}.length===51&&${messages}.at(-1).textContent.includes('Reply while following latest')&&${atLatest}`, "new content follows the latest position");
  await run(`(()=>{const filler=document.createElement('div');filler.id='owned-delayed-content';filler.style.height='600px';${messages}.at(-1).append(filler)})()`);
  await wait(atLatest, "delayed content resizing follows latest");
  await run(`(()=>{${host}.scrollTop=100;${host}.dispatchEvent(new Event('scroll'))})()`);
  await wait(`Boolean(${jump})`, "pause after delayed content");
  await run(`document.getElementById('owned-delayed-content').style.height='20px'`);
  await new Promise(resolve => setTimeout(resolve, 100));
  if (!await run(`Math.abs(${host}.scrollTop-100)<1`)) throw new Error("Delayed resizing moved a reader away from older history.");
  await run(`document.getElementById('owned-delayed-content').remove()`);
  // Large conversations keep a bounded, contiguous window while paging both ways.
  await run(`window.__auditOpenChat('History 043')`);
  await wait(`${messages}[0]?.dataset.conversationId==='message:large-950'`, "bounded large conversation initial page");
  const contiguous = `(()=>{const ids=${messages}.map(row=>Number(row.dataset.conversationId.split('large-')[1]));return ids.length<=100&&ids.every((id,index)=>index===0||id===ids[index-1]+1)})()`;
  for (let index = 0; index < 19; index++) {
    if (index === 0) delayedConversation = true;
    await run(`(()=>{const button=${earlierMessages};button.click();button.click()})()`);
    if (index === 0) {
      const updateDb = await openFixtureStore(path.join(data, "workspace/workspace.sqlite"));
      try { const task = updateDb.getTask("043"); task.messages[950].text = "Updated while paging"; updateDb.saveTask(task, true); } finally { updateDb.close(); }
      await run(`window.phaseoDesktop.workspace.command({type:'update-task',id:'043',title:'History 043'})`);
      await wait(`${messages}.some(row=>row.dataset.conversationId==='message:large-950'&&row.textContent.includes('Updated while paging'))`, "pending page refresh retains newer task data");
    }
    await wait(`${messages}[0]?.dataset.conversationId==='message:large-${900 - index * 50}'`, "large conversation older page " + index);
    if (!await run(contiguous)) throw new Error("Older history lost order or exceeded its DOM bound.");
  }
  await wait(`!${earlierMessages}&&Boolean(${jump})`, "oldest large history reached with a way back to latest");
  for (let index = 0; index < 18; index++) {
    await run(`${newerMessages}.click()`);
    await wait(`${messages}[0]?.dataset.conversationId==='message:large-${50 + index * 50}'`, "large conversation newer page " + index);
    if (!await run(contiguous)) throw new Error("Newer history lost order or exceeded its DOM bound.");
  }
  await run(`${earlierMessages}.click()`);
  await wait(`${messages}[0]?.dataset.conversationId==='message:large-850'`, "large history before jumping");
  await run(`${jump}.click()`);
  await wait(`${messages}.length===50&&${messages}[0]?.dataset.conversationId==='message:large-950'&&${atLatest}`, "large conversation jumps to latest");
  // Very large message bodies are windowed by bytes as well as count.
  await run(`window.__auditOpenChat('History 044')`);
  const byteWindow = `(()=>{const rows=${messages};return rows.length<=3&&rows.every((row,index)=>index===0||Number(row.dataset.conversationId.split('bytes-')[1])===Number(rows[index-1].dataset.conversationId.split('bytes-')[1])+1)})()`;
  await wait(`${messages}[0]?.dataset.conversationId==='message:bytes-5'`, "large body initial byte window");
  for (const start of [2, 0]) { await run(`${earlierMessages}.click()`); await wait(`${messages}[0]?.dataset.conversationId==='message:bytes-${start}'`, "large body older window " + start); if (!await run(byteWindow)) throw Error("Large body renderer retained excess/non-contiguous messages"); }
  for (const start of [3, 5]) { await run(`${newerMessages}.click()`); await wait(`${messages}[0]?.dataset.conversationId==='message:bytes-${start}'`, "large body newer window " + start); if (!await run(byteWindow)) throw Error("Large body newer window exceeded retained byte limit"); }
  if (!byteBodiesBounded || peakPageBytes < 1024 * 1024) throw Error("Large body byte instrumentation failed");
  // Scrolling up loads the next 50 by itself, keeping the reader in place.
  await run(`window.__phaseoManualPaging=false`);
  await run(`window.__auditOpenChat('History 043')`);
  await wait(`${messages}[0]?.dataset.conversationId==='message:large-950'&&${atLatest}`, "automatic paging opens at latest");
  await run(`(()=>{${host}.scrollTop=0;${host}.dispatchEvent(new Event('scroll'))})()`);
  await wait(`${messages}[0]?.dataset.conversationId==='message:large-900'`, "scrolling up loads older messages");
  // Failed chats are marked in the command palette, which opens them.
  await run(`window.__auditPalette()`); await run(`window.__auditType(document.querySelector('[data-slot="dialog-content"] [cmdk-input]'),'History 154')`);
  await wait(`Array.from(document.querySelectorAll('[data-slot="dialog-content"] [cmdk-item]')).some(item=>item.textContent.includes('History 154')&&item.querySelector('[aria-label="Failed"]'))`, "palette attention metadata");
  await run(`window.__auditPaletteClose()`); await run(`window.__auditOpenChat('History 154')`);
  if (fullWorkspaceReads !== 0 || overviewBroadcasts < 4 || !detailBodiesBounded || peakConversation > 1) throw new Error("History navigation must use metadata broadcasts, bounded bodies and coalesced page requests.");
  console.log("HISTORY_SMOKE", JSON.stringify({ pages: true, retry: true, pinned: true, selection: true, staleDetails: true, coalescedDetails: true, detailRecovery: true, bodySearch: true, rapidSearch: true, archived: true, empty: true, chatAttention: true, metadataOnly: true, recentMessages: true, recentActivities: true, readingAnchor: true, liveHistory: true, followLatest: true, pauseFollowing: true, jumpToLatest: true, delayedLayout: true, boundedDetails: true, byteBoundedPages: byteBodiesBounded, peakPageBytes, byteBoundedRenderer: true, boundedMessages: true, pageRetry: true, pageRefresh: true, coalescedPages: true }), "ISOLATED_DATA", data);
  app.exit(0);
} catch (error) { console.error(error); app.exit(1); }
}).catch(error => { console.error(error); app.exit(1); });
