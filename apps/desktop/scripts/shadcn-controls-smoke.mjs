import { app, BrowserWindow } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
const profile = mkdtempSync(path.join(tmpdir(), "phaseo-controls-"));
app.setPath("userData", profile); mkdirSync(path.join(profile, "workspace"));
const db = new DatabaseSync(path.join(profile, "workspace/workspace.sqlite"));
db.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
const now = new Date().toISOString();
for (let index = 0; index < 60; index++) {
  const id = String(index).padStart(3, "0");
  db.prepare("INSERT INTO tasks VALUES (?, ?)").run(id, JSON.stringify({ id, title: "Owned chat " + id, harness: "phaseo", model: "default", mode: "chat", status: "completed", pinned: false, archived: false, queue: [], createdAt: now, updatedAt: now, messages: [] }));
}
db.close();
const entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice(12);
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
const deadline = setTimeout(() => { console.error("Controls audit timed out"); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  try {
    const owner = BrowserWindow.getAllWindows()[0]; owner.webContents.setBackgroundThrottling(false);
    const run = code => owner.webContents.executeJavaScript(code);
    const wait = async code => { for (let index = 0; index < 100; index++) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve, 40)); } throw Error("Controls did not settle: " + code); };
    await wait("document.querySelectorAll('.task-row').length===50");
    owner.setSize(1440, 920);
    await run("Array.from(document.querySelectorAll('.topbar button')).find(button=>button.textContent==='Tools').click()");
    await wait("Boolean(document.querySelector('[aria-label=\"Resize tools panel\"]'))");
    await run("Array.from(document.querySelectorAll('[aria-label=\"Chat tool tabs\"] button')).find(button=>button.textContent==='Files & Git').click()");
    const initialWidth = await run("document.querySelector('.chat-tools').getBoundingClientRect().width");
    await run("document.querySelector('[aria-label=\"Resize tools panel\"]').focus()"); owner.focus(); owner.webContents.focus();
    owner.webContents.sendInputEvent({ type: "keyDown", keyCode: "Left" }); owner.webContents.sendInputEvent({ type: "keyUp", keyCode: "Left" });
    await wait(`document.querySelector('.chat-tools').getBoundingClientRect().width===${initialWidth + 20}`);
    const handle = await run("(()=>{const r=document.querySelector('[aria-label=\"Resize tools panel\"]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+100)};})()");
    owner.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...handle });
    owner.webContents.sendInputEvent({ type: "mouseMove", x: handle.x - 80, y: handle.y });
    owner.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: handle.x - 80, y: handle.y });
    await wait(`document.querySelector('.chat-tools').getBoundingClientRect().width===${initialWidth + 100}`);
    if (!await run(`JSON.parse(localStorage.getItem('phaseo.desktop.tools.width'))===${initialWidth + 100}`)) throw Error("Tools width was not persisted");
    await run("document.querySelector('[aria-label=\"Close tools\"]').click()");
    if (!await run("(()=>{const host=document.querySelector('.task-history-list');host.scrollTop=host.scrollHeight;return host.scrollTop>0&&Boolean(document.querySelector('[data-slot=scroll-area-thumb]'));})()")) throw Error("Shadcn history scrollbar missing");
    await run("document.querySelector('.task-row').click()");
    await wait("Boolean(document.querySelector('[aria-label=\"Task settings\"]'))");
    await run("document.querySelector('[aria-label=\"Task settings\"]').click()");
    await wait("Boolean(document.querySelector('.task-settings [data-slot=select-trigger]'))");
    const output = path.resolve("../../output/playwright/shadcn-controls"); mkdirSync(output, { recursive: true });
    for (const [width, height] of [[1440, 920], [1180, 800], [1040, 680]]) {
      owner.setSize(width, height);
      for (const theme of ["light", "dark"]) {
        await run(`document.querySelector('[aria-label="Use ${theme} theme"]')?.click()`);
        await run("document.querySelector('[aria-label=\"Task mode\"]').click()");
        await wait("document.querySelectorAll('[aria-label^=Task][data-slot=select-content] [data-slot=select-item]').length===3&&document.querySelector('.task-settings [data-slot=select-trigger]').getAttribute('aria-expanded')==='true'");
        if (!await run("(()=>{const r=document.querySelector('[aria-label^=Task][data-slot=select-content]').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})()")) throw Error("Dropdown extends beyond window");
        await new Promise(resolve => setTimeout(resolve, 100));
        writeFileSync(path.join(output, `${entry ? "archive" : "source"}-${width}-${theme}.png`), (await owner.webContents.capturePage()).toPNG());
        owner.focus(); owner.webContents.focus();
        owner.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" }); owner.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
        await wait("document.querySelector('.task-settings [data-slot=select-trigger]').getAttribute('aria-expanded')==='false'&&(!document.querySelector('[aria-label^=Task][data-slot=select-content]')||Boolean(document.querySelector('[aria-label^=Task][data-slot=select-content]').closest('[hidden]')))&&document.activeElement?.getAttribute('aria-label')==='Task mode'");
      }
    }
    await run("document.querySelector('[aria-label=\"Task mode\"]').click()");
    await wait("document.querySelectorAll('[aria-label^=Task][data-slot=select-content] [data-slot=select-item]').length===3&&document.querySelector('.task-settings [data-slot=select-trigger]').getAttribute('aria-expanded')==='true'");
    await run("Array.from(document.querySelectorAll('[aria-label^=Task][data-slot=select-content] [data-slot=select-item]')).find(item=>item.textContent==='Plan').click()");
    await wait("document.querySelector('[aria-label=\"Task mode\"]').textContent.includes('Plan')");
    console.log("SHADCN_CONTROLS_SMOKE", JSON.stringify({ toolsKeyboardResize: true, toolsPointerResize: true, toolsWidthPersistence: true, scrollbar: true, select: true, focusRestoration: true, selection: true, captures: 6, packaged: Boolean(entry), inferenceCalls: 0 }));
    clearTimeout(deadline); app.quit();
  } catch (error) { const owner=BrowserWindow.getAllWindows()[0]; if(owner) console.error("CONTROL_STATE",await owner.webContents.executeJavaScript("JSON.stringify({popup:Boolean(document.querySelector('[aria-label^=Task][data-slot=select-content]')),focus:document.activeElement?.outerHTML.slice(0,400)})")); console.error(error); app.exit(1); }
});
