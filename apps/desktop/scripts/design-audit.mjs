import { app, BrowserWindow } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// A separate, disposable profile: no user accounts or inference calls.
const data = mkdtempSync(path.join(tmpdir(), "phaseo-design-audit-"));
app.setPath("userData", data);
mkdirSync(path.join(data, "workspace"));
const seed = new DatabaseSync(path.join(data, "workspace/workspace.sqlite"));
seed.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
const now = new Date().toISOString();
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-example", JSON.stringify({ id: "design-example", title: "Plan the product launch", harness: "phaseo", model: "default", mode: "chat", status: "completed", pinned: true, archived: false, queue: [], createdAt: now, updatedAt: now, messages: [{ id: "u", role: "user", text: "Help me plan the launch of our desktop workspace.", createdAt: now }, { id: "a", role: "assistant", text: "## Launch priorities\n\nStart with a clear promise: one workspace for your accounts, models, and everyday work.\n\n1. Validate the core task workflow with a small group.\n2. Prepare examples for research, writing, and coding.\n3. Gather feedback before expanding access.\n\nWe can turn these priorities into a weekly plan next.", createdAt: now }] }));
seed.exec("CREATE TABLE agents (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
const codeExample = JSON.parse(seed.prepare("SELECT data FROM tasks WHERE id = ?").get("design-example").data);
const fence = String.fromCharCode(96).repeat(3);
codeExample.messages[1].text += `\n\n${fence}ts\nconst greeting = "Hello, 世界";\n  console.log(greeting);\n${fence}`;
seed.prepare("UPDATE tasks SET data = ? WHERE id = ?").run(JSON.stringify(codeExample), "design-example");
seed.prepare("INSERT INTO agents VALUES (?, ?)").run("design-agent", JSON.stringify({ id: "design-agent", name: "Design fixture", executable: process.execPath, arguments: [path.resolve("scripts/fixtures/grok-interaction.cjs")] }));
const settingsTask = JSON.parse(seed.prepare("SELECT data FROM tasks WHERE id = ?").get("design-example").data);
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-settings", JSON.stringify({ ...settingsTask, id: "design-settings", title: "Review workspace plan", pinned: false, harness: "acp", agentId: "design-agent", mode: "plan", nativeModels: [{ id: "grok-fixture-b", name: "Fixture B", default: true, reasoningEfforts: [{ id: "high", description: "High" }, { id: "low", description: "Low" }], defaultReasoningEffort: "high" }], nativeModes: [{ id: "plan", name: "Plan", default: true }] }));
const grokSettings = JSON.parse(seed.prepare("SELECT data FROM tasks WHERE id = ?").get("design-settings").data);
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-grok-settings", JSON.stringify({ ...grokSettings, id: "design-grok-settings", title: "Review Grok reasoning", harness: "grok", agentId: undefined }));
seed.exec("CREATE TABLE accounts (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
seed.prepare("INSERT INTO accounts VALUES (?, ?)").run("design-account", JSON.stringify({ id: "design-account", name: "Design account", harness: "phaseo", kind: "api", configured: false, endpoint: "https://example.invalid/v1" }));
seed.close();
await import("../dist/main/index.mjs");
app.whenReady().then(async () => {
const window = BrowserWindow.getAllWindows()[0];
if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
const output = path.resolve("../../output/playwright/design-audit", process.argv.includes("--before") ? "before" : "after");
mkdirSync(output, { recursive: true });
try {
  await window.webContents.executeJavaScript(`Promise.all([400,600,700].map(weight=>document.fonts.load(weight+' 14px Montserrat'))).then(()=>true)`);
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const [width, height] of [[1440, 920], [1040, 680]]) {
    window.setSize(width, height);
    for (const theme of ["light", "dark"]) {
      await window.webContents.executeJavaScript(`(()=>{const desired=${JSON.stringify(theme)};if(document.documentElement.dataset.theme!==desired)document.querySelector('[aria-label="Use '+desired+' theme"]').click()})()`);
      await new Promise(resolve => setTimeout(resolve, 100));
      for (const page of ["Home", "Tasks", "Accounts", "Projects", "Missions", "Agents", "MCP", "Settings", "Inbox"]) {
        await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.sidebar-item')).find(b=>b.textContent.trim()===${JSON.stringify(page)}).click()`);
        if (page === "Tasks") {
          for (let attempt = 0; ; attempt++) {
            const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-list-heading button'))`);
            if (ready) break;
            if (attempt > 50) throw new Error("Task list did not render.");
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          await window.webContents.executeJavaScript(`document.querySelector('.task-list-heading button').click()`);
        }
        const expected = { Tasks: "What would you like to do?", Home: "Your AI workspace", MCP: "MCP connections" }[page] ?? page;
        for (let attempt = 0; ; attempt++) {
          const ready = await window.webContents.executeJavaScript(`(()=>{const active=document.querySelector('.sidebar-item.active');return active?.textContent.trim()===${JSON.stringify(page)} && Array.from(document.querySelectorAll('h1')).some(e=>e.textContent===${JSON.stringify(expected)})})()`);
          if (ready) break;
          if (attempt > 50) throw new Error(`Page did not render: ${page}`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        const image = await window.webContents.capturePage();
        const name = `${width}-${theme}-${page.toLowerCase()}`;
        writeFileSync(path.join(output, `${name}.png`), image.toPNG());
        const measurements = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('h1,h2,h3,label,.page,.panel,.task-setup,.account-row,.task-toolbar')).map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,class:e.className,text:e.textContent.slice(0,80),font:s.fontSize,padding:s.padding,width:r.width,height:r.height,x:r.x,y:r.y}})`);
        writeFileSync(path.join(output, `${name}.json`), JSON.stringify(measurements, null, 2));
        if (page === "Agents") {
          const command = await window.webContents.executeJavaScript(`(()=>{const details=document.querySelector('.agent-command');const text=details?.querySelector('code')?.textContent;details?.querySelector('summary')?.click();return {text,open:details?.open}})()`);
          if (!command.open || !command.text.includes("grok-interaction.cjs")) throw new Error("The full agent command must remain available.");
          writeFileSync(path.join(output, `${width}-${theme}-agent-command.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('article button')).find(button=>button.textContent==='Edit').click();document.querySelector('form[aria-label="Agent connection"]').scrollIntoView({block:'nearest'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          const actions = await window.webContents.executeJavaScript(`(()=>{const row=document.querySelector('form[aria-label="Agent connection"] .account-form-actions');return {gap:row&&getComputedStyle(row).gap,count:row?.querySelectorAll('button').length}})()`);
          if (actions.gap !== "8px" || actions.count !== 2) throw new Error("Agent editor actions need consistent spacing.");
          writeFileSync(path.join(output, `${width}-${theme}-agent-editor.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('form[aria-label="Agent connection"] button')).find(button=>button.textContent==='Cancel').click()`);
        }
        if (page === "MCP") {
          const actions = await window.webContents.executeJavaScript(`(()=>{const row=document.querySelector('form[aria-label="MCP connection"] .account-form-actions');return {gap:row&&getComputedStyle(row).gap,column:row&&getComputedStyle(row).gridColumn,count:row?.querySelectorAll('button').length}})()`);
          if (actions.gap !== "8px" || actions.column !== "1 / -1" || actions.count !== 1) throw new Error("MCP form actions need their own spaced row.");
        }
        if (page === "Accounts") {
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('article')).find(row=>row.textContent.includes('Design account')).querySelectorAll('button')[0].click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          const editorLayout = await window.webContents.executeJavaScript(`(()=>{const form=document.querySelector('form[aria-label="Edit account"]');return {padding:form&&getComputedStyle(form).padding,key:form?.querySelector('input[type="password"]')?.value}})()`);
          if(editorLayout.padding!=="24px" || editorLayout.key!=="") throw new Error("Account editor spacing or empty-key state is inconsistent.");
          await window.webContents.executeJavaScript(`document.querySelector('form[aria-label="Edit account"]').scrollIntoView({block:'nearest'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          writeFileSync(path.join(output, `${width}-${theme}-account-editor.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`Array.from(document.querySelector('form[aria-label="Edit account"]').querySelectorAll('button')).find(button=>button.textContent==='Cancel').click()`);
        }
        if (page === "Tasks") {
          const actionLayout = await window.webContents.executeJavaScript(`(()=>{const row=document.querySelector('.task-start .task-controls'),buttons=row?.querySelectorAll('button');return {gap:row&&getComputedStyle(row).gap,wrap:row&&getComputedStyle(row).flexWrap,count:buttons?.length}})()`);
          if (actionLayout.gap !== "8px" || actionLayout.wrap !== "wrap" || actionLayout.count !== 2) throw new Error("New-task actions need separate, wrapping controls.");
          await window.webContents.executeJavaScript(`document.querySelector('.task-row').click()`);
          await new Promise(resolve => setTimeout(resolve, 200));
          const messageLayout = await window.webContents.executeJavaScript(`(()=>{const message=document.querySelector('.message-markdown'),heading=message?.querySelector('h2'),paragraph=heading?.nextElementSibling;return {whiteSpace:message&&getComputedStyle(message).whiteSpace,headingGap:heading&&paragraph?paragraph.getBoundingClientRect().top-heading.getBoundingClientRect().bottom:null}})()`);
          if (messageLayout.whiteSpace !== "normal" || messageLayout.headingGap === null || messageLayout.headingGap > 20) throw new Error("Markdown conversation spacing is inconsistent.");
          await window.webContents.executeJavaScript(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.auditCopiedCode=text;}}});document.querySelector('button[aria-label="Copy code"]').click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          const copied = await window.webContents.executeJavaScript(`window.auditCopiedCode==='const greeting = "Hello, 世界";\\n  console.log(greeting);\\n' && Boolean(document.querySelector('button[aria-label="Copied"]'))`);
          if(!copied) throw new Error("Code copying changed formatting or failed to confirm success.");
          await window.webContents.executeJavaScript(`navigator.clipboard.writeText=async()=>{throw new Error('Owned clipboard failure');};document.querySelector('button[aria-label="Copied"]').click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          if(!await window.webContents.executeJavaScript(`document.querySelector('.message-code-actions span').textContent==='Copy failed' && Boolean(document.querySelector('button[aria-label="Copy code"]'))`)) throw new Error("Clipboard failure feedback is missing.");
          await window.webContents.executeJavaScript(`navigator.clipboard.writeText=async text=>{window.auditCopiedCode=text;};document.querySelector('button[aria-label="Copy code"]').click();document.querySelector('.message-code-block').scrollIntoView({block:'nearest'})`);
          await new Promise(resolve=>setTimeout(resolve,100));
          writeFileSync(path.join(output, `${width}-${theme}-code-block.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`document.querySelector('.task-messages').scrollTop=0;new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          writeFileSync(path.join(output, `${width}-${theme}-conversation.json`), JSON.stringify(messageLayout, null, 2));
          writeFileSync(path.join(output, `${width}-${theme}-conversation.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Review workspace plan')).click()`);
          await new Promise(resolve => setTimeout(resolve, 100));
          await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Task settings"]').click()`);
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Review Grok reasoning')).click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Task settings"]').click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          const grokReady = await window.webContents.executeJavaScript(`(()=>{const reasoning=document.querySelector('select[aria-label="Reasoning effort"]'),mode=document.querySelector('select[aria-label="Task mode"]');return reasoning?.querySelector('option[value="low"]') && !mode?.querySelector('option[value="chat"]') && document.querySelector('.task-title')?.value==='Review Grok reasoning'})()`);
          if(!grokReady) throw new Error("Grok reasoning settings did not render.");
          writeFileSync(path.join(output, `${width}-${theme}-grok-settings.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Task settings"]').click()`);
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Review workspace plan')).click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Task settings"]').click()`);
          for (let attempt = 0; ; attempt++) {
            if (await window.webContents.executeJavaScript(`Boolean(document.querySelector('form.task-settings'))`)) break;
            if (attempt > 50) throw new Error("Conversation settings did not render.");
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          await window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          const settingsLayout = await window.webContents.executeJavaScript(`(()=>{const form=document.querySelector('form.task-settings'),s=getComputedStyle(form),r=form.getBoundingClientRect();return {padding:s.padding,width:r.width,height:r.height,title:document.querySelector('.task-title').value}})()`);
          if (settingsLayout.padding !== "24px" || settingsLayout.height < 100 || settingsLayout.title !== "Review workspace plan") throw new Error("Conversation settings layout did not settle.");
          writeFileSync(path.join(output, `${width}-${theme}-conversation-settings.json`), JSON.stringify(settingsLayout, null, 2));
          writeFileSync(path.join(output, `${width}-${theme}-conversation-settings.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Task settings"]').click()`);
        }
      }
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.surface-switcher button')).find(b=>b.textContent==='Platform').click()`);
      for (let attempt = 0; ; attempt++) {
        if (await window.webContents.executeJavaScript(`document.querySelector('h1')?.textContent==='Platform'`)) break;
        if (attempt > 50) throw new Error("Platform did not render.");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      writeFileSync(path.join(output, `${width}-${theme}-platform.png`), (await window.webContents.capturePage()).toPNG());
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.surface-switcher button')).find(b=>b.textContent==='Workspace').click()`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  console.log("DESIGN_AUDIT", output);
} catch (error) { console.error(error); app.exit(1); } finally { app.quit(); }
});
