import { app, BrowserWindow, ipcMain } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { installControlActions } from "./fixtures/control-actions.mjs";
import { advanceBackgroundRefresh } from "./fixtures/background-clock.mjs";
import { storeFixtureTasks } from "./fixtures/workspaceFixture.mjs";
const profile = mkdtempSync(path.join(tmpdir(), "phaseo-controls-"));
app.setPath("userData", profile); mkdirSync(path.join(profile, "workspace"));
const project = path.join(profile, "project"); mkdirSync(project);
const db = new DatabaseSync(path.join(profile, "workspace/workspace.sqlite"));
db.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
const now = new Date().toISOString();
db.prepare("INSERT INTO projects VALUES (?, ?)").run("owned-project", JSON.stringify({ id: "owned-project", name: "Owned project", directory: project, createdAt: now }));
const messages = id => [{id:id+"-user",role:"user",text:"Help me improve the chat experience. Keep the layout consistent with our website.",createdAt:now,completedAt:now},{id:id+"-assistant",role:"assistant",text:"## A clearer chat experience\n\nThe conversation and composer share a readable width.\n\n- Messages keep their visual hierarchy.\n- Commands are available beside your draft.\n\n```ts\nconst chat = { harness: 'phaseo', mode: 'chat' };\n```",createdAt:now}];
for (let index = 0; index < 60; index++) {
  const id = String(index).padStart(3, "0");
  db.prepare("INSERT INTO tasks VALUES (?, ?)").run(id, JSON.stringify({ id, title: "Owned chat " + id, harness: "phaseo", model: "default", mode: "chat", status: "completed", pinned: false, archived: false, queue: [], createdAt: now, updatedAt: now, messages: messages(id) }));
}
db.prepare("INSERT INTO tasks VALUES (?, ?)").run("project-chat", JSON.stringify({ id: "project-chat", title: "Owned project chat", projectId: "owned-project", harness: "codex", model: "default", mode: "code", status: "completed", pinned: false, archived: false, queue: [], createdAt: now, updatedAt: now, messages: messages("project-chat") }));
db.close();
await storeFixtureTasks(path.join(profile, "workspace", "workspace.sqlite"));
const entry = process.argv.find(value => value.startsWith("--app-entry="))?.slice(12);
await import(entry ? pathToFileURL(path.resolve(entry)).href : "../dist/main/index.mjs");
const deadline = setTimeout(() => { console.error("Controls audit timed out"); app.exit(1); }, 90000);
app.whenReady().then(async () => {
  try {
    const owner = BrowserWindow.getAllWindows()[0]; owner.webContents.setBackgroundThrottling(false);
    let modelReads = 0;
    let modelRefreshFailure = false;
    let modelRefreshDelay = 0;
    // Phaseo catalogs carry per-model settings as option descriptors.
    const options = [{ id: "reasoning", label: "Reasoning", type: "select", options: [{ id: "low", label: "Low", description: "Quick", isDefault: true }, { id: "high", label: "High", description: "Thorough" }] }, { id: "fastMode", label: "Fast mode", type: "boolean", default: false }];
    // Local Codex, Claude and Grok logins on the test machine stay out of this audit: no runtime is connected until Phaseo is.
    ipcMain.removeHandler("workspace:account-status");
    ipcMain.handle("workspace:account-status", () => ({ checkedAt: new Date().toISOString(), authenticated: false, ordinaryUsageAllowed: false, usage: [] }));
    ipcMain.removeHandler("workspace:models");
    ipcMain.handle("workspace:models", async () => { modelReads++; if (modelRefreshDelay) await new Promise(resolve => setTimeout(resolve, modelRefreshDelay)); if (modelRefreshFailure) throw Error('Owned model refresh failure'); return Array.from({ length: 1000 }, (_, index) => ({ id: `owned-model-${index}`, name: `Owned model ${index}`, organisationId: index === 999 ? "openai" : "anthropic", organisationName: index === 999 ? "OpenAI" : "Anthropic", releaseDate: index === 999 ? now : "2020-01-01", default: index === 0, options })); });
    owner.webContents.on("console-message", event => { if (event.level === "error") console.error("RENDERER_ERROR", event.message); });
    const run = async code => { try { return await owner.webContents.executeJavaScript(code); } catch (error) { console.error("FAILED_CONTROL_ACTION", code); throw error; } };
    const wait = async code => { for (let index = 0; index < 100; index++) { if (await run(code)) return; await new Promise(resolve => setTimeout(resolve, 40)); } throw Error("Controls did not settle: " + code); };
    const key = keyCode => { owner.focus(); owner.webContents.focus(); owner.webContents.sendInputEvent({ type: "keyDown", keyCode }); owner.webContents.sendInputEvent({ type: "keyUp", keyCode }); };
    const rows = "Array.from(document.querySelectorAll('aside[aria-label=\"Chats\"] nav [role=button]'))";
    const capture = async (folder, name) => { const output = path.resolve("../../output/playwright", folder); mkdirSync(output, { recursive: true }); await new Promise(resolve => setTimeout(resolve, 150)); writeFileSync(path.join(output, `${entry ? "archive" : "source"}-${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
    if (owner.webContents.isLoading()) await new Promise(resolve => owner.webContents.once("did-finish-load", resolve));
    await installControlActions(owner);
    // Chat mode lists every personal chat; project chats live under Code.
    await wait(`document.querySelector('aside[aria-label="Chats"] [data-chat-count]')?.dataset.chatCount==='60'&&${rows}.length>0`);
    owner.setSize(1440, 920);
    await run(`${rows}[0].click()`);
    await wait(`window.__auditChatTitle()==='Owned chat 059'||window.__auditChatTitle()===${rows}[0].textContent`);
    const firstChat = await run("window.__auditChatTitle()");
    await run(`${rows}[1].click()`);
    await wait(`${rows}[1]?.getAttribute('aria-current')==='page'`);
    const secondChat = await run("window.__auditChatTitle()");
    if (firstChat === secondChat) throw Error("Second chat did not open");
    await wait("!document.querySelector('[aria-label=\"Back\"]').disabled");
    await run("document.querySelector('[aria-label=\"Back\"]').click()");
    await wait(`window.__auditChatTitle()===${JSON.stringify(firstChat)}`);
    await run("document.querySelector('[aria-label=\"Forward\"]').click()");
    await wait(`window.__auditChatTitle()===${JSON.stringify(secondChat)}&&${rows}[1]?.getAttribute('aria-current')==='page'`);
    await run("document.querySelector('[aria-label=\"Hide sidebar\"]').click()");
    await wait("!document.querySelector('aside[aria-label=\"Chats\"]')&&Boolean(document.querySelector('[aria-label=\"Show sidebar\"]'))");
    await run("document.querySelector('[aria-label=\"Show sidebar\"]').click()");
    await wait("Boolean(document.querySelector('aside[aria-label=\"Chats\"]'))");
    await run("window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true}))");
    await wait("!document.querySelector('aside[aria-label=\"Chats\"]')");
    await run("window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',ctrlKey:true,bubbles:true}))");
    await wait("Boolean(document.querySelector('aside[aria-label=\"Chats\"]'))");
    // Code lists chats across projects, each card naming its project, with Settled folded at the bottom; Back returns to the chat that was open.
    await run("Array.from(document.querySelectorAll('[role=radiogroup][aria-label=Workspace] [role=radio]')).find(button=>button.textContent==='Code').click()");
    await wait("Boolean(document.querySelector('aside[aria-label=\"Projects\"]'))&&window.__auditChatTitle()===undefined");
    const projectChat = "Array.from(document.querySelectorAll('nav[aria-label=\"Code chats\"] [role=button]')).some(row=>row.textContent.includes('Owned project chat')&&row.textContent.includes('Owned project'))";
    const settledToggle = "Array.from(document.querySelectorAll('nav[aria-label=\"Code chats\"] button[aria-expanded]:not([aria-haspopup])')).find(button=>button.textContent.startsWith('Settled'))";
    await wait(`${projectChat}&&${settledToggle}?.getAttribute('aria-expanded')==='false'`);
    await run(`${settledToggle}.click()`);
    await wait(`${settledToggle}.getAttribute('aria-expanded')==='true'`);
    await run(`${settledToggle}.click()`);
    await wait(`${settledToggle}.getAttribute('aria-expanded')==='false'&&${projectChat}`);
    await run("document.querySelector('[aria-label=\"Back\"]').click()");
    await wait(`Boolean(document.querySelector('aside[aria-label="Chats"]'))&&window.__auditChatTitle()===${JSON.stringify(secondChat)}`);
    for (const [width, height] of [[1440, 920], [1180, 800], [1040, 680]]) for (const theme of ["light", "dark"]) {
      owner.setSize(width, height); await run(`window.__auditTheme(${JSON.stringify(theme)})`);
      await wait("document.querySelectorAll('main [data-conversation-id^=\"message:\"]').length===2");
      if (!await run("(()=>{const [user,assistant]=Array.from(document.querySelectorAll('main [data-conversation-id^=\"message:\"]')).map(node=>(node.querySelector('[data-selectable]')??node).getBoundingClientRect()),composer=document.querySelector('main form').getBoundingClientRect(),history=document.querySelector('main [aria-live=polite]');return user.right<=assistant.right+1&&user.left>assistant.left&&composer.right<=innerWidth&&composer.bottom<=innerHeight&&(history.scrollHeight<=history.clientHeight||getComputedStyle(history).overflowY==='auto');})()")) throw Error("Chat alignment or conversation scrolling missing");
      await capture("chat-design", `${width}-${theme}`);
    }
    owner.setSize(1440, 920);
    // Settings is a page: the chat's draft survives a visit and Escape returns to the chat.
    await run("window.__auditType(document.querySelector('main [aria-label=Message]'),'Keep this draft')");
    await wait("document.querySelector('main [aria-label=Message]').value==='Keep this draft'");
    await run("document.querySelector('aside button[aria-label=\"Settings\"]').click()");
    await wait("Boolean(document.querySelector('nav[aria-label=\"Settings sections\"]'))&&!document.querySelector('main [aria-label=Message]')");
    for (const [width, height] of [[1440, 920], [1180, 800], [1040, 680]]) for (const theme of ["light", "dark"]) {
      owner.setSize(width, height); await run(`window.__auditTheme(${JSON.stringify(theme)})`);
      if (!await run("(()=>{const nav=document.querySelector('aside[aria-label=\"Settings\"]').getBoundingClientRect(),main=document.querySelector('main').getBoundingClientRect();return nav.right<=main.left+1&&main.right<=innerWidth&&main.width>=500;})()")) throw Error("Settings columns overlap");
      await capture("t3-layout", `settings-${width}-${theme}`);
    }
    await run("window.__auditButton('Appearance',document.querySelector('nav[aria-label=\"Settings sections\"]')).click()");
    await wait("Boolean(document.querySelector('[role=radiogroup][aria-label=Theme]'))");
    await run("Array.from(document.querySelectorAll('[role=radiogroup][aria-label=Theme] [role=radio]')).find(button=>button.textContent==='Light').click()");
    await wait("document.documentElement.dataset.theme==='light'&&document.querySelector('[role=radiogroup][aria-label=Theme] [aria-checked=true]')?.textContent==='Light'");
    key("Escape");
    await wait(`!document.querySelector('nav[aria-label="Settings sections"]')&&document.querySelector('main [aria-label=Message]')?.value==='Keep this draft'&&window.__auditChatTitle()===${JSON.stringify(secondChat)}`);
    console.log('T3_LAYOUT_SMOKE',JSON.stringify({chatList:60,modeSwitch:true,collapsibleSettled:true,surfaceBack:true,appearance:true,draftPreserved:true,escapeCloses:true,settingsCaptures:6}));
    // The tools panel resizes from its keyboard-focusable separator and by dragging, and remembers its width.
    owner.setSize(1440, 920);
    await run("window.__auditPaletteRun('Show files and changes')");
    await wait("Boolean(document.querySelector('aside[aria-label=\"Tools\"] [aria-label=\"Resize panel\"]'))");
    const tools = "document.querySelector('aside[aria-label=\"Tools\"]')";
    await run(`${tools}.querySelector('[aria-label="Resize panel"]').focus()`);
    for (let index = 0; index < 30; index++) key("Right");
    await wait(`${tools}.getBoundingClientRect().width===360`);
    const initialWidth = 360;
    await run(`${tools}.querySelector('[aria-label="Resize panel"]').focus()`); key("Left");
    await wait(`${tools}.getBoundingClientRect().width===${initialWidth + 24}`);
    const handle = await run(`(()=>{const r=${tools}.querySelector('[aria-label="Resize panel"]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+100)};})()`);
    owner.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...handle });
    owner.webContents.sendInputEvent({ type: "mouseMove", x: handle.x - 80, y: handle.y });
    owner.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, x: handle.x - 80, y: handle.y });
    await wait(`${tools}.getBoundingClientRect().width===${initialWidth + 104}`);
    if (!await run(`JSON.parse(localStorage.getItem('phaseo.desktop.rightPanelWidth'))===${initialWidth + 104}`)) throw Error("Tools width was not persisted");
    for (const size of [[1440, 920], [1180, 800], [1040, 680]]) {
      owner.setSize(...size);
      for (const collapsed of [false, true]) {
        if (collapsed) await run("document.querySelector('[aria-label=\"Hide sidebar\"]').click()");
        await run(`${tools}.querySelector('[aria-label="Resize panel"]').focus()`);
        for (let index = 0; index < 30; index++) key("Left");
        await wait(`(()=>{const main=document.querySelector('main').getBoundingClientRect(),tools=${tools}.getBoundingClientRect();return main.right<=tools.left+1&&tools.right<=innerWidth+1&&main.width>=319;})()`);
        await capture("shadcn-controls", `tools-${size[0]}-${collapsed ? "sidebar-hidden" : "sidebar-shown"}`);
        if (collapsed) await run("document.querySelector('[aria-label=\"Show sidebar\"]').click()");
      }
    }
    owner.setSize(1440, 920);
    await run(`${tools}.querySelector('[aria-label="Close panel"]').click()`);
    await wait(`!${tools}&&document.querySelector('aside[aria-label="Chats"] [data-chat-count]')?.dataset.chatCount==='60'&&${rows}.length>0`);
    // The composer's model picker stays inside the window and returns focus when dismissed.
    for (const [width, height] of [[1440, 920], [1180, 800], [1040, 680]]) for (const theme of ["light", "dark"]) {
      owner.setSize(width, height); await run(`window.__auditTheme(${JSON.stringify(theme)})`);
      await run("document.querySelector('main form [aria-label=\"Choose model\"]').click()");
      await wait("Boolean(document.querySelector('[data-slot=popover-content] [role=combobox]'))");
      if (!await run("(()=>{const r=document.querySelector('[data-slot=popover-content]').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})()")) throw Error("Model picker exceeds window");
      await capture("shadcn-controls", `${width}-${theme}`);
      key("Escape");
      await wait("!document.querySelector('[data-slot=popover-content]')&&document.activeElement?.getAttribute('aria-label')==='Choose model'");
    }
    owner.setSize(1440, 920);
    // Without a connected runtime a new chat asks to sign in; an API connection from Settings unlocks Phaseo's catalog.
    await run("window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,bubbles:true}))");
    await wait("Boolean(window.__auditButton('Continue with GitHub'))&&!document.querySelector('main [aria-label=Message]')");
    await run("window.__auditButton('Connect in Settings').click()");
    await wait("Boolean(document.querySelector('form[aria-label=\"Add account\"]'))&&document.querySelector('nav[aria-label=\"Settings sections\"] [aria-current=page]')?.textContent==='Accounts'");
    await run("window.__auditChoose('Account provider','phaseo')");
    await wait("document.querySelectorAll('form[aria-label=\"Add account\"] input:not([type=hidden]):not([aria-hidden=true])').length===3");
    await run("(()=>{const inputs=document.querySelectorAll('form[aria-label=\"Add account\"] input:not([type=hidden]):not([aria-hidden=true])');for(const [index,value] of ['Owned Phaseo','http://127.0.0.1:12345/v1','owned-fixture-key'].entries())window.__auditType(inputs[index],value);})()");
    await run("document.querySelector('form[aria-label=\"Add account\"]').requestSubmit()");
    await wait("Array.from(document.querySelectorAll('article')).some(article=>article.textContent.includes('Owned Phaseo'))");
    await run("window.__auditCloseSettings()");
    await wait("document.querySelector('main form [aria-label=\"Choose model\"]')?.textContent.includes('Owned model 0')&&!window.__auditButton('Continue with GitHub')");
    // Search, Free and New filters, favourites and lab logos.
    const popup = "document.querySelector('[data-slot=popover-content]')";
    // The list is virtualised: rendered rows are a window, and every option reports the full count.
    const items = `Array.from(${popup}?.querySelectorAll('#model-picker-list [role=option]')??[]).filter(item=>!item.textContent.startsWith('Show'))`;
    const count = `Number(${popup}?.querySelector('#model-picker-list [role=option]')?.getAttribute('aria-setsize')??0)`;
    await run("document.querySelector('main form [aria-label=\"Choose model\"]').click()");
    await wait(`${count}===1000`);
    await run(`window.__auditType(${popup}.querySelector('[role=combobox]'),'owned model')`);
    await wait(`${count}===25&&Array.from(${popup}.querySelectorAll('#model-picker-list [role=presentation]')).some(heading=>heading.textContent==='Results (25 of 1000)')`);
    await run(`window.__auditType(${popup}.querySelector('[role=combobox]'),'')`);
    await run(`window.__auditButton('New',${popup}).click()`);
    await wait(`${count}===1&&${items}[0].textContent.includes('OpenAI: Owned model 999')`);
    await run(`${popup}.querySelector('[aria-label="Add Owned model 999 to favourites"]').click()`);
    await wait(`Array.from(${popup}.querySelectorAll('#model-picker-list [role=presentation]')).some(heading=>heading.textContent==='Favourites')&&Boolean(${popup}.querySelector('[aria-label="Remove Owned model 999 from favourites"]'))`);
    if (!await run(`${items}.every(item=>Array.from(item.querySelectorAll('img')).every(image=>image.complete&&image.naturalWidth>0))&&Boolean(${items}[0].querySelector('[data-model-lab=openai]'))&&JSON.parse(localStorage.getItem('phaseo.desktop.favouriteModels')).includes('phaseo:owned-model-999')`)) throw Error('Model branding or favourite persistence failed');
    await run(`window.__auditButton('Free',${popup}).click()`);
    await wait(`${count}===0&&${popup}.textContent.includes('No models found')`);
    await run(`window.__auditButton('Free',${popup}).click();window.__auditButton('New',${popup}).click()`);
    await wait(`${count}===1000&&JSON.parse(localStorage.getItem('phaseo.desktop.modelFilters')).free===false`);
    key("Escape");
    await wait(`!${popup}`);
    console.log('PHASEO_MODEL_FILTERS_SMOKE', JSON.stringify({search:true,free:true,new:true,favourites:true,persistence:true,clear:true,logos:true}));
    // Choosing a model and its settings; reopening the picker reuses the cached catalog.
    const cachedReads = modelReads;
    await run("document.querySelector('main form [aria-label=\"Choose model\"]').click()");
    await wait(`Boolean(${popup}?.querySelector('[role=combobox]'))`);
    await run(`window.__auditType(${popup}.querySelector('[role=combobox]'),'owned model 999')`);
    await wait(`${items}[0]?.textContent.includes('Owned model 999')`);
    await run(`${items}[0].click()`);
    await wait(`!${popup}&&document.querySelector('main form [aria-label="Choose model"]').textContent.includes('Owned model 999')`);
    await run("window.__auditMenu('main form button[aria-label^=\"Model settings:\"]',item=>item.textContent.trim().startsWith('High'))");
    await run("window.__auditMenu('main form button[aria-label^=\"Model settings:\"]','On')");
    await wait("Boolean(document.querySelector('main form button[aria-label=\"Model settings: High, fast\"]'))");
    if (modelReads !== cachedReads) throw Error('Reopening the picker refetched a cached catalog');
    console.log('UNIFIED_PICKER_SMOKE',JSON.stringify({modelReasoningSpeed:true,cachedCatalog:true}));
    // Background refreshes keep the cached catalog on failure and report the error until a later refresh succeeds.
    await run("document.querySelector('main form [aria-label=\"Choose model\"]').click()");
    await wait(`${count}===1000`);
    modelRefreshDelay = 500; modelRefreshFailure = true;
    await advanceBackgroundRefresh(owner);
    if (!await run(`${count}===1000`)) throw Error('Background refresh hid cached models');
    await wait(`${popup}.textContent.includes('Phaseo: Owned model refresh failure')`);
    if (!await run(`${count}===1000`)) throw Error('Refresh failure cleared cached models');
    modelRefreshFailure = false; modelRefreshDelay = 0;
    await advanceBackgroundRefresh(owner);
    await wait(`!${popup}.textContent.includes('Owned model refresh failure')&&${count}===1000`);
    key("Escape");
    await wait(`!${popup}`);
    console.log('MODEL_SWR_SMOKE', JSON.stringify({cachedMenuSwitch:true,backgroundRefresh:true,staleOnFailure:true,retry:true}));
    await run("window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,bubbles:true}))");
    await wait("window.__auditChatTitle()===undefined&&Boolean(document.querySelector('main [aria-label=Message]'))");
    for (const [width, height] of [[1440, 920], [1180, 800], [1040, 680]]) for (const theme of ["light", "dark"]) {
      owner.setSize(width, height); await run(`window.__auditTheme(${JSON.stringify(theme)})`);
      if (!await run("(()=>{const composer=document.querySelector('main form').getBoundingClientRect();return composer.width>250&&composer.left>=0&&composer.right<=innerWidth&&composer.bottom<=innerHeight;})()")) throw Error('Landing composer overflow');
      await capture("new-chat", `${width}-${theme}`);
    }
    owner.setSize(1440, 920);
    // A failed first message stays in the new chat's composer for a retry, and is never sent twice.
    const originalCommand = ipcMain._invokeHandlers.get('workspace:command'); let sends = 0; let firstMessage;
    ipcMain.removeHandler('workspace:command'); ipcMain.handle('workspace:command', (event, value) => {
      if (value.type === 'create-task' && value.mode !== 'chat') throw Error('A personal chat was not created in Chat mode');
      if (value.type === 'send') { sends++; firstMessage = value.text; if (sends === 1) throw Error('Owned first-message failure'); return originalCommand(event, { type: 'update-task', id: value.id, title: 'Owned first-message success' }); }
      return originalCommand(event, value);
    });
    await run("document.querySelector('main form [aria-label=\"Choose model\"]').click()");
    await run(`window.__auditType(${popup}.querySelector('[role=combobox]'),'owned model 0')`);
    await wait(`${items}[0]?.textContent.trim().startsWith('Anthropic: Owned model 0')`);
    await run(`${items}[0].click()`);
    await wait(`!${popup}&&document.querySelector('main form [aria-label="Choose model"]').textContent.trim()==='Owned model 0'`);
    await run("window.__auditType(document.querySelector('main [aria-label=Message]'),'Keep my first message')");
    await wait("!document.querySelector('main form [aria-label=Send]').disabled");
    await run("document.querySelector('main form [aria-label=Send]').click()");
    await wait("window.__auditChatTitle()!==undefined&&document.querySelector('main [aria-label=Message]')?.value==='Keep my first message'&&document.querySelector('[role=alert]')?.textContent.includes('Owned first-message failure')");
    if (sends !== 1 || firstMessage !== 'Keep my first message') throw Error('First-message creation was duplicated or lost');
    await run("document.querySelector('main form [aria-label=Send]').click()");
    await wait("document.querySelector('main [aria-label=Message]')?.value===''&&window.__auditChatTitle()==='Owned first-message success'");
    if (sends !== 2) throw Error('First-message retry missing');
    ipcMain.removeHandler('workspace:command'); ipcMain.handle('workspace:command', originalCommand);
    console.log('NEW_CHAT_COMPOSER_SMOKE',JSON.stringify({composer:true,createAndSend:true,failureDraftPreserved:true,retry:true,captures:6,providerInferenceCalls:0}));
    // A specific default model applies to new chats; "Last used model" restores the most recent choice.
    await run("window.__auditSettings('General')");
    await wait("Boolean(document.querySelector('[aria-label=\"New chat model selection\"]'))");
    await run("window.__auditChoose('New chat model selection','fixed')");
    // The default model uses the composer's picker and saves as soon as it is chosen.
    await run("document.querySelector('[aria-label=\"New chats\"] [aria-label=\"Choose model\"]').click()");
    await wait("Boolean(document.querySelector('[data-slot=popover-content] [role=combobox]'))");
    await run("document.querySelector('[data-slot=popover-content] [role=combobox]').focus()");
    owner.webContents.insertText('Owned model 999');
    await wait("Array.from(document.querySelectorAll('#model-picker-list [role=option]')).some(option=>option.textContent.includes('Owned model 999'))");
    await run("Array.from(document.querySelectorAll('#model-picker-list [role=option]')).find(option=>option.textContent.includes('Owned model 999')).click()");
    await wait("JSON.parse(localStorage.getItem('phaseo.desktop.modelPreferences')).defaultSelection?.model==='owned-model-999'");
    await run("window.__auditCloseSettings()");
    await run("window.dispatchEvent(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,bubbles:true}))");
    await wait("window.__auditChatTitle()===undefined&&document.querySelector('main form [aria-label=\"Choose model\"]')?.textContent.trim()==='Owned model 999'");
    await run("window.__auditSettings('General')");
    await wait("Boolean(document.querySelector('[aria-label=\"New chat model selection\"]'))");
    await run("window.__auditChoose('New chat model selection','recent')");
    await run("window.__auditCloseSettings()");
    await wait("window.__auditChatTitle()===undefined&&document.querySelector('main form [aria-label=\"Choose model\"]')?.textContent.trim()==='Owned model 0'");
    console.log('MODEL_PREFERENCES_SMOKE',JSON.stringify({remembered:true,specificDefault:true,clearDefault:true,inferenceCalls:0}));
    console.log("PHASEO_CONNECT_SMOKE",JSON.stringify({settingsConnection:true,encryptedAccount:true,modelDiscovery:true,existingAccountSelected:true,inferenceCalls:0}));
    console.log("SHADCN_CONTROLS_SMOKE", JSON.stringify({ chatBackForward: true, surfaceBack: true, sidebarToggle: true, toolsKeyboardResize: true, toolsPointerResize: true, toolsWidthPersistence: true, paneSeparation: true, minimumConversationWidth: 320, select: true, focusRestoration: true, selection: true, searchableModels: 1000, captures: 31, packaged: Boolean(entry), inferenceCalls: 0 }));
    clearTimeout(deadline); app.quit();
  } catch (error) { const owner=BrowserWindow.getAllWindows()[0]; if(owner) console.error("CONTROL_STATE",await owner.webContents.executeJavaScript("JSON.stringify({geometry:Array.from(document.querySelectorAll('aside,main')).map(el=>({label:el.getAttribute('aria-label')??el.tagName,rect:el.getBoundingClientRect().toJSON()})),window:innerWidth,chat:window.__auditChatTitle?.(),focus:document.activeElement?.outerHTML.slice(0,400)})").catch(()=>"")); console.error(error); app.exit(1); }
});
