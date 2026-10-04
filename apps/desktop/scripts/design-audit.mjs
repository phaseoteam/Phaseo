import { app, BrowserWindow, ipcMain } from "electron";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

// A separate, disposable profile: no user accounts or inference calls.
let activeTaskFixture,taskActionCalls=0;
let holdProposals=false,pendingProposals,proposalCalls=0,emptyProposals=false,failProposalLink=false,proposalLinks=[];
const proposalFixture={repository:'phaseoteam/Phaseo',fetchedAt:'2026-10-04T00:00:00Z',limitReached:false,requests:[{number:2702,title:'Keep <untrusted> 世界 and review the desktop changes',url:'https://github.com/phaseoteam/Phaseo/pull/2702',author:'fixture',draft:true,head:'feature/desktop',base:'main',updatedAt:'2026-10-04T00:00:00Z',review:'required',checks:'pending'},{number:2703,title:'Ready for review',url:'https://github.com/phaseoteam/Phaseo/pull/2703',author:'fixture',draft:false,head:'feature/next',base:'main',updatedAt:'2026-10-04T00:00:00Z',review:'approved',checks:'passing'}]};
async function auditProposals(window,output,width,theme){
 const select=value=>window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('select[aria-label="Pull-request project"]');select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 const waitPending=async()=>{for(let attempt=0;!pendingProposals;attempt++){if(attempt>50)throw Error('Pull-request read did not start');await new Promise(resolve=>setTimeout(resolve,20));}};
 holdProposals=true;await select('design-project');await waitPending();
 if(!await window.webContents.executeJavaScript(`document.querySelector('.proposals-page [role="status"]').textContent==='Loading pull requests…'&&document.querySelector('.proposals-page .panel-heading button').disabled`))throw Error('Pull-request loading feedback is missing');
 writeFileSync(path.join(output,`${width}-${theme}-proposals-loading.png`),(await window.webContents.capturePage()).toPNG());
 pendingProposals.reject(Error('Owned pull-request read failure'));pendingProposals=undefined;
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.proposals-page [role="alert"]')?.textContent==='Owned pull-request read failure'`);attempt++){if(attempt>50)throw Error('Pull-request error was not readable');await new Promise(resolve=>setTimeout(resolve,20));}
 writeFileSync(path.join(output,`${width}-${theme}-proposals-failure.png`),(await window.webContents.capturePage()).toPNG());
 const before=proposalCalls;await window.webContents.executeJavaScript(`(()=>{const button=document.querySelector('.proposals-page .panel-heading button');button.click();button.click()})()`);await waitPending();if(proposalCalls!==before+1)throw Error('Pull-request retry was duplicated');
 holdProposals=false;pendingProposals.resolve();pendingProposals=undefined;
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelectorAll('.proposal-row').length===2&&!document.querySelector('.proposals-page [role="status"]')`);attempt++){if(attempt>50)throw Error('Pull-request retry did not recover');await new Promise(resolve=>setTimeout(resolve,20));}
 if(!await window.webContents.executeJavaScript(`document.querySelector('.proposal-row').textContent.includes('<untrusted> 世界')&&!document.querySelector('.proposal-row untrusted')&&getComputedStyle(document.querySelector('.proposal-row')).padding==='20px'`))throw Error('Pull-request content or card spacing changed');
 writeFileSync(path.join(output,`${width}-${theme}-proposals-results.png`),(await window.webContents.capturePage()).toPNG());
 failProposalLink=true;await window.webContents.executeJavaScript(`document.querySelector('.proposal-row button').click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.proposals-page [role="alert"]')?.textContent==='Owned pull-request link failure'`);attempt++){if(attempt>50)throw Error('Pull-request link failure did not render');await new Promise(resolve=>setTimeout(resolve,20));}
 writeFileSync(path.join(output,`${width}-${theme}-proposals-link-failure.png`),(await window.webContents.capturePage()).toPNG());
 failProposalLink=false;const links=proposalLinks.length;await window.webContents.executeJavaScript(`(()=>{const button=document.querySelector('.proposal-row button');button.click();button.click()})()`);await new Promise(resolve=>setTimeout(resolve,100));if(proposalLinks.length!==links+1||proposalLinks.at(-1)!==proposalFixture.requests[0].url)throw Error('Pull-request link retry changed its URL or duplicated delivery');
 holdProposals=true;await window.webContents.executeJavaScript(`document.querySelector('.proposals-page .panel-heading button').click()`);await waitPending();await select('');pendingProposals.resolve();pendingProposals=undefined;holdProposals=false;await new Promise(resolve=>setTimeout(resolve,100));if(await window.webContents.executeJavaScript(`Boolean(document.querySelector('.proposal-row'))`))throw Error('Obsolete project response remained visible');
 emptyProposals=true;await select('design-project');for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.proposals-page').textContent.includes('No open pull requests.')`);attempt++){if(attempt>50)throw Error('Pull-request empty state missing');await new Promise(resolve=>setTimeout(resolve,20));}
 writeFileSync(path.join(output,`${width}-${theme}-proposals-empty.png`),(await window.webContents.capturePage()).toPNG());emptyProposals=false;await select('');
 let rejected=false;try{await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.pullRequests('unregistered-project')`);}catch{rejected=true;}if(!rejected)throw Error('Unregistered pull-request project was accepted');
}
let holdConnectionSave=false,pendingConnectionSave,connectionSaveCalls=0;
let holdSettingsRead=false,pendingSettingsRead,settingsReadCalls=0,holdSettingsSave=false,pendingSettingsSave,settingsSaveCalls=0;
async function auditSettingsRecovery(window,output,width,theme){
 const readBefore=settingsReadCalls;
 for(let attempt=0;!pendingSettingsRead;attempt++){if(attempt>50)throw Error('Settings read did not start');await new Promise(resolve=>setTimeout(resolve,20));}
 if(!await window.webContents.executeJavaScript(`document.querySelector('.settings-feedback [role="status"]').textContent==='Loading settings…'&&Array.from(document.querySelectorAll('.settings-fields input,.settings-fields select')).every(control=>control.disabled)`))throw Error('Settings loading must be visible and disable controls');
 writeFileSync(path.join(output,`${width}-${theme}-settings-loading.png`),(await window.webContents.capturePage()).toPNG());
 pendingSettingsRead.reject(Error('Owned settings read failure'));pendingSettingsRead=undefined;
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.settings-feedback [role="alert"]')?.textContent==='Owned settings read failure'`);attempt++){if(attempt>50)throw Error('Readable settings load failure missing');await new Promise(resolve=>setTimeout(resolve,20));}
 writeFileSync(path.join(output,`${width}-${theme}-settings-load-failure.png`),(await window.webContents.capturePage()).toPNG());
 await window.webContents.executeJavaScript(`(()=>{const button=document.querySelector('.settings-page .panel-heading button');button.click();button.click()})()`);
 for(let attempt=0;!pendingSettingsRead;attempt++){if(attempt>50)throw Error('Settings load retry did not start');await new Promise(resolve=>setTimeout(resolve,20));}
 if(settingsReadCalls!==readBefore+1)throw Error('Duplicate settings retry was delivered');
 holdSettingsRead=false;pendingSettingsRead.resolve();pendingSettingsRead=undefined;
 for(let attempt=0;await window.webContents.executeJavaScript(`document.querySelector('select[aria-label="Desktop alerts"]').disabled`);attempt++){if(attempt>50)throw Error('Settings load retry did not recover');await new Promise(resolve=>setTimeout(resolve,20));}
 const original=await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.preferences().then(value=>value.preferences)`);
 const selected=original.notifications==='all'?'attention':'all',saveBefore=settingsSaveCalls;holdSettingsSave=true;
 await window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('select[aria-label="Desktop alerts"]');select.value=${JSON.stringify(selected)};select.dispatchEvent(new Event('change',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}))})()`);
 for(let attempt=0;!pendingSettingsSave;attempt++){if(attempt>50)throw Error('Settings save did not start');await new Promise(resolve=>setTimeout(resolve,20));}
 if(settingsSaveCalls!==saveBefore+1||!await window.webContents.executeJavaScript(`document.querySelector('.settings-feedback [role="status"]').textContent==='Saving…'&&Array.from(document.querySelectorAll('.settings-fields input,.settings-fields select')).every(control=>control.disabled)`))throw Error('Settings save did not freeze controls or prevent duplicates');
 writeFileSync(path.join(output,`${width}-${theme}-settings-save-pending.png`),(await window.webContents.capturePage()).toPNG());
 pendingSettingsSave.reject(Error('Owned settings save failure'));pendingSettingsSave=undefined;
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.settings-feedback [role="alert"]')?.textContent==='Owned settings save failure'`);attempt++){if(attempt>50)throw Error('Readable settings save failure missing');await new Promise(resolve=>setTimeout(resolve,20));}
 if(!await window.webContents.executeJavaScript(`document.querySelector('select[aria-label="Desktop alerts"]').value===${JSON.stringify(original.notifications)}&&getComputedStyle(document.querySelector('.settings-feedback')).padding==='0px 20px 20px'`))throw Error('Failed settings save changed confirmed values or card insets');
 writeFileSync(path.join(output,`${width}-${theme}-settings-save-failure.png`),(await window.webContents.capturePage()).toPNG());
 await window.webContents.executeJavaScript(`(()=>{const button=document.querySelector('.settings-feedback button');button.click();button.click()})()`);
 for(let attempt=0;!pendingSettingsSave;attempt++){if(attempt>50)throw Error('Settings save retry did not start');await new Promise(resolve=>setTimeout(resolve,20));}
 if(settingsSaveCalls!==saveBefore+2)throw Error('Settings save retry was duplicated');
 holdSettingsSave=false;pendingSettingsSave.resolve();pendingSettingsSave=undefined;
 for(let attempt=0;!await window.webContents.executeJavaScript(`!document.querySelector('.settings-feedback [role="alert"]')&&!document.querySelector('select[aria-label="Desktop alerts"]').disabled&&document.querySelector('select[aria-label="Desktop alerts"]').value===${JSON.stringify(selected)}`);attempt++){if(attempt>50)throw Error('Settings save retry did not confirm requested values');await new Promise(resolve=>setTimeout(resolve,20));}
 if(await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.preferences().then(value=>value.preferences.notifications)`)!==selected)throw Error('Settings retry did not persist');
 writeFileSync(path.join(output,`${width}-${theme}-settings.png`),(await window.webContents.capturePage()).toPNG());
 await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.savePreferences(${JSON.stringify(original)})`);
}
async function auditSidebarNavigation(window,output,width,height,theme){
 const visible=()=>window.webContents.executeJavaScript(`(()=>{const host=document.querySelector('.sidebar-navigation'),active=host.querySelector('[aria-current="page"]');if(!active)return false;const a=active.getBoundingClientRect(),h=host.getBoundingClientRect();return a.top>=h.top-1&&a.bottom<=h.bottom+1})()`);
 await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.sidebar-navigation button')).find(button=>button.textContent==='MCP').click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.sidebar-navigation [aria-current="page"]')?.textContent==='MCP'`);attempt++){if(attempt>50)throw Error('Sidebar selection did not change');await new Promise(resolve=>setTimeout(resolve,20));}
 window.setSize(width,height+80);await new Promise(resolve=>setTimeout(resolve,100));
 await window.webContents.executeJavaScript(`document.querySelector('.sidebar-navigation').scrollTop=0`);
 window.setSize(width,680);
 for(let attempt=0;!await visible();attempt++){if(attempt>50)throw Error('Sidebar active item disappeared after resize');await new Promise(resolve=>setTimeout(resolve,20));}
 window.setSize(width,height);await new Promise(resolve=>setTimeout(resolve,100));
 await window.webContents.executeJavaScript(`document.querySelector('.sidebar-navigation').scrollTop=10000;document.querySelector('.command-button').focus()`);
 window.webContents.send('workspace:open-task','design-example');
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.sidebar-navigation [aria-current="page"]')?.textContent==='Tasks'`)||!await visible();attempt++){if(attempt>50)throw Error('Background navigation did not reveal its active sidebar item');await new Promise(resolve=>setTimeout(resolve,20));}
 if(!await window.webContents.executeJavaScript(`document.activeElement===document.querySelector('.command-button')`))throw Error('Sidebar selection stole keyboard focus');
 for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-row.selected'))&&!document.querySelector('.task-list [role="status"]')`);attempt++){if(attempt>50)throw Error('Sidebar navigation task rows did not settle');await new Promise(resolve=>setTimeout(resolve,20));}
 writeFileSync(path.join(output,`${width}-${theme}-sidebar-active.png`),(await window.webContents.capturePage()).toPNG());
 await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Collapse sidebar"]').click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.sidebar-collapsed'))&&Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)===58`);attempt++){if(attempt>50)throw Error('Sidebar did not collapse to its icon rail');await new Promise(resolve=>setTimeout(resolve,20));}
 const controls=await window.webContents.executeJavaScript(`({labels:Array.from(document.querySelectorAll('.sidebar-navigation button')).map(button=>button.getAttribute('aria-label')),search:document.querySelector('.sidebar-search').getAttribute('aria-label'),settings:document.querySelector('.sidebar-footer button').getAttribute('aria-label'),height:document.querySelector('.sidebar-navigation button').getBoundingClientRect().height})`);
 if(controls.labels.some(label=>!label)||!controls.labels.includes('MCP')||controls.search!=='Search'||controls.settings!=='Settings'||controls.height!==34||!await visible())throw Error('Collapsed navigation has unnamed or clipped controls');
 writeFileSync(path.join(output,`${width}-${theme}-sidebar-collapsed.png`),(await window.webContents.capturePage()).toPNG());
 await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Switch to Platform"]').click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('nav[aria-label="platform navigation"] button[aria-label="Overview"]'))`);attempt++){if(attempt>50)throw Error('Collapsed surface switch did not navigate');await new Promise(resolve=>setTimeout(resolve,20));}
 await window.webContents.executeJavaScript(`document.querySelector('.sidebar-footer button[aria-label="Settings"]').click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('nav[aria-label="workspace navigation"]'))&&document.querySelector('.sidebar-footer [aria-current="page"]')?.getAttribute('aria-label')==='Settings'`);attempt++){if(attempt>50)throw Error('Collapsed Settings did not return to workspace');await new Promise(resolve=>setTimeout(resolve,20));}
 await window.webContents.executeJavaScript(`document.querySelector('.sidebar-navigation button[aria-label="Tasks"]').click();document.querySelector('button[aria-label="Expand sidebar"]').click()`);
 for(let attempt=0;await window.webContents.executeJavaScript(`Boolean(document.querySelector('.sidebar-collapsed'))||Math.round(document.querySelector('.sidebar').getBoundingClientRect().width)!==246`)||!await visible();attempt++){if(attempt>50)throw Error('Expanded sidebar lost active selection or width');await new Promise(resolve=>setTimeout(resolve,20));}
 await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.sidebar-navigation button')).find(button=>button.textContent==='Terminals').click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.sidebar-navigation [aria-current="page"]')?.textContent==='Terminals'`);attempt++){if(attempt>50)throw Error('Sidebar fixture did not restore its initial page');await new Promise(resolve=>setTimeout(resolve,20));}
}
async function auditArgumentFields(window, formLabel) {
 const values=[' two words "quoted" 世界 ','','literal; --flag'];
 await window.webContents.executeJavaScript(`(async()=>{const form=document.querySelector('form[aria-label="'+${JSON.stringify(formLabel)}+'"]'),fields=form.querySelector('.argument-fields');while(fields.querySelector('input')){fields.querySelector('.argument-row button').click();await new Promise(resolve=>requestAnimationFrame(resolve));}for(const value of ${JSON.stringify(values)}){fields.querySelector('.add-argument').click();await new Promise(resolve=>requestAnimationFrame(resolve));const input=fields.querySelector('.argument-row:last-of-type input');if(document.activeElement!==input)throw Error('New argument was not focused');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>requestAnimationFrame(resolve));}fields.querySelector('.argument-row button').click();await new Promise(resolve=>requestAnimationFrame(resolve));const remaining=Array.from(fields.querySelectorAll('input')).map(input=>input.value);if(JSON.stringify(remaining)!==JSON.stringify(['','literal; --flag']))throw Error('Removing an argument changed other values');if(getComputedStyle(fields).gridColumn!=='1 / -1'||getComputedStyle(fields.querySelector('.argument-row')).gap!=='8px')throw Error('Argument fields are not aligned');form.scrollIntoView({block:'nearest'});})()`);
}
async function auditConnectionEditor(window, output, width, theme, kind) {
 const label=kind==='agent'?'Agent connection':'MCP connection';
 const originalAgent=kind==='agent'?await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.overview().then(value=>value.agents.find(agent=>agent.id==='design-agent'))`):undefined;
 if(kind==='mcp')await window.webContents.executeJavaScript(`(async()=>{const form=document.querySelector('form[aria-label="MCP connection"]');for(const [input,value] of [[form.querySelector('input'),${JSON.stringify('Owned editor '+width+' '+theme)}],[Array.from(form.querySelectorAll('label input')).find(input=>input.type==='text'&&input!==form.querySelector('input')),${JSON.stringify(process.execPath)}]]){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>requestAnimationFrame(resolve));}})()`);
 const before=await window.webContents.executeJavaScript(`(()=>{const form=document.querySelector('form[aria-label="'+${JSON.stringify(label)}+'"]'),fieldset=form.querySelector('.connection-fields');return {values:Array.from(form.querySelectorAll('input')).map(input=>input.value),arguments:Array.from(form.querySelectorAll('.argument-row input')).map(input=>input.value),name:form.querySelector('input').value,padding:getComputedStyle(fieldset).padding,heading:form.closest('.connection-editor').querySelector('h2').textContent}})()`);
 if(before.padding!=='20px'||before.heading!==(kind==='agent'?'Edit agent':'New connection'))throw Error('Connection editor heading or inset is incorrect');
 const callsBefore=connectionSaveCalls;holdConnectionSave=true;
 await window.webContents.executeJavaScript(`(()=>{const form=document.querySelector('form[aria-label="'+${JSON.stringify(label)}+'"]');form.requestSubmit();form.requestSubmit()})()`);
 for(let attempt=0;!pendingConnectionSave;attempt++){if(attempt>50)throw Error('Connection save did not start');await new Promise(resolve=>setTimeout(resolve,20));}
 if(connectionSaveCalls!==callsBefore+1||!await window.webContents.executeJavaScript(`(()=>{const form=document.querySelector('form[aria-label="'+${JSON.stringify(label)}+'"]');return form.querySelector('.connection-fields').disabled&&Array.from(form.querySelectorAll('input,select,button')).every(control=>control.matches(':disabled'))&&form.querySelector('button[type="submit"]').textContent==='Saving…'})()`))throw Error('Connection save must freeze fields and reject duplicate submits');
 writeFileSync(path.join(output,`${width}-${theme}-${kind}-save-pending.png`),(await window.webContents.capturePage()).toPNG());
 pendingConnectionSave.reject(Error('Owned configuration save failure'));pendingConnectionSave=undefined;
 for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.connection-editor [role="alert"]'))`);attempt++){if(attempt>50)throw Error('Connection save failure did not render');await new Promise(resolve=>setTimeout(resolve,20));}
 const failed=await window.webContents.executeJavaScript(`(()=>{const form=document.querySelector('form[aria-label="'+${JSON.stringify(label)}+'"]'),card=form.closest('.connection-editor');card.scrollIntoView({block:'nearest'});return {values:Array.from(form.querySelectorAll('input')).map(input=>input.value),error:card.querySelector('[role="alert"]').textContent,disabled:form.querySelector('.connection-fields').disabled}})()`);
 if(failed.disabled||failed.error!=='Owned configuration save failure'||JSON.stringify(failed.values)!==JSON.stringify(before.values))throw Error('Failed save must preserve editable configuration and readable inline feedback');
 writeFileSync(path.join(output,`${width}-${theme}-${kind}-save-failure.png`),(await window.webContents.capturePage()).toPNG());
 await window.webContents.executeJavaScript(`document.querySelector('form[aria-label="'+${JSON.stringify(label)}+'"]').requestSubmit()`);
 for(let attempt=0;!pendingConnectionSave;attempt++){if(attempt>50)throw Error('Connection retry did not start');await new Promise(resolve=>setTimeout(resolve,20));}
 if(connectionSaveCalls!==callsBefore+2)throw Error('Connection retry did not issue exactly one request');
 holdConnectionSave=false;pendingConnectionSave.resolve();pendingConnectionSave=undefined;
 for(let attempt=0;!await window.webContents.executeJavaScript(`(()=>{const form=document.querySelector('form[aria-label="'+${JSON.stringify(label)}+'"]');return !form.querySelector('.connection-fields').disabled&&form.querySelector('input').value===''&&!form.closest('.connection-editor').querySelector('[role="alert"]')})()`);attempt++){if(attempt>50)throw Error('Successful connection retry did not clear the editor');await new Promise(resolve=>setTimeout(resolve,20));}
 const saved=await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.overview().then(value=>value[${JSON.stringify(kind==='agent'?'agents':'mcpConnections')}].find(item=>item.name===${JSON.stringify(before.name)}))`);
 if(!saved||JSON.stringify(saved.arguments)!==JSON.stringify(before.arguments))throw Error('Retry did not persist literal arguments');
 if(kind==='agent')await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.command({type:'update-agent',...${JSON.stringify(originalAgent)}})`);
 else await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.mcp({type:'save',connection:{...${JSON.stringify(saved)},archived:true,enabled:false}})`);
}
async function auditEditorSelection(window,output,width,theme,kind){
 const agent=kind==='agent',label=agent?'Agent connection':'MCP connection';
 const fixtures=await window.webContents.executeJavaScript(`(async()=>{const api=window.phaseoDesktop.workspace;const original=${agent}? (await api.overview()).agents.find(item=>item.id==='design-agent'):undefined;const created=[];for(const suffix of ${JSON.stringify(agent?['B']:['A','B'])}){const value={id:crypto.randomUUID(),name:'Owned selection '+${JSON.stringify(kind+' '+width+' '+theme)}+' '+suffix,executable:${JSON.stringify(process.execPath)},arguments:['literal '+suffix+' 世界'],transport:'stdio',enabled:false};if(${agent}){const state=await api.command({type:'add-agent',name:value.name,executable:value.executable,arguments:value.arguments});created.push(state.agents.find(item=>item.name===value.name));}else{await api.mcp({type:'save',connection:value});created.push(value);}}return {first:original??created[0],second:created.at(-1),created};})()`);
 async function select(value){
  await window.webContents.executeJavaScript(`(()=>{const row=Array.from(document.querySelectorAll('article')).find(row=>row.querySelector('strong')?.textContent===${JSON.stringify(value.name)});if(!row)throw Error('Owned connection row missing');Array.from(row.querySelectorAll('button')).find(button=>button.textContent==='Edit').click()})()`);
  for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('form[aria-label="'+${JSON.stringify(label)}+'"] input')?.value===${JSON.stringify(value.name)}`);attempt++){if(attempt>50)throw Error('Selected connection did not load');await new Promise(resolve=>setTimeout(resolve,20));}
 }
 await new Promise(resolve=>setTimeout(resolve,100));await select(fixtures.first);
 const callsBefore=connectionSaveCalls;holdConnectionSave=true;
 await window.webContents.executeJavaScript(`document.querySelector('form[aria-label="'+${JSON.stringify(label)}+'"]').requestSubmit()`);
 for(let attempt=0;!pendingConnectionSave;attempt++){if(attempt>50)throw Error('Owned selection save did not start');await new Promise(resolve=>setTimeout(resolve,20));}
 pendingConnectionSave.reject(Error('Owned previous configuration failure'));pendingConnectionSave=undefined;holdConnectionSave=false;
 for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.connection-editor [role="alert"]'))&&!document.querySelector('.connection-fields').disabled`);attempt++){if(attempt>50)throw Error('Owned selection failure did not render');await new Promise(resolve=>setTimeout(resolve,20));}
 await select(fixtures.second);
 const result=await window.webContents.executeJavaScript(`(()=>{const form=document.querySelector('form[aria-label="'+${JSON.stringify(label)}+'"]');return {error:Boolean(form.closest('.connection-editor').querySelector('[role="alert"]')),focus:document.activeElement===form.querySelector('input'),arguments:Array.from(form.querySelectorAll('.argument-row input')).map(input=>input.value),padding:getComputedStyle(form.querySelector('.connection-fields')).padding}})()`);
 if(result.error||!result.focus||result.padding!=='20px'||JSON.stringify(result.arguments)!==JSON.stringify(fixtures.second.arguments)||connectionSaveCalls!==callsBefore+1)throw Error('Editor selection retained stale feedback or changed configuration');
 writeFileSync(path.join(output,`${width}-${theme}-${kind}-editor-selection.png`),(await window.webContents.capturePage()).toPNG());
 await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('form[aria-label="'+${JSON.stringify(label)}+'"] button')).find(button=>button.textContent==='Cancel').click()`);
 for(const value of fixtures.created)await window.webContents.executeJavaScript(agent?`window.phaseoDesktop.workspace.command({type:'update-agent',id:${JSON.stringify(value.id)},archived:true})`:`window.phaseoDesktop.workspace.mcp({type:'save',connection:{...${JSON.stringify(value)},archived:true,enabled:false}})`);
}
async function openTaskActions(window){
 await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Task actions"]').click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-actions-menu [role="menuitem"]'))`);attempt++){if(attempt>50)throw new Error('Task actions did not open.');await new Promise(resolve=>setTimeout(resolve,20));}
}
async function auditTaskActions(window,output,width,theme){
 await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Task actions"]').focus()`);
 window.focus();window.webContents.focus();window.webContents.sendInputEvent({type:'keyDown',keyCode:'Enter'});window.webContents.sendInputEvent({type:'char',keyCode:'\r'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Enter'});
 for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-actions-menu [role="menuitem"]'))`);attempt++){if(attempt>50)throw new Error('Keyboard task actions did not open: '+JSON.stringify(await window.webContents.executeJavaScript(`({active:document.activeElement?.outerHTML,trigger:document.querySelector('button[aria-label="Task actions"]')?.outerHTML,menus:Array.from(document.querySelectorAll('[role="menu"]')).map(menu=>menu.outerHTML)})`)));await new Promise(resolve=>setTimeout(resolve,20));}
 const layout=await window.webContents.executeJavaScript(`(()=>{const menu=document.querySelector('.task-actions-menu'),r=menu.getBoundingClientRect(),title=document.querySelector('.task-title').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,title:title.width,font:getComputedStyle(menu).fontFamily,items:menu.querySelectorAll('[role="menuitem"]').length}})()`);
 if(layout.x<0||layout.y<0||layout.right>layout.width||layout.bottom>layout.height||layout.title<300||!layout.font.includes('Montserrat')||layout.items!==6)throw new Error('Task action layout: '+JSON.stringify(layout));
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.activeElement?.getAttribute('role')==='menuitem'`);attempt++){if(attempt>50)throw new Error('Task menu initial focus failed.');await new Promise(resolve=>setTimeout(resolve,20));}
 window.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});
 await new Promise(resolve=>setTimeout(resolve,50));
 if(!await window.webContents.executeJavaScript(`document.activeElement?.textContent==='Fork task history'`))throw new Error('Task menu arrow navigation failed: '+await window.webContents.executeJavaScript(`document.activeElement?.outerHTML`));
 await window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
 writeFileSync(path.join(output,`${width}-${theme}-task-actions.png`),(await window.webContents.capturePage()).toPNG());
 window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
 await new Promise(resolve=>setTimeout(resolve,100));
 if(!await window.webContents.executeJavaScript(`!document.querySelector('.task-actions-menu')&&document.activeElement?.getAttribute('aria-label')==='Task actions'`))throw new Error('Task menu Escape did not restore focus.');
}
async function auditActiveTaskActions(window,output,width,theme){
 const id=await window.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('phaseo.desktop.selectedTask'))`);
 const overview=await window.webContents.executeJavaScript('window.phaseoDesktop.workspace.overview()');
 const source=overview.tasks.find(task=>task.id===id);
 for(const status of ['running','waiting']){
  activeTaskFixture={id,status};
  window.webContents.send('workspace:overview-changed',{...overview,tasks:overview.tasks.map(task=>task.id===id?{...task,revision:task.revision+1,status,updatedAt:new Date().toISOString()}:task)});
  for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.task-toolbar small')?.textContent.endsWith(${JSON.stringify(status)})`);attempt++){if(attempt>50)throw new Error('Active task fixture did not refresh');await new Promise(resolve=>setTimeout(resolve,20));}
  await openTaskActions(window);
  const before=taskActionCalls;
  const controls=await window.webContents.executeJavaScript(`(()=>{const items=Array.from(document.querySelectorAll('.task-actions-menu [role="menuitem"]'));const blocked=['Fork task history','Handoff','Archive task'];const result=items.map(item=>({label:item.textContent,disabled:item.hasAttribute('data-disabled')}));for(const item of items.filter(item=>blocked.includes(item.textContent)))item.click();return {items:result,queue:document.querySelector('.task-composer small')?.textContent,settings:document.querySelector('button[aria-label="Task settings"]')?.disabled}})()`);
  const blocked=['Fork task history','Handoff','Archive task'];
  if(controls.items.some(item=>item.disabled!==blocked.includes(item.label))||!controls.queue.endsWith(' to queue')||!controls.settings)throw new Error('Active task controls: '+JSON.stringify(controls));
  await new Promise(resolve=>setTimeout(resolve,100));
  if(taskActionCalls!==before||!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-title'))&&Boolean(document.querySelector('.task-actions-menu'))`))throw new Error('Disabled task action was delivered');
  for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.task-row.selected small')?.textContent.endsWith(${JSON.stringify(status)})`);attempt++){if(attempt>50)throw new Error('Active history fixture did not refresh');await new Promise(resolve=>setTimeout(resolve,20));}
  await window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
  writeFileSync(path.join(output,`${width}-${theme}-task-actions-${status}.png`),(await window.webContents.capturePage()).toPNG());
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  for(let attempt=0;await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-actions-menu'))`);attempt++){if(attempt>50)throw new Error('Active menu did not close');await new Promise(resolve=>setTimeout(resolve,20));}
 }
 activeTaskFixture=undefined;window.webContents.send('workspace:overview-changed',overview);
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.task-toolbar small')?.textContent.endsWith(${JSON.stringify(source.status)})`);attempt++){if(attempt>50)throw new Error('Task fixture did not restore');await new Promise(resolve=>setTimeout(resolve,20));}
}
async function auditNativeCompaction(window,output,width,theme,nativeSummary){
 await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Review native compaction')).click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.task-title')?.value==='Review native compaction'&&document.querySelector('.task-activity summary')?.textContent==='Context compaction · completed'`);attempt++){if(attempt>50)throw new Error('Native compaction summary did not render');await new Promise(resolve=>setTimeout(resolve,20));}
 await window.webContents.executeJavaScript(`(()=>{const result=document.querySelector('.task-activity');result.open=true;result.scrollIntoView({block:'start'});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.auditCompactionCopy=text}}});result.querySelector('button').click()})()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`window.auditCompactionCopy===${JSON.stringify(nativeSummary)}&&document.querySelector('.task-activity pre')?.textContent===${JSON.stringify(nativeSummary)}&&!document.querySelector('.task-activity untrusted')&&Boolean(document.querySelector('.task-activity button[aria-label="Result copied"]'))`);attempt++){if(attempt>50)throw new Error('Compaction summary text or copy changed');await new Promise(resolve=>setTimeout(resolve,20));}
 await openTaskActions(window);
 if(!await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-actions-menu [role="menuitem"]')).some(item=>item.textContent==='Compact context'&&!item.hasAttribute('data-disabled'))`))throw new Error('Initialized OpenCode compact action missing');
 window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
 await new Promise(resolve=>setTimeout(resolve,100));await window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
 writeFileSync(path.join(output,`${width}-${theme}-native-compaction.png`),(await window.webContents.capturePage()).toPNG());
}
async function auditOpenAiCompaction(window,output,width,theme){
 await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Review OpenAI compaction')).click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.task-title')?.value==='Review OpenAI compaction'&&document.querySelector('.task-activity summary')?.textContent==='Context compaction · completed'`);attempt++){if(attempt>50)throw new Error('OpenAI compaction did not render');await new Promise(resolve=>setTimeout(resolve,20));}
 await window.webContents.executeJavaScript(`(()=>{document.querySelector('.task-activity').open=true;const input=document.querySelector('.task-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Keep native draft 世界');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 if(!await window.webContents.executeJavaScript(`document.querySelector('.compaction-status')?.textContent==='Native context compacted.'&&!document.querySelector('.task-activity pre')&&!document.querySelector('.task-activity button')&&getComputedStyle(document.querySelector('.compaction-status')).padding==='16px'`))throw new Error('Status-only compaction fabricated summary/copy controls or lost padding');
 await openTaskActions(window);
 await window.webContents.executeJavaScript(`(()=>{const action=Array.from(document.querySelectorAll('.task-actions-menu [role="menuitem"]')).find(item=>item.textContent==='Compact context');if(!action||action.hasAttribute('data-disabled'))throw Error('OpenAI compact action unavailable');action.click()})()`);
 for(let attempt=0;await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-actions-menu'))`);attempt++){if(attempt>50)throw new Error('Compact menu did not settle');await new Promise(resolve=>setTimeout(resolve,20));}
 if(!await window.webContents.executeJavaScript(`document.querySelector('.task-composer textarea').value==='Keep native draft 世界'&&!document.querySelector('[role="alert"]')`))throw new Error('Native compaction changed the draft or failed');
 await window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
 writeFileSync(path.join(output,`${width}-${theme}-openai-compaction.png`),(await window.webContents.capturePage()).toPNG());
}
async function auditClaudeCompaction(window,output,width,theme){
 await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Review Claude compaction')).click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.task-title')?.value==='Review Claude compaction'&&document.querySelectorAll('.task-activity').length===2`);attempt++){if(attempt>50)throw new Error('Claude compaction results did not render');await new Promise(resolve=>setTimeout(resolve,20));}
 const result=await window.webContents.executeJavaScript(`(()=>{const cards=Array.from(document.querySelectorAll('.task-activity'));for(const card of cards)card.open=true;const source=cards[0].querySelector('pre').textContent;const noOp=cards[1].querySelector('pre').textContent;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.auditClaudeCopy=text}}});cards[1].querySelector('button').click();cards[1].scrollIntoView({block:'nearest'});return {source,noOp,title:cards[1].querySelector('summary').textContent,inert:!cards[1].querySelector('untrusted'),label:cards[1].querySelector('.message-code-actions span').textContent}})()`);
 if(JSON.parse(result.source).trigger!=='auto'||result.noOp!=='Not enough messages to compact. <untrusted> 世界'||result.title!=='Compaction result · completed'||!result.inert||result.label!=='Compaction result')throw new Error('Claude metadata/no-op was changed or mislabelled');
 for(let attempt=0;!await window.webContents.executeJavaScript(`window.auditClaudeCopy==='Not enough messages to compact. <untrusted> 世界'&&Boolean(document.querySelector('.task-activity:last-of-type button[aria-label="Result copied"]'))`);attempt++){if(attempt>50)throw new Error('Claude native result copying failed');await new Promise(resolve=>setTimeout(resolve,20));}
 const metrics = await window.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.task-activity'),grid=card.querySelector('.compaction-metrics'),source=card.querySelector('.compaction-source'),rows=Array.from(grid.querySelectorAll('div')).map(row=>[row.querySelector('dt').textContent,row.querySelector('dd').textContent]);card.querySelector('button').click();return {rows,sourceClosed:!source.open,padding:getComputedStyle(grid).padding,raw:source.querySelector('pre').textContent,expectedBefore:new Intl.NumberFormat().format(1234)+' tokens'}})()`);
 if(!metrics.sourceClosed||metrics.padding!=='16px'||JSON.stringify(metrics.rows)!==JSON.stringify([['Before',metrics.expectedBefore],['After','234 tokens'],['Duration','80 ms']]))throw new Error('Compaction metrics are missing, fabricated or poorly spaced');
 for(let attempt=0;!await window.webContents.executeJavaScript(`window.auditClaudeCopy===${JSON.stringify(metrics.raw)}`);attempt++){if(attempt>50)throw new Error('Original compaction metadata copy changed');await new Promise(resolve=>setTimeout(resolve,20));}
 await openTaskActions(window);
 await window.webContents.executeJavaScript(`(()=>{const action=Array.from(document.querySelectorAll('.task-actions-menu [role="menuitem"]')).find(item=>item.textContent==='Compact context');if(!action||action.hasAttribute('data-disabled'))throw Error('Claude compact action unavailable');action.click()})()`);
 for(let attempt=0;await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-actions-menu'))`);attempt++){if(attempt>50)throw new Error('Claude compact action did not settle');await new Promise(resolve=>setTimeout(resolve,20));}
 await window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
 writeFileSync(path.join(output,`${width}-${theme}-claude-compaction.png`),(await window.webContents.capturePage()).toPNG());
}
async function auditPiCompaction(window,output,width,theme){
 await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Review Pi compaction')).click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.task-title')?.value==='Review Pi compaction'&&Boolean(document.querySelector('.task-activity'))`);attempt++){if(attempt>50)throw Error('Pi compaction fixture did not render');await new Promise(resolve=>setTimeout(resolve,20));}
 await window.webContents.executeJavaScript(`(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.auditPiCopy=text;}}});document.querySelector('.task-activity > summary').click()})()`);
 const layout=await window.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.task-activity'),summary=card.querySelector('.compaction-summary'),source=card.querySelector('.compaction-source');card.querySelector('.message-code-actions button').click();return {heading:summary.querySelector('h2')?.textContent,text:summary.textContent,inert:!summary.querySelector('untrusted'),padding:getComputedStyle(summary).padding,sourceClosed:!source.open,raw:source.querySelector('pre').textContent}})()`);
 if(layout.heading!=='Saved context'||!layout.text.includes('世界')||!layout.inert||layout.padding!=='16px'||!layout.sourceClosed)throw Error('Pi compaction summary must render readable, inert Markdown with collapsed original data');
 for(let attempt=0;!await window.webContents.executeJavaScript(`window.auditPiCopy===${JSON.stringify(layout.raw)}`);attempt++){if(attempt>50)throw Error('Pi original result copying changed');await new Promise(resolve=>setTimeout(resolve,20));}
 if(!await window.webContents.executeJavaScript(`document.querySelector('.task-activity').open`))throw Error('Copy collapsed an expanded activity');
 await window.webContents.executeJavaScript(`document.querySelector('.compaction-summary').scrollIntoView({block:'center'})`);
 await new Promise(resolve=>setTimeout(resolve,100));
 writeFileSync(path.join(output,`${width}-${theme}-pi-compaction.png`),(await window.webContents.capturePage()).toPNG());
 await window.webContents.executeJavaScript(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Owned clipboard failure')}}});document.querySelector('.task-activity button').click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.task-activity .message-code-actions').textContent.includes('Copy failed')`);attempt++){if(attempt>50)throw Error('Activity copy failure did not render');await new Promise(resolve=>setTimeout(resolve,20));}
 if(!await window.webContents.executeJavaScript(`document.querySelector('.task-activity').open&&!document.querySelector('.compaction-source').open`))throw Error('Copy failure changed disclosure state');
 writeFileSync(path.join(output,`${width}-${theme}-activity-copy-failure.png`),(await window.webContents.capturePage()).toPNG());
 await window.webContents.executeJavaScript(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.auditPiRetry=text;}}});document.querySelector('.task-activity button').click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`window.auditPiRetry===${JSON.stringify(layout.raw)}&&Boolean(document.querySelector('.task-activity button[aria-label="Result copied"]'))`);attempt++){if(attempt>50)throw Error('Activity copy retry failed');await new Promise(resolve=>setTimeout(resolve,20));}
 await new Promise(resolve=>setTimeout(resolve,2100));
 if(!await window.webContents.executeJavaScript(`document.querySelector('.task-activity').open&&!document.querySelector('.compaction-source').open&&!document.querySelector('.task-activity button[aria-label="Result copied"]')`))throw Error('Copy feedback expiry changed disclosure state');
 await window.webContents.executeJavaScript(`document.querySelector('.task-activity > summary').click();document.querySelector('.task-activity button').click()`);
 await new Promise(resolve=>setTimeout(resolve,100));
 if(await window.webContents.executeJavaScript(`document.querySelector('.task-activity').open`))throw Error('Copy reopened a collapsed activity');
 await openTaskActions(window);await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-actions-menu [role="menuitem"]')).find(item=>item.textContent==='Compact context').click()`);
}
const data = mkdtempSync(path.join(tmpdir(), "phaseo-design-audit-"));
app.setPath("userData", data);
mkdirSync(path.join(data, "workspace"));
const seed = new DatabaseSync(path.join(data, "workspace/workspace.sqlite"));
seed.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
const now = new Date().toISOString();
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-example", JSON.stringify({ id: "design-example", title: "Plan the product launch", harness: "phaseo", model: "default", mode: "chat", status: "completed", pinned: true, archived: false, queue: [], createdAt: now, updatedAt: now, messages: [{ id: "u", role: "user", text: "Help me plan the launch of our desktop workspace.", createdAt: now }, { id: "a", role: "assistant", text: "## Launch priorities\n\nStart with a clear promise: one workspace for your accounts, models, and everyday work.\n\n1. Validate the core task workflow with a small group.\n2. Prepare examples for research, writing, and coding.\n3. Gather feedback before expanding access.\n\nWe can turn these priorities into a weekly plan next.", createdAt: now }] }));
const nativeSummary="  Native summary\n<untrusted> remains literal 世界\n"+"Keep the original conversation in local history.\n".repeat(30);
seed.exec("CREATE TABLE agents (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
const codeExample = JSON.parse(seed.prepare("SELECT data FROM tasks WHERE id = ?").get("design-example").data);
const previewText='const greeting = "Hello, 世界";\n'+"// Attachment line with preserved indentation\n".repeat(80);
const previewId="12345678-1234-1234-1234-123456789012";
const previewAttachment={id:previewId,taskId:"design-example",name:"notes.ts",kind:"text",mimeType:"text/plain",size:Buffer.byteLength(previewText)};
seed.exec("CREATE TABLE attachments (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
seed.prepare("INSERT INTO attachments VALUES (?, ?)").run(previewId,JSON.stringify(previewAttachment));
mkdirSync(path.join(data,"workspace/attachments"));writeFileSync(path.join(data,"workspace/attachments",previewId),previewText);
codeExample.messages[0].attachments=[previewAttachment];
const fence = String.fromCharCode(96).repeat(3);
codeExample.messages[1].text += `\n\n${fence}ts\nconst greeting = "Hello, 世界";\n  console.log(greeting);\n${fence}`;
codeExample.activities = [{ id: "design-result", type: "tool", title: "Inspect project files", status: "completed", text: "  Résumé result\n<untrusted> remains text\n" + "Long result line\n".repeat(30) }];
seed.prepare("UPDATE tasks SET data = ? WHERE id = ?").run(JSON.stringify(codeExample), "design-example");
const progressSteps=Array.from({length:30},(_,index)=>({text:index===0?"<untrusted> literal step 世界":index===2?"Implement the requested workflow and preserve the website's components, typography and spacing":'Plan step '+index,status:index<2?'completed':index===2?'in_progress':index===3?'cancelled':'pending'}));
const progressText=JSON.stringify(progressSteps,null,2);
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-progress",JSON.stringify({...codeExample,id:"design-progress",title:"Review task progress",pinned:false,activities:[{id:"progress",type:"plan",title:"Plan",explanation:"Inspect the current flow, implement the change, and verify the result.",text:progressText,steps:progressSteps}]}));

seed.prepare("INSERT INTO agents VALUES (?, ?)").run("design-agent", JSON.stringify({ id: "design-agent", name: "Design fixture", executable: process.execPath, arguments: [path.resolve("scripts/fixtures/grok-interaction.cjs")] }));
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-compaction",JSON.stringify({...codeExample,id:"design-compaction",title:"Review native compaction",harness:"opencode",mode:"chat",pinned:false,nativeSessionId:"owned-native-session",messages:codeExample.messages.map(message=>({...message,attachments:undefined})),activities:[{id:"native-compaction",type:"compaction",title:"Context compaction",status:"completed",text:nativeSummary}]}));
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-openai-compaction",JSON.stringify({...codeExample,id:"design-openai-compaction",title:"Review OpenAI compaction",harness:"codex",mode:"chat",pinned:false,nativeSessionId:"owned-native-thread",messages:codeExample.messages.map(message=>({...message,attachments:undefined})),activities:[{id:"native-compact-item",type:"compaction",title:"Context compaction",status:"completed",text:""}]}));
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-claude-compaction",JSON.stringify({...codeExample,id:"design-claude-compaction",title:"Review Claude compaction",harness:"claude",mode:"chat",pinned:false,nativeSessionId:"owned-claude-session",messages:codeExample.messages.map(message=>({...message,attachments:undefined})),activities:[{id:"native-claude-boundary",type:"compaction",title:"Automatic context compaction",status:"completed",compaction:{beforeTokens:1234,afterTokens:234,durationMs:80},text:JSON.stringify({trigger:"auto",pre_tokens:1234,post_tokens:234,duration_ms:80},null,2)},{id:"native-claude-result",type:"compaction",title:"Compaction result",status:"completed",text:"Not enough messages to compact. <untrusted> 世界"}]}));
const piSummary="## Saved context\n\nKeep <untrusted> 世界 and the original files.";const piCompactionResult={summary:piSummary,firstKeptEntryId:"owned-entry",tokensBefore:1234,estimatedTokensAfter:234,details:{readFiles:["notes.txt"]}};
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-pi-compaction",JSON.stringify({...codeExample,id:"design-pi-compaction",title:"Review Pi compaction",harness:"pi",mode:"chat",pinned:false,nativeSessionId:"/owned/pi-session.jsonl",messages:codeExample.messages.map(message=>({...message,attachments:undefined})),activities:[{id:"native-pi-result",type:"compaction",title:"Context compaction",status:"completed",summary:piSummary,text:JSON.stringify(piCompactionResult,null,2)}]}));
const settingsTask = JSON.parse(seed.prepare("SELECT data FROM tasks WHERE id = ?").get("design-example").data);
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-settings", JSON.stringify({ ...settingsTask, id: "design-settings", title: "Review workspace plan", pinned: false, harness: "acp", agentId: "design-agent", mode: "plan", nativeModels: [{ id: "grok-fixture-b", name: "Fixture B", default: true, reasoningEfforts: [{ id: "high", description: "High" }, { id: "low", description: "Low" }], defaultReasoningEffort: "high" }], nativeModes: [{ id: "plan", name: "Plan", default: true }] }));
const grokSettings = JSON.parse(seed.prepare("SELECT data FROM tasks WHERE id = ?").get("design-settings").data);
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-grok-settings", JSON.stringify({ ...grokSettings, id: "design-grok-settings", title: "Review Grok reasoning", harness: "grok", agentId: undefined }));
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-queue", JSON.stringify({ ...settingsTask, id: "design-queue", title: "Review queued messages", pinned: false, harness: "phaseo", mode: "chat", queue: Array.from({length:12},(_,index)=>({id:"queued-"+index,text:"Queued instruction "+index+": "+"Long message content ".repeat(15),createdAt:now})) }));
seed.prepare("INSERT INTO tasks VALUES (?, ?)").run("design-requests", JSON.stringify({ ...codeExample, id: "design-requests", title: "Review agent requests", pinned: false, approvals: [{ id: "design-approval", method: "tool", description: "Inspect the requested files\n"+"Requested file detail\n".repeat(20) }], questions: [{id:"design-question",questions:[{id:"direction",header:"Direction",question:"Which approach should the agent take?",options:[{label:"Focused",description:"Apply the requested change."},{label:"Explore",description:"Compare approaches before implementing."}]}]}] }));
seed.exec("CREATE TABLE accounts (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
seed.prepare("INSERT INTO accounts VALUES (?, ?)").run("design-account", JSON.stringify({ id: "design-account", name: "Design account", harness: "phaseo", kind: "api", configured: false, endpoint: "https://example.invalid/v1" }));
const projectDirectory=path.join(data,"project");mkdirSync(projectDirectory);
const projectText='const greeting = "Hello, 世界";\nconsole.log(greeting);\n';
writeFileSync(path.join(projectDirectory,"example.ts"),'const greeting = "Hello";\n');
execFileSync("git",["init","-b","main"],{cwd:projectDirectory,stdio:"ignore"});
execFileSync("git",["config","core.autocrlf","false"],{cwd:projectDirectory});
execFileSync("git",["config","commit.gpgsign","false"],{cwd:projectDirectory});
execFileSync("git",["add","example.ts"],{cwd:projectDirectory});
execFileSync("git",["-c","user.name=Design Fixture","-c","user.email=fixture@example.invalid","commit","-m","Initial fixture"],{cwd:projectDirectory,stdio:"ignore"});
writeFileSync(path.join(projectDirectory,"example.ts"),projectText);
seed.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
seed.prepare("INSERT INTO projects VALUES (?, ?)").run("design-project",JSON.stringify({id:"design-project",name:"Design project",directory:projectDirectory,createdAt:now}));
codeExample.projectId="design-project";
codeExample.messages[1].text+='\n\nReview [example.ts:2:1](example.ts#L2C1).';
seed.prepare("UPDATE tasks SET data = ? WHERE id = ?").run(JSON.stringify(codeExample),"design-example");
seed.exec("CREATE TABLE terminals (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
for(let index=0;index<30;index++)seed.prepare("INSERT INTO terminals VALUES (?, ?)").run("design-terminal-"+index,JSON.stringify({id:"design-terminal-"+index,title:"Saved terminal "+index,cwd:projectDirectory,status:"exited",exitCode:0,createdAt:now,updatedAt:now,output:"Phaseo saved terminal\r\n"+"Owned transcript line\r\n".repeat(20)}));
seed.close();
const packagedEntry = process.argv.find(argument => argument.startsWith("--app-entry="))?.slice("--app-entry=".length);
await import(packagedEntry ? pathToFileURL(path.resolve(packagedEntry)).href : "../dist/main/index.mjs");
app.whenReady().then(async () => {
const window = BrowserWindow.getAllWindows()[0];
if (window.webContents.isLoading()) await new Promise(resolve => window.webContents.once("did-finish-load", resolve));
let editorCalls=[],pendingEditor;
ipcMain.removeHandler("workspace:editors");
ipcMain.handle("workspace:editors",()=>[{id:"vscode",name:"VS Code",available:true},{id:"cursor",name:"Cursor",available:true},{id:"zed",name:"Zed",available:false}]);
ipcMain.removeHandler("workspace:open-project");
ipcMain.handle("workspace:open-project",async(_event,id,request)=>{editorCalls.push({id,...request});await new Promise((resolve,reject)=>{pendingEditor={resolve,reject};});});
const installationFixture=[{harness:"codex",installed:true},{harness:"claude",installed:true},{harness:"opencode",installed:true,version:"2.0.22"},{harness:"pi",installed:false,error:"Owned unavailable installation: <untrusted> 世界"},{harness:"cursor",installed:true,version:"SDK 1.0.31"},{harness:"grok",installed:true}];
let installationCalls=0,holdInstallations=false,failInstallations=false,emptyInstallations=false,releaseInstallations;
ipcMain.removeHandler("workspace:installations");
ipcMain.handle("workspace:installations",async()=>{installationCalls++;if(holdInstallations)await new Promise(resolve=>{releaseInstallations=resolve;});if(failInstallations){failInstallations=false;throw Error("Owned installation discovery failure");}return emptyInstallations?[]:installationFixture;});
const originalAttachment=ipcMain._invokeHandlers.get("workspace:attachment");
let failAttachment=false,holdAttachment=false,releaseAttachment;
ipcMain.removeHandler("workspace:attachment");
ipcMain.handle("workspace:attachment",async(event,taskId,id)=>{
  if(id===previewId){if(holdAttachment)await new Promise(resolve=>{releaseAttachment=resolve;});if(failAttachment){failAttachment=false;throw new Error("Owned attachment failure");}}
  return originalAttachment(event,taskId,id);
});
const originalOverview=ipcMain._invokeHandlers.get("workspace:overview");
let holdOverview=false,failOverview=false,releaseOverview,heldOverview;
ipcMain.removeHandler("workspace:overview");
ipcMain.handle("workspace:overview",async event=>{
  const value=await originalOverview(event);
  if(holdOverview){heldOverview=value;await new Promise(resolve=>{releaseOverview=resolve;});}
  if(failOverview){failOverview=false;throw new Error("Owned command search failure");}
  return value;
});
const originalAccountStatus=ipcMain._invokeHandlers.get("workspace:account-status");
ipcMain.removeHandler("workspace:account-status");
ipcMain.handle("workspace:account-status",(event,harness,id)=>harness==="codex"&&!id?{checkedAt:now,authenticated:true,identity:"fixture@example.invalid",plan:"Fixture subscription",ordinaryUsageAllowed:false,usage:[{id:"fixture",name:"Included usage",spendControlReached:false,primary:{usedPercent:25,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+3600},secondary:{usedPercent:80,windowDurationMins:10080,resetsAt:null}},{id:"unavailable",name:"Other usage",spendControlReached:null,primary:null,secondary:null}]}:originalAccountStatus(event,harness,id));
const originalModels=ipcMain._invokeHandlers.get("workspace:models");
ipcMain.removeHandler("workspace:models");
let failModels=false,holdModels=false,releaseModels,modelCalls=0;
ipcMain.handle("workspace:models",async(event,harness,...args)=>{
 if(!["codex","grok"].includes(harness))return originalModels(event,harness,...args);
 modelCalls++;if(failModels){failModels=false;throw Error("Owned model catalogue failure");}
 if(holdModels){holdModels=false;await new Promise(resolve=>{releaseModels=resolve});}
 return [{id:"fixture-model",name:"Fixture model",default:true,defaultReasoningEffort:"fixture-low",reasoningEfforts:[{id:"fixture-high",description:"High"},{id:"fixture-low",description:"Low"}]}];
});
const originalTask=ipcMain._invokeHandlers.get("workspace:task");
ipcMain.removeHandler("workspace:task");
ipcMain.handle("workspace:task",async(event,id)=>{const task=await originalTask(event,id);return activeTaskFixture?.id===id?{...task,status:activeTaskFixture.status}:task;});
const originalTaskHistory=ipcMain._invokeHandlers.get("workspace:task-history");
ipcMain.removeHandler("workspace:task-history");
ipcMain.handle("workspace:task-history",async(event,query)=>{const page=await originalTaskHistory(event,query);return activeTaskFixture?{...page,tasks:page.tasks.map(task=>task.id===activeTaskFixture.id?{...task,status:activeTaskFixture.status}:task)}:page;});
const originalPreferences=ipcMain._invokeHandlers.get("workspace:preferences");
const originalPullRequests=ipcMain._invokeHandlers.get('workspace:pull-requests');ipcMain.removeHandler('workspace:pull-requests');
ipcMain.handle('workspace:pull-requests',async(event,id)=>{if(id!=='design-project')return originalPullRequests(event,id);proposalCalls++;if(holdProposals)await new Promise((resolve,reject)=>{pendingProposals={resolve,reject};});return {...proposalFixture,requests:emptyProposals?[]:proposalFixture.requests};});
const originalOpenLink=ipcMain._invokeHandlers.get('workspace:open-link');ipcMain.removeHandler('workspace:open-link');
ipcMain.handle('workspace:open-link',async(event,url)=>{if(proposalFixture.requests.some(request=>request.url===url)){proposalLinks.push(url);if(failProposalLink)throw Error('Owned pull-request link failure');return;}return originalOpenLink(event,url);});
ipcMain.removeHandler("workspace:preferences");
ipcMain.handle("workspace:preferences",async(event)=>{settingsReadCalls++;if(holdSettingsRead)await new Promise((resolve,reject)=>{pendingSettingsRead={resolve,reject};});return originalPreferences(event);});
const originalSavePreferences=ipcMain._invokeHandlers.get("workspace:save-preferences");
ipcMain.removeHandler("workspace:save-preferences");
ipcMain.handle("workspace:save-preferences",async(event,value)=>{settingsSaveCalls++;if(holdSettingsSave)await new Promise((resolve,reject)=>{pendingSettingsSave={resolve,reject};});return originalSavePreferences(event,value);});
const originalMcp=ipcMain._invokeHandlers.get("workspace:mcp");
ipcMain.removeHandler("workspace:mcp");
ipcMain.handle("workspace:mcp",async(event,command)=>{if(holdConnectionSave){connectionSaveCalls++;await new Promise((resolve,reject)=>{pendingConnectionSave={resolve,reject};});}return originalMcp(event,command);});
const originalCommand=ipcMain._invokeHandlers.get("workspace:command");
let pendingRequest,requestCalls=0,holdCreation=false,pendingCreation,creationCalls=0,holdCompact=false,pendingCompact,compactCalls=0,nativeCompactCalls=0,claudeCompactCalls=0,piCompactCalls=0;
ipcMain.removeHandler("workspace:command");
ipcMain.handle("workspace:command",async(event,command)=>{
  if(holdConnectionSave&&command.type==="update-agent"&&command.id==="design-agent"){connectionSaveCalls++;await new Promise((resolve,reject)=>{pendingConnectionSave={resolve,reject};});}
  if(["design-compaction","design-openai-compaction","design-claude-compaction","design-pi-compaction"].includes(command.id)&&command.type==="send"){
    if(command.text!=="/compact"||command.attachments?.length)throw new Error("Invalid native compaction delivery");
    if(command.id==="design-pi-compaction"){piCompactCalls++;return originalOverview(event);}
    if(command.id==="design-claude-compaction"){claudeCompactCalls++;return originalOverview(event);}
    if(command.id==="design-openai-compaction"){nativeCompactCalls++;return originalOverview(event);}
    compactCalls++;if(holdCompact)await new Promise((resolve,reject)=>{pendingCompact={resolve,reject};});
    return originalOverview(event);
  }
  if(holdCreation && ["create-task","handoff"].includes(command.type)){creationCalls++;await new Promise((resolve,reject)=>{pendingCreation={resolve,reject};});}
  if(command.id==="design-requests" && ["approval","answer"].includes(command.type)){requestCalls++;await new Promise((resolve,reject)=>{pendingRequest=reject;});}
  if(command.type==="fork"||command.type==="handoff"||(command.type==="update-task"&&command.archived!==undefined))taskActionCalls++;
  return originalCommand(event,command);
});
const output = path.resolve("../../output/playwright/design-audit", packagedEntry ? "packaged-after" : process.argv.includes("--before") ? "before" : "after");
mkdirSync(output, { recursive: true });
try {
  await window.webContents.executeJavaScript(`Promise.all([400,600,700].map(weight=>document.fonts.load(weight+' 14px Montserrat'))).then(()=>true)`);
  await new Promise(resolve => setTimeout(resolve, 500));
  for (const [width, height] of [[1440, 920], [1040, 680]]) {
    window.setSize(width, height);
    for (const theme of ["light", "dark"]) {
      await window.webContents.executeJavaScript(`(()=>{const desired=${JSON.stringify(theme)};if(document.documentElement.dataset.theme!==desired)document.querySelector('[aria-label="Use '+desired+' theme"]').click()})()`);
      await new Promise(resolve => setTimeout(resolve, 100));
      for (const page of ["Home", "Tasks", "Accounts", "Projects", "Missions", "Agents", "MCP", "Settings", "Inbox", "Proposals", "Terminals"]) {
        if(page==='Settings')holdSettingsRead=true;
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
          if (ready && (page !== "Tasks" || await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-row'))`))) break;
          if (attempt > 50) throw new Error(`Page did not render: ${page}`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        if(page==="Agents")for(let attempt=0;await window.webContents.executeJavaScript(`document.querySelector('.native-harness-panel').getAttribute('aria-busy')==='true'`);attempt++){if(attempt>50)throw Error("Installation discovery did not settle");await new Promise(resolve=>setTimeout(resolve,20));}
        await new Promise(resolve => setTimeout(resolve, 100));
        const image = await window.webContents.capturePage();
        const name = `${width}-${theme}-${page.toLowerCase()}`;
        writeFileSync(path.join(output, `${name}.png`), image.toPNG());
        if(page==='Settings')await auditSettingsRecovery(window,output,width,theme);
        if(page==='Proposals')await auditProposals(window,output,width,theme);
        const measurements = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('h1,h2,h3,label,.page,.panel,.task-setup,.account-row,.task-toolbar')).map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,class:e.className,text:e.textContent.slice(0,80),font:s.fontSize,padding:s.padding,width:r.width,height:r.height,x:r.x,y:r.y}})`);
        writeFileSync(path.join(output, `${name}.json`), JSON.stringify(measurements, null, 2));
        const shellFocus = await window.webContents.executeJavaScript(`(()=>{const button=document.querySelector('.command-button');button.focus();return {outline:getComputedStyle(button).outlineColor,ring:getComputedStyle(document.documentElement).getPropertyValue('--ring').trim()}})()`);
        if(!shellFocus.outline.startsWith('oklch('))throw new Error("Shell focus must use the web theme ring.");
        if(page==="Home"&&!await window.webContents.executeJavaScript(`!document.querySelector('.activity-panel')&&document.querySelector('.recent-panel').getBoundingClientRect().top>document.querySelector('.attention-panel').getBoundingClientRect().bottom`))throw new Error("Idle home must show recent work directly after attention.");
        if(page==="Home"){
          const idleOverview=await window.webContents.executeJavaScript('window.phaseoDesktop.workspace.overview()');
          window.webContents.send("workspace:overview-changed",{...idleOverview,tasks:idleOverview.tasks.map((task,index)=>index===0?{...task,status:"running"}:task)});
          for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.activity-panel .home-task-row'))`);attempt++){if(attempt>50)throw new Error("Running tasks were hidden on home.");await new Promise(resolve=>setTimeout(resolve,20));}
          window.webContents.send("workspace:overview-changed",idleOverview);
          for(let attempt=0;await window.webContents.executeJavaScript(`Boolean(document.querySelector('.activity-panel'))`);attempt++){if(attempt>50)throw new Error("Idle home did not recover its compact layout.");await new Promise(resolve=>setTimeout(resolve,20));}
        }
        const cardLayout = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.panel')).map(panel=>({radius:getComputedStyle(panel).borderRadius,headers:Array.from(panel.querySelectorAll('.panel-heading')).map(heading=>({padding:getComputedStyle(heading).padding,border:getComputedStyle(heading).borderBottomWidth})),headings:Array.from(panel.querySelectorAll('.panel-heading h2')).map(heading=>getComputedStyle(heading).margin)}))`);
        if(cardLayout.some(card=>card.radius!=="24px"||card.headers.some(header=>header.padding!=="20px 20px 0px"||header.border!=="0px")||card.headings.some(margin=>margin!=="0px")))throw new Error("Panel shape or heading spacing differs from the web card treatment.");
        const selectLayout = await window.webContents.executeJavaScript(`(()=>{const controls=Array.from(document.querySelectorAll('.page select,.task-workspace select,.terminal-workspace select'));return {scheme:getComputedStyle(document.documentElement).colorScheme,identity:document.querySelector('.workspace-identity')?.tagName,controls:controls.map(e=>{const s=getComputedStyle(e);return {appearance:s.appearance,padding:parseFloat(s.paddingRight),arrow:s.backgroundImage!=='none',font:s.fontFamily}})}})()`);
        if(selectLayout.scheme!==theme||selectLayout.identity!=="DIV"||selectLayout.controls.some(control=>control.appearance!=="none"||control.padding<34||!control.arrow||!control.font.includes("Montserrat")))throw new Error("Select controls diverge from the website treatment: "+JSON.stringify(selectLayout));
        if(page==="Tasks"){
          await window.webContents.executeJavaScript(`(()=>{const select=Array.from(document.querySelectorAll('.task-create-fields label')).find(label=>label.textContent.startsWith('Harness')).querySelector('select');select.value='grok';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
          for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('select[aria-label="Initial reasoning effort"] option[value="fixture-high"]'))`);attempt++){if(attempt>50)throw Error('Grok initial reasoning did not render');await new Promise(resolve=>setTimeout(resolve,20));}
          if(!await window.webContents.executeJavaScript(`(()=>{const mode=Array.from(document.querySelectorAll('.task-create-fields label')).find(label=>label.textContent.startsWith('Mode')).querySelector('select');return mode.value==='plan'&&!mode.querySelector('option[value="chat"]')})()`))throw Error('Grok setup must exclude Chat and switch to Plan');
          await window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('select[aria-label="Initial reasoning effort"]');select.value='fixture-high';select.dispatchEvent(new Event('change',{bubbles:true}));select.scrollIntoView({block:'nearest'});})()`);
          await window.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          writeFileSync(path.join(output,width+'-'+theme+'-grok-initial-settings.png'),(await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`(()=>{const select=Array.from(document.querySelectorAll('.task-create-fields label')).find(label=>label.textContent.startsWith('Harness')).querySelector('select');select.value='codex';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          if(!await window.webContents.executeJavaScript(`document.querySelector('select[aria-label="Initial reasoning effort"]').value===''`))throw Error('Changing harness must clear prior effort');
        }
        if(page==="Terminals"){
          for(let attempt=0;;attempt++){if(await window.webContents.executeJavaScript(`document.querySelectorAll('.terminal-sessions .task-row').length===30`))break;if(attempt>50)throw new Error("Terminal session fixture did not render.");await new Promise(resolve=>setTimeout(resolve,100));}
          await window.webContents.executeJavaScript(`document.querySelector('.terminal-sessions .task-row').click()`);
          for(let attempt=0;;attempt++){if(await window.webContents.executeJavaScript(`Boolean(document.querySelector('.terminal-emulator .xterm-screen'))`))break;if(attempt>50)throw new Error("Saved terminal did not render.");await new Promise(resolve=>setTimeout(resolve,100));}
          await window.webContents.executeJavaScript(`document.querySelector('.terminal-sessions').scrollTop=10000`);
          const terminalLayout=await window.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.terminal-sessions'),row=list.querySelector('.selected'),create=document.querySelector('.terminal-list > button'),r=create.getBoundingClientRect();return {scrollable:list.scrollHeight>list.clientHeight,scrolled:list.scrollTop>0,createVisible:r.top>=0&&r.bottom<=innerHeight,direction:getComputedStyle(row).flexDirection,selected:row.getAttribute('aria-pressed'),height:document.querySelector('.terminal-emulator').clientHeight}})()`);
          if(!terminalLayout.scrollable||!terminalLayout.scrolled||!terminalLayout.createVisible||terminalLayout.direction!=="column"||terminalLayout.selected!=="true"||terminalLayout.height<200)throw new Error("Terminal layout must retain controls and usable output space.");
          await window.webContents.executeJavaScript(`document.querySelector('.terminal-sessions').scrollTop=0`);
          await new Promise(resolve=>setTimeout(resolve,100));
          writeFileSync(path.join(output,`${width}-${theme}-terminal-transcript.png`),(await window.webContents.capturePage()).toPNG());
        }
        if(page==="Projects"){
          await window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('select[aria-label="Project"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'design-project');select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
          for(let attempt=0;;attempt++){
            if(await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.project-browser aside button')).some(button=>button.textContent.includes('example.ts'))`))break;
            if(attempt>50)throw new Error("Project file list did not render.");
            await new Promise(resolve=>setTimeout(resolve,100));
          }
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.project-browser aside button')).find(button=>button.textContent.includes('example.ts')).click()`);
          for(let attempt=0;;attempt++){
            if(await window.webContents.executeJavaScript(`new Set(Array.from(document.querySelectorAll('.project-browser .code-token')).map(token=>getComputedStyle(token).color)).size>1`))break;
            if(attempt>50)throw new Error("Project syntax highlighting did not load offline.");
            await new Promise(resolve=>setTimeout(resolve,100));
          }
          await window.webContents.executeJavaScript(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.auditCopiedProject=text;}}});document.querySelector('.project-browser button[aria-label="Copy code"]').click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          if(!await window.webContents.executeJavaScript(`window.auditCopiedProject===${JSON.stringify(projectText)}`))throw new Error("File preview copying changed source formatting.");
          const previewSpacing=await window.webContents.executeJavaScript(`(()=>{const pre=document.querySelector('.project-browser pre'),toolbar=document.querySelector('.project-browser > section > .project-toolbar'),aside=document.querySelector('.project-browser > aside');return {padding:getComputedStyle(pre).padding,font:getComputedStyle(pre).fontSize,radius:getComputedStyle(pre).borderRadius,aside:getComputedStyle(aside).padding,alignment:getComputedStyle(toolbar).justifyContent,fits:document.querySelector('.project-browser').getBoundingClientRect().bottom<=innerHeight-24}})()`);
          if(previewSpacing.padding!=="16px"||previewSpacing.font!=="13px"||previewSpacing.radius!=="0px"||previewSpacing.aside!=="16px"||previewSpacing.alignment!=="space-between"||!previewSpacing.fits)throw new Error("Project preview does not use consistent code and navigation spacing.");
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.project-preview-actions button')).find(button=>button.textContent==='Edit').click()`);
          await new Promise(resolve=>setTimeout(resolve,50));
          if(!await window.webContents.executeJavaScript(`(()=>{const editor=document.querySelector('.project-editor'),pane=document.querySelector('.project-browser > section');return editor.getBoundingClientRect().bottom<=pane.getBoundingClientRect().bottom-23&&editor.clientHeight>=100})()`))throw new Error("File editing does not fit its project pane.");
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.project-browser > section button')).find(button=>button.textContent==='Discard').click()`);
          await new Promise(resolve=>setTimeout(resolve,50));
          editorCalls=[];
          await window.webContents.executeJavaScript(`document.querySelector('select[aria-label="External editor"]').value='cursor';document.querySelector('select[aria-label="External editor"]').dispatchEvent(new Event('change',{bubbles:true}))`);
          await new Promise(resolve=>setTimeout(resolve,50));
          await window.webContents.executeJavaScript(`(()=>{const button=Array.from(document.querySelectorAll('.project-preview-actions button')).find(button=>button.textContent==='Open in Cursor');button.click();button.click()})()`);
          await new Promise(resolve=>setTimeout(resolve,50));
          if(editorCalls.length!==1||editorCalls[0].id!=="design-project"||editorCalls[0].editor!=="cursor"||editorCalls[0].filename!=="example.ts"||!await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.project-preview-actions button')).every(button=>button.disabled)`))throw new Error("Editor selection or duplicate-open protection failed.");
          pendingEditor.reject(new Error("Owned editor failure"));
          await new Promise(resolve=>setTimeout(resolve,100));
          if(!await window.webContents.executeJavaScript(`document.querySelector('[role="alert"]').textContent==='Owned editor failure'`))throw new Error("Editor failure feedback is missing.");
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.project-preview-actions button')).find(button=>button.textContent==='Open in Cursor').click()`);
          await new Promise(resolve=>setTimeout(resolve,50));pendingEditor.resolve();
          await new Promise(resolve=>setTimeout(resolve,100));
          if(editorCalls.length!==2||!await window.webContents.executeJavaScript(`localStorage.getItem('phaseo.desktop.editor')==='"cursor"'&&!document.querySelector('[role="alert"]')`))throw new Error("Editor retry or preference persistence failed.");
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.project-editor-actions button')).find(button=>button.textContent==='Open project').click()`);
          await new Promise(resolve=>setTimeout(resolve,50));
          if(editorCalls.at(-1).filename!==undefined||editorCalls.at(-1).editor!=="cursor")throw new Error("Project editor action sent an incorrect target.");
          pendingEditor.resolve();await new Promise(resolve=>setTimeout(resolve,50));
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.project-preview-actions button')).find(button=>button.textContent==='Reveal file').click()`);
          await new Promise(resolve=>setTimeout(resolve,50));
          if(editorCalls.at(-1).filename!=="example.ts"||editorCalls.at(-1).editor!=="file-manager")throw new Error("File reveal action sent an incorrect target.");
          pendingEditor.resolve();await new Promise(resolve=>setTimeout(resolve,50));

          writeFileSync(path.join(output,`${width}-${theme}-project-preview.png`),(await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.project-toolbar button')).find(button=>button.textContent==='Git review').click()`);
          for(let attempt=0;;attempt++){
            if(await window.webContents.executeJavaScript(`(()=>{const root=document.querySelector('.project-review diffs-container')?.shadowRoot;return root&&new Set(Array.from(root.querySelectorAll('code span[style]')).map(token=>getComputedStyle(token).color)).size>1})()`))break;
            if(attempt>50)throw new Error("Git diff highlighting did not load offline.");
            await new Promise(resolve=>setTimeout(resolve,100));
          }
          await window.webContents.executeJavaScript(`document.querySelector('.project-review button[aria-label="Copy code"]').click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          const reviewLayout=await window.webContents.executeJavaScript(`(async()=>{const row=document.querySelector('.git-file-list .project-toolbar'),id=document.querySelector('select[aria-label="Project"]').value;return {padding:getComputedStyle(row).padding,copy:window.auditCopiedProject===(await window.phaseoDesktop.workspace.gitReview(id)).diff,stage:Array.from(row.querySelectorAll('button')).some(button=>button.textContent==='Stage')}})()`);
          if(reviewLayout.padding!=="16px 24px"||!reviewLayout.copy||!reviewLayout.stage)throw new Error("Git review row spacing or copying is inconsistent.");
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.git-file-list button')).find(button=>button.textContent==='Open file').click()`);
          await new Promise(resolve=>setTimeout(resolve,50));
          if(editorCalls.at(-1).filename!=="example.ts"||editorCalls.at(-1).editor!=="cursor")throw new Error("Git file editor action sent an incorrect target.");
          pendingEditor.resolve();await new Promise(resolve=>setTimeout(resolve,50));

          await window.webContents.executeJavaScript(`document.querySelector('.project-review .review-diff').scrollIntoView({block:'nearest'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          writeFileSync(path.join(output,`${width}-${theme}-git-review.png`),(await window.webContents.capturePage()).toPNG());
          const worktreeLayout = await window.webContents.executeJavaScript(`(()=>{const disclosure=document.querySelector('.project-worktree');if(!disclosure||disclosure.open)throw Error('Worktree disclosure must start closed');disclosure.querySelector('summary').click();disclosure.scrollIntoView({block:'nearest'});const form=disclosure.querySelector('form');return {visible:form.getBoundingClientRect().height>0,gap:getComputedStyle(form).marginTop}})()`);
          if (!worktreeLayout.visible || worktreeLayout.gap !== '16px') throw new Error('Worktree disclosure layout failed: '+JSON.stringify(worktreeLayout));
          await new Promise(resolve => setTimeout(resolve, 100));
          await window.webContents.executeJavaScript(`document.querySelector('.project-worktree').scrollIntoView({block:'end'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          writeFileSync(path.join(output,`${width}-${theme}-worktree-form.png`),(await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`document.querySelector('.project-worktree summary').click()`);
        }
        if (page === "Agents") {
          const nativeRows=await window.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.harness-list');return {count:list.children.length,padding:getComputedStyle(list).padding,columns:getComputedStyle(list).gridTemplateColumns.split(' ').length,text:list.textContent}})()`);
          if(nativeRows.count!==6||nativeRows.padding!=='20px'||nativeRows.columns!==2||!nativeRows.text.includes('Unavailable')||!nativeRows.text.includes('SDK 1.0.31'))throw Error('Native installation rows are missing or poorly spaced');
          const callsBefore=installationCalls;holdInstallations=true;
          await window.webContents.executeJavaScript(`(()=>{const button=document.querySelector('.native-harness-panel button');button.click();button.click()})()`);
          for(let attempt=0;!releaseInstallations;attempt++){if(attempt>50)throw Error('Installation request did not start');await new Promise(resolve=>setTimeout(resolve,20));}
          if(installationCalls!==callsBefore+1||!await window.webContents.executeJavaScript(`document.querySelector('.native-harness-panel button').disabled&&document.querySelector('.native-harness-panel [role="status"]').textContent==='Checking native installations…'&&document.querySelectorAll('.harness-list li').length===6`))throw Error('Duplicate installation request or missing retained results');
          writeFileSync(path.join(output,`${width}-${theme}-harness-pending.png`),(await window.webContents.capturePage()).toPNG());
          failInstallations=true;holdInstallations=false;releaseInstallations();releaseInstallations=undefined;
          for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.native-harness-panel [role="alert"]'))`);attempt++){if(attempt>50)throw Error('Installation failure did not render');await new Promise(resolve=>setTimeout(resolve,20));}
          if(!await window.webContents.executeJavaScript(`document.querySelector('.native-harness-panel [role="alert"]').textContent==='Owned installation discovery failure'&&document.querySelector('.native-harness-panel button').textContent==='Retry'&&document.querySelectorAll('.harness-list li').length===6`))throw Error('Installation retry or error copy is incorrect');
          writeFileSync(path.join(output,`${width}-${theme}-harness-failure.png`),(await window.webContents.capturePage()).toPNG());
          emptyInstallations=true;await window.webContents.executeJavaScript(`document.querySelector('.native-harness-panel button').click()`);
          for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.native-harness-panel').textContent.includes('No native harnesses found.')`);attempt++){if(attempt>50)throw Error('Installation empty result did not render');await new Promise(resolve=>setTimeout(resolve,20));}
          if(await window.webContents.executeJavaScript(`Boolean(document.querySelector('.native-harness-panel [role="alert"]'))`))throw Error('Successful retry retained stale installation error');
          writeFileSync(path.join(output,`${width}-${theme}-harness-empty.png`),(await window.webContents.capturePage()).toPNG());
          emptyInstallations=false;await window.webContents.executeJavaScript(`document.querySelector('.native-harness-panel button').click()`);
          for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelectorAll('.harness-list li').length===6&&!document.querySelector('.native-harness-panel button').disabled`);attempt++){if(attempt>50)throw Error('Installation refresh did not recover');await new Promise(resolve=>setTimeout(resolve,20));}
          await window.webContents.executeJavaScript(`document.querySelector('.harness-list details summary').click()`);
          if(!await window.webContents.executeJavaScript(`(()=>{const details=document.querySelector('.harness-list details');return details.open&&details.querySelector('p').textContent==='Owned unavailable installation: <untrusted> 世界'&&!details.querySelector('untrusted')})()`))throw Error('Installation details must retain inert native text');
          await window.webContents.executeJavaScript(`document.querySelector('.harness-list details summary').click()`);

          const command = await window.webContents.executeJavaScript(`(()=>{const details=document.querySelector('.agent-command');const text=details?.querySelector('code')?.textContent;details?.querySelector('summary')?.click();return {text,open:details?.open}})()`);
          if (!command.open || !command.text.includes("grok-interaction.cjs")) throw new Error("The full agent command must remain available.");
          writeFileSync(path.join(output, `${width}-${theme}-agent-command.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('article button')).find(button=>button.textContent==='Edit').click();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          const actions = await window.webContents.executeJavaScript(`(()=>{const row=document.querySelector('form[aria-label="Agent connection"] .account-form-actions');return {gap:row&&getComputedStyle(row).gap,count:row?.querySelectorAll('button').length}})()`);
          if (actions.gap !== "8px" || actions.count !== 2) throw new Error("Agent editor actions need consistent spacing.");
          await auditArgumentFields(window,"Agent connection");
          writeFileSync(path.join(output, `${width}-${theme}-agent-editor.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('form[aria-label="Agent connection"] button')).find(button=>button.textContent==='Cancel').click()`);
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('article button')).find(button=>button.textContent==='Edit').click();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          if(!await window.webContents.executeJavaScript(`document.activeElement===document.querySelector('form[aria-label="Agent connection"] input')`))throw Error("Editing an agent must focus its name field");
          await auditConnectionEditor(window,output,width,theme,"agent");
          await auditEditorSelection(window,output,width,theme,"agent");
        }
        if (page === "Missions") {
          const actions = await window.webContents.executeJavaScript(`(()=>{const row=document.querySelector('form[aria-label="Mission configuration"] .account-form-actions');return {gap:row&&getComputedStyle(row).gap,column:row&&getComputedStyle(row).gridColumn,count:row?.querySelectorAll('button').length}})()`);
          if (actions.gap !== "8px" || actions.column !== "1 / -1" || actions.count !== 1) throw new Error("Mission form actions need their own spaced row.");
        }
        if (page === "MCP") {
          const actions = await window.webContents.executeJavaScript(`(()=>{const row=document.querySelector('form[aria-label="MCP connection"] .account-form-actions');return {gap:row&&getComputedStyle(row).gap,column:row&&getComputedStyle(row).gridColumn,count:row?.querySelectorAll('button').length}})()`);
          if (actions.gap !== "8px" || actions.column !== "1 / -1" || actions.count !== 1) throw new Error("MCP form actions need their own spaced row.");
          await auditArgumentFields(window,"MCP connection");
          writeFileSync(path.join(output, `${width}-${theme}-mcp-arguments.png`), (await window.webContents.capturePage()).toPNG());
          await auditConnectionEditor(window,output,width,theme,"mcp");
          await auditEditorSelection(window,output,width,theme,"mcp");
        }
        if (page === "Accounts") {
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.accounts-page article')).find(article=>article.textContent.includes('Codex local login')).querySelector('button').click()`);
          for(let attempt=0;;attempt++){if(await window.webContents.executeJavaScript(`document.querySelectorAll('.account-status progress').length===2`))break;if(attempt>50)throw new Error("Account usage fixture did not render.");await new Promise(resolve=>setTimeout(resolve,100));}
          const usageLayout=await window.webContents.executeJavaScript(`(()=>{const status=document.querySelector('.account-status');return {meters:Array.from(status.querySelectorAll('progress')).map(meter=>({value:meter.value,width:meter.clientWidth,parent:meter.parentElement.clientWidth})),blocked:status.textContent.includes('Included usage is blocked.'),unknown:status.textContent.includes('Primary window: unavailable'),weekly:status.textContent.includes('7 days')}})()`);
          if(usageLayout.meters[0].value!==75||usageLayout.meters[1].value!==20||usageLayout.meters.some(meter=>meter.width!==meter.parent)||!usageLayout.blocked||!usageLayout.unknown||!usageLayout.weekly)throw new Error("Account usage values or layout are inconsistent.");
          await window.webContents.executeJavaScript(`document.querySelector('.account-status').scrollIntoView({block:'nearest'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          writeFileSync(path.join(output,`${width}-${theme}-account-usage.png`),(await window.webContents.capturePage()).toPNG());

          const layout = await window.webContents.executeJavaScript(`(()=>{const form=document.querySelector('form[aria-label="Add account"]'),row=form?.querySelector('.account-form-actions'),rect=form?.getBoundingClientRect();return {border:form&&getComputedStyle(form).borderTopWidth,column:row&&getComputedStyle(row).gridColumn,overflow:Array.from(form?.querySelectorAll('input,select')??[]).some(field=>{const r=field.getBoundingClientRect();return r.left<rect.left||r.right>rect.right;})}})()`);
          if(layout.border!=="0px" || layout.column!=="1 / -1" || layout.overflow) throw new Error("Account fields and actions must fit the panel without duplicate separators.");
          await window.webContents.executeJavaScript(`document.querySelector('form[aria-label="Add account"]').scrollIntoView({block:'nearest'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          writeFileSync(path.join(output, `${width}-${theme}-add-account.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('article')).find(row=>row.textContent.includes('Design account')).querySelectorAll('button')[0].click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          const editorLayout = await window.webContents.executeJavaScript(`(()=>{const form=document.querySelector('form[aria-label="Edit account"]');return {padding:form&&getComputedStyle(form).padding,key:form?.querySelector('input[type="password"]')?.value}})()`);
          if(editorLayout.padding!=="20px" || editorLayout.key!=="") throw new Error("Account editor spacing or empty-key state is inconsistent.");
          await window.webContents.executeJavaScript(`document.querySelector('form[aria-label="Edit account"]').scrollIntoView({block:'nearest'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          writeFileSync(path.join(output, `${width}-${theme}-account-editor.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`Array.from(document.querySelector('form[aria-label="Edit account"]').querySelectorAll('button')).find(button=>button.textContent==='Cancel').click()`);
        }
        if (page === "Tasks") {
          const actionLayout = await window.webContents.executeJavaScript(`(()=>{const row=document.querySelector('.task-start .task-controls'),buttons=row?.querySelectorAll('button');return {gap:row&&getComputedStyle(row).gap,wrap:row&&getComputedStyle(row).flexWrap,count:buttons?.length}})()`);
          if (actionLayout.gap !== "8px" || actionLayout.wrap !== "wrap" || actionLayout.count !== 2) throw new Error("New-task actions need separate, wrapping controls.");
          await window.webContents.executeJavaScript(`document.querySelector('.task-row').click()`);
          await new Promise(resolve => setTimeout(resolve, 200));
          const conversationColumns = await window.webContents.executeJavaScript(`(()=>{const pane=document.querySelector('.task-detail').getBoundingClientRect(),viewport=document.querySelector('.task-messages'),column=viewport.firstElementChild.getBoundingClientRect(),composer=document.querySelector('.task-composer').getBoundingClientRect(),row=document.querySelector('.task-history-list .task-row');return {paneWidth:pane.width,columnWidth:column.width,composerWidth:composer.width,columnLeft:column.left,composerLeft:composer.left,composerRight:composer.right,paneLeft:pane.left,paneRight:pane.right,rowPadding:getComputedStyle(row).padding,rowGap:getComputedStyle(row).gap}})()`);
          if(conversationColumns.columnWidth>801||conversationColumns.composerWidth>801||Math.abs(conversationColumns.columnLeft-conversationColumns.composerLeft)>1||Math.abs(conversationColumns.columnWidth-conversationColumns.composerWidth)>1||conversationColumns.composerLeft<conversationColumns.paneLeft+23||conversationColumns.composerRight>conversationColumns.paneRight-23||conversationColumns.rowPadding!=='10px 12px'||conversationColumns.rowGap!=='6px')throw new Error('Conversation columns or task row spacing is inconsistent: '+JSON.stringify(conversationColumns));
          const messageLayout = await window.webContents.executeJavaScript(`(()=>{const message=document.querySelector('.message-markdown'),heading=message?.querySelector('h2'),paragraph=heading?.nextElementSibling;return {whiteSpace:message&&getComputedStyle(message).whiteSpace,headingGap:heading&&paragraph?paragraph.getBoundingClientRect().top-heading.getBoundingClientRect().bottom:null}})()`);
          if (messageLayout.whiteSpace !== "normal" || messageLayout.headingGap === null || messageLayout.headingGap > 20) throw new Error("Markdown conversation spacing is inconsistent.");
          for (let attempt = 0; ; attempt++) {
            const highlighted = await window.webContents.executeJavaScript(`(()=>{const tokens=Array.from(document.querySelectorAll('.message-code-block .code-token'));return tokens.length>0&&new Set(tokens.map(token=>getComputedStyle(token).color)).size>1})()`);
            if (highlighted) break;
            if (attempt > 50) throw new Error("Code highlighting did not load offline in the current theme.");
            await new Promise(resolve => setTimeout(resolve, 100));
          }
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
          await auditTaskActions(window,output,width,theme);
          await auditActiveTaskActions(window,output,width,theme);
          editorCalls=[];
          await window.webContents.executeJavaScript(`(()=>{const link=document.querySelector('.message-file-link');link.scrollIntoView({block:'nearest'});link.click();link.click()})()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          if(editorCalls.length!==1||editorCalls[0].id!=="design-project"||editorCalls[0].filename!=="example.ts"||editorCalls[0].line!==2||editorCalls[0].column!==1||!await window.webContents.executeJavaScript(`document.querySelector('.message-file-link').disabled`))throw new Error("Conversation file link lost its target or submitted twice.");
          pendingEditor.reject(new Error("Owned file link failure"));await new Promise(resolve=>setTimeout(resolve,100));
          if(!await window.webContents.executeJavaScript(`document.querySelector('.message-link-feedback[role="alert"]').textContent==='Owned file link failure'`))throw new Error("File link error feedback is missing.");
          writeFileSync(path.join(output,`${width}-${theme}-file-reference.png`),(await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`document.querySelector('.message-file-link').click()`);
          await new Promise(resolve=>setTimeout(resolve,50));pendingEditor.resolve();await new Promise(resolve=>setTimeout(resolve,100));
          if(editorCalls.length!==2||!await window.webContents.executeJavaScript(`!document.querySelector('.message-link-feedback')&&!document.querySelector('.message-file-link').disabled`))throw new Error("File link retry did not recover.");


          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Review task progress')).click()`);
          await new Promise(resolve=>setTimeout(resolve,150));
          const progressLayout=await window.webContents.executeJavaScript(`(()=>{const activity=document.querySelector('.task-activity'),list=activity.querySelector('.plan-steps');return {open:activity.open,completed:list.querySelectorAll('[data-status="completed"]').length,active:list.querySelectorAll('[data-status="in_progress"]').length,pending:list.querySelectorAll('[data-status="pending"]').length,cancelled:list.querySelector('[data-status="cancelled"] small')?.textContent,inert:!list.querySelector('untrusted'),scrollable:list.scrollHeight>list.clientHeight,listHeight:list.clientHeight,summary:activity.querySelector('summary').textContent,explanation:activity.querySelector('.plan-explanation')?.textContent}})()`);
          if(!progressLayout.open||progressLayout.completed!==2||progressLayout.active!==1||progressLayout.pending!==26||progressLayout.cancelled!=="Cancelled"||!progressLayout.inert||!progressLayout.scrollable||progressLayout.listHeight<110||!progressLayout.summary.includes('2/30 completed')||progressLayout.explanation!=='Inspect the current flow, implement the change, and verify the result.')throw new Error("Structured plan progress layout is inconsistent.");
          await window.webContents.executeJavaScript(`navigator.clipboard.writeText=async text=>{window.auditCopiedPlan=text;};document.querySelector('.task-activity button').click();document.querySelector('.task-activity').scrollIntoView({block:'nearest'})`);
          await new Promise(resolve=>setTimeout(resolve,100));
          if(!await window.webContents.executeJavaScript(`window.auditCopiedPlan===${JSON.stringify(progressText)}`))throw new Error("Plan copy did not preserve the original payload.");
          if(!await window.webContents.executeJavaScript(`(()=>{const card=document.querySelector('.task-activity').getBoundingClientRect(),pane=document.querySelector('.task-messages').getBoundingClientRect();return card.top>=pane.top&&card.bottom<=pane.bottom})()`))throw new Error("Plan summary and copy controls do not fit the conversation pane.");
          if(!await window.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.plan-steps'),step=list.querySelector('[data-status="cancelled"]');list.scrollTop=step.offsetTop-list.offsetTop;const r=step.getBoundingClientRect(),pane=list.getBoundingClientRect();return r.top>=pane.top&&r.bottom<=pane.bottom})()`))throw new Error("Cancelled progress step is not reachable in the checklist.");
          await new Promise(resolve=>setTimeout(resolve,100));
          writeFileSync(path.join(output,`${width}-${theme}-task-progress.png`),(await window.webContents.capturePage()).toPNG());
          await auditNativeCompaction(window,output,width,theme,nativeSummary);
          await auditOpenAiCompaction(window,output,width,theme);
          await auditClaudeCompaction(window,output,width,theme);
          await auditPiCompaction(window,output,width,theme);
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
          const boundedSettings = await window.webContents.executeJavaScript(`(()=>{const form=document.querySelector('.task-settings'),editor=document.querySelector('.task-composer textarea');editor.style.height='2000px';form.scrollTop=form.scrollHeight;const button=form.querySelector('button[type="submit"]'),b=button.getBoundingClientRect(),f=form.getBoundingClientRect();return {editorHeight:editor.getBoundingClientRect().height,limit:Math.min(200,innerHeight*.12),reachable:b.top>=f.top&&b.bottom<=f.bottom,conversation:document.querySelector('.task-messages').clientHeight,composerBottom:document.querySelector('.task-composer').getBoundingClientRect().bottom}})()`);
          if(boundedSettings.editorHeight>boundedSettings.limit+1||!boundedSettings.reachable||boundedSettings.conversation<70||boundedSettings.composerBottom>height)throw new Error("Settings and resized composer must retain usable conversation space: "+JSON.stringify(boundedSettings));
          await window.webContents.executeJavaScript(`document.querySelector('.task-composer textarea').style.height='';document.querySelector('.task-settings').scrollTop=0;new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          writeFileSync(path.join(output, `${width}-${theme}-conversation-settings.json`), JSON.stringify(settingsLayout, null, 2));
          writeFileSync(path.join(output, `${width}-${theme}-conversation-settings.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Task settings"]').click()`);
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Review queued messages')).click()`);
          for(let attempt=0;;attempt++){
            if(await window.webContents.executeJavaScript(`document.querySelector('.task-queue-items')?.children.length===12`))break;
            if(attempt>50)throw new Error("Queue fixture did not render.");
            await new Promise(resolve=>setTimeout(resolve,100));
          }
          await window.webContents.executeJavaScript(`document.querySelector('.task-queue-items button').click();new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          const queueLayout=await window.webContents.executeJavaScript(`(()=>{const items=document.querySelector('.task-queue-items'),composer=document.querySelector('.task-composer'),editor=items.querySelector('textarea'),r=items.getBoundingClientRect(),c=composer.getBoundingClientRect(),e=editor.getBoundingClientRect();items.scrollTop=items.scrollHeight;return {height:r.height,scrollable:items.scrollHeight>items.clientHeight,lastReachable:items.scrollTop>0,composerVisible:c.bottom<=innerHeight,editorFits:e.left>=r.left&&e.right<=r.right,transcriptHeight:document.querySelector('.task-messages').clientHeight}})()`);
          if(queueLayout.height>181 || !queueLayout.scrollable || !queueLayout.lastReachable || !queueLayout.composerVisible || !queueLayout.editorFits || queueLayout.transcriptHeight<50)throw new Error("Queued messages must preserve usable conversation and composer space: "+JSON.stringify(queueLayout));
          await window.webContents.executeJavaScript(`document.querySelector('.task-queue-items').scrollTop=0`);
          writeFileSync(path.join(output, `${width}-${theme}-queued-messages.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`document.querySelector('.task-activity summary').click();document.querySelector('.task-activity').scrollIntoView({block:'nearest'});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.auditCopiedResult=text;}}});document.querySelector('button[aria-label="Copy result"]').click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          const activityCopy=await window.webContents.executeJavaScript(`(()=>{const activity=document.querySelector('.task-activity'),pre=activity.querySelector('pre');return {copied:window.auditCopiedResult===pre.textContent&&Boolean(activity.querySelector('button[aria-label="Result copied"]')),inert:!pre.querySelector('untrusted'),scrollable:pre.scrollHeight>pre.clientHeight,padding:getComputedStyle(pre).padding}})()`);
          if(!activityCopy.copied || !activityCopy.inert || !activityCopy.scrollable || activityCopy.padding!=="16px")throw new Error("Tool result copying or layout is inconsistent.");
          await window.webContents.executeJavaScript(`navigator.clipboard.writeText=async()=>{throw new Error('Owned result copy failure');};document.querySelector('button[aria-label="Result copied"]').click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          if(!await window.webContents.executeJavaScript(`document.querySelector('.activity-result .message-code-actions span').textContent==='Copy failed'`))throw new Error("Tool result copy failure feedback is missing.");
          writeFileSync(path.join(output, `${width}-${theme}-tool-result.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`navigator.clipboard.writeText=()=>new Promise(resolve=>{window.auditResolveResultCopy=resolve;});document.querySelector('button[aria-label="Copy result"]').click()`);
          const resultDb=new DatabaseSync(path.join(data,"workspace/workspace.sqlite"));
          const updatedTask=JSON.parse(resultDb.prepare("SELECT data FROM tasks WHERE id=?").get("design-queue").data);
          const originalResult=updatedTask.activities[0].text;
          updatedTask.activities[0].text="Changed while copying";
          resultDb.prepare("UPDATE tasks SET data=? WHERE id=?").run(JSON.stringify(updatedTask),"design-queue");resultDb.close();
          await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.command({type:'update-task',id:'design-queue',title:'Review queued messages'}).then(()=>true)`);
          for(let attempt=0;;attempt++){
            if(await window.webContents.executeJavaScript(`document.querySelector('.task-activity pre')?.textContent==='Changed while copying'`))break;
            if(attempt>50)throw new Error("Changed tool result did not render.");
            await new Promise(resolve=>setTimeout(resolve,100));
          }
          await window.webContents.executeJavaScript(`window.auditResolveResultCopy()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          if(!await window.webContents.executeJavaScript(`!document.querySelector('button[aria-label="Result copied"]')&&!document.querySelector('button[aria-label="Copy result"]').disabled`))throw new Error("A stale clipboard completion confirmed changed content.");
          const restoreDb=new DatabaseSync(path.join(data,"workspace/workspace.sqlite"));
          const restoreTask=JSON.parse(restoreDb.prepare("SELECT data FROM tasks WHERE id=?").get("design-queue").data);restoreTask.activities[0].text=originalResult;
          restoreDb.prepare("UPDATE tasks SET data=? WHERE id=?").run(JSON.stringify(restoreTask),"design-queue");restoreDb.close();
          await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.command({type:'update-task',id:'design-queue',title:'Review queued messages'}).then(()=>true)`);

          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Review agent requests')).click()`);
          for(let attempt=0;;attempt++){
            if(await window.webContents.executeJavaScript(`Boolean(document.querySelector('section[aria-label="Approval needed"]'))`))break;
            if(attempt>50)throw new Error("Approval fixture did not render.");
            await new Promise(resolve=>setTimeout(resolve,100));
          }
          for(const type of ["approval","answer"]){
            const previous=requestCalls;
            await window.webContents.executeJavaScript(type==="approval"?`(()=>{const button=document.querySelector('section[aria-label="Approval needed"] .task-primary');button.click();button.click();})()`:`(()=>{const form=document.querySelector('form[aria-label="Agent questions"]');form.querySelector('input').click();const button=form.querySelector('button[type="submit"]');button.click();button.click();})()`);
            for(let attempt=0;!pendingRequest;attempt++){
              if(attempt>50)throw new Error("Request submission did not reach the fixture.");
              await new Promise(resolve=>setTimeout(resolve,20));
            }
            const locked=await window.webContents.executeJavaScript(type==="approval"?`Array.from(document.querySelector('section[aria-label="Approval needed"]').querySelectorAll('button')).every(button=>button.disabled)`:`document.querySelector('form[aria-label="Agent questions"] fieldset').disabled&&document.querySelector('form[aria-label="Agent questions"] button').disabled`);
            if(!locked||requestCalls!==previous+1)throw new Error("Request pending state allowed duplicate submissions.");
            pendingRequest(new Error("Owned request failure"));pendingRequest=undefined;
            await new Promise(resolve=>setTimeout(resolve,100));
            const recovered=await window.webContents.executeJavaScript(type==="approval"?`Boolean(document.querySelector('section[aria-label="Approval needed"] [role="alert"]'))&&!document.querySelector('section[aria-label="Approval needed"] .task-primary').disabled`:`Boolean(document.querySelector('form[aria-label="Agent questions"] [role="alert"]'))&&document.querySelector('form[aria-label="Agent questions"] input').checked&&!document.querySelector('form[aria-label="Agent questions"] fieldset').disabled`);
            if(!recovered)throw new Error("Failed requests must retain their choices and allow retry.");
          }
          await window.webContents.executeJavaScript(`document.querySelector('form[aria-label="Agent questions"] .request-actions').scrollIntoView({block:'end'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          writeFileSync(path.join(output, `${width}-${theme}-agent-requests.png`), (await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Plan the product launch')).click()`);
          for(let attempt=0;;attempt++){
            if(await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-message .attachment-chip'))`))break;
            if(attempt>50)throw new Error("Attachment trigger did not render.");
            await new Promise(resolve=>setTimeout(resolve,100));
          }
          failAttachment=true;holdAttachment=true;
          await window.webContents.executeJavaScript(`(()=>{const trigger=document.querySelector('.task-message .attachment-chip');trigger.focus();trigger.click()})()`);
          for(let attempt=0;!releaseAttachment;attempt++){
            if(attempt>50)throw new Error("Attachment read did not reach the fixture.");
            await new Promise(resolve=>setTimeout(resolve,20));
          }
          if(!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.attachment-preview[open] [role="status"]'))&&document.activeElement?.getAttribute('aria-label')==='Close attachment preview'`))throw new Error("Attachment loading or modal focus is missing.");
          holdAttachment=false;releaseAttachment();releaseAttachment=undefined;
          for(let attempt=0;;attempt++){
            if(await window.webContents.executeJavaScript(`document.querySelector('.attachment-preview [role="alert"]')?.textContent==='Owned attachment failure'`))break;
            if(attempt>50)throw new Error("Attachment failure did not render.");
            await new Promise(resolve=>setTimeout(resolve,100));
          }
          writeFileSync(path.join(output,`${width}-${theme}-attachment-failure.png`),(await window.webContents.capturePage()).toPNG());
          await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.attachment-preview button')).find(button=>button.textContent==='Retry').click()`);
          for(let attempt=0;;attempt++){
            if(await window.webContents.executeJavaScript(`new Set(Array.from(document.querySelectorAll('.attachment-preview .code-token')).map(token=>getComputedStyle(token).color)).size>1`))break;
            if(attempt>50)throw new Error("Attachment retry did not load highlighted text.");
            await new Promise(resolve=>setTimeout(resolve,100));
          }
          await window.webContents.executeJavaScript(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.auditCopiedAttachment=text;}}});document.querySelector('.attachment-preview button[aria-label="Copy code"]').click()`);
          await new Promise(resolve=>setTimeout(resolve,100));
          const attachmentLayout=await window.webContents.executeJavaScript(`(()=>{const dialog=document.querySelector('.attachment-preview'),r=dialog.getBoundingClientRect(),pre=dialog.querySelector('pre');return {fits:r.top>=0&&r.bottom<=innerHeight,padding:getComputedStyle(dialog).padding,scrollable:pre.scrollHeight>pre.clientHeight,copy:window.auditCopiedAttachment===${JSON.stringify(previewText)}}})()`);
          if(!attachmentLayout.fits||attachmentLayout.padding!=="24px"||!attachmentLayout.scrollable||!attachmentLayout.copy)throw new Error("Attachment sizing or exact copying is inconsistent.");
          writeFileSync(path.join(output,`${width}-${theme}-attachment-preview.png`),(await window.webContents.capturePage()).toPNG());
          window.focus();window.webContents.focus();window.webContents.sendInputEvent({type:"keyDown",keyCode:"Escape"});window.webContents.sendInputEvent({type:"keyUp",keyCode:"Escape"});
          await new Promise(resolve=>setTimeout(resolve,100));
          const closedPreview=await window.webContents.executeJavaScript(`({open:Boolean(document.querySelector('.attachment-preview')),tag:document.activeElement?.tagName,classes:document.activeElement?.getAttribute('class')})`);
          if(closedPreview.open||!closedPreview.classes?.includes('attachment-chip'))throw new Error("Attachment close state: "+JSON.stringify(closedPreview));
        }
      }
      holdOverview=true;failOverview=true;
      const shortcutPlatform=await window.webContents.executeJavaScript('window.phaseoDesktop.platform');
      if(shortcutPlatform!==process.platform)throw new Error("Shortcut platform differs from native runtime.");
      const shortcutModifier=process.platform==="darwin"?"meta":"control";
      const expectedShortcut=process.platform==="darwin"?"⌘K":"Ctrl+K";
      if(!await window.webContents.executeJavaScript(`document.querySelector('.command-button kbd')?.textContent===${JSON.stringify(expectedShortcut)}`))throw new Error("Command shortcut label differs from native runtime.");
      await window.webContents.executeJavaScript(`document.querySelector('.command-button').focus()`);
      await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,isComposing:true}));`);
      if(await window.webContents.executeJavaScript(`Boolean(document.querySelector('.command-palette'))`))throw new Error("Composition opened command search.");
      window.focus();window.webContents.focus();
      window.webContents.sendInputEvent({type:"keyDown",keyCode:"K",modifiers:[shortcutModifier]});
      window.webContents.sendInputEvent({type:"keyUp",keyCode:"K",modifiers:[shortcutModifier]});
      for(let attempt=0;!releaseOverview;attempt++){if(attempt>50)throw new Error("Command overview did not reach fixture.");await new Promise(resolve=>setTimeout(resolve,20));}
      if(!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.command-palette [role="status"]'))&&document.activeElement?.getAttribute('role')==='combobox'`))throw new Error("Command loading or search focus is missing.");
      await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,repeat:true}));`);
      if(!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.command-palette'))`))throw new Error("Repeated shortcut closed command search.");
      holdOverview=false;releaseOverview();releaseOverview=undefined;
      for(let attempt=0;;attempt++){if(await window.webContents.executeJavaScript(`document.querySelector('.command-palette [role="alert"]')?.textContent==='Owned command search failure'`))break;if(attempt>50)throw new Error("Command failure feedback missing.");await new Promise(resolve=>setTimeout(resolve,100));}
      writeFileSync(path.join(output,`${width}-${theme}-commands-failure.png`),(await window.webContents.capturePage()).toPNG());
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.command-feedback button')).find(button=>button.textContent==='Retry').click()`);
      for(let attempt=0;;attempt++){if(await window.webContents.executeJavaScript(`!document.querySelector('.command-palette [role="status"]')&&!document.querySelector('.command-palette [role="alert"]')&&document.querySelector('.command-results').textContent.includes('Plan the product launch')`))break;if(attempt>50)throw new Error("Command retry did not recover task search.");await new Promise(resolve=>setTimeout(resolve,100));}
      await window.webContents.executeJavaScript(`(()=>{const input=document.querySelector('.command-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'No match owned fixture');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
      await new Promise(resolve=>setTimeout(resolve,100));
      if(!await window.webContents.executeJavaScript(`!document.querySelector('.command-results button')&&!document.querySelector('.command-search input').hasAttribute('aria-activedescendant')`))throw new Error("Empty command results have a stale active option.");
      writeFileSync(path.join(output,`${width}-${theme}-commands-empty.png`),(await window.webContents.capturePage()).toPNG());
      window.focus();window.webContents.focus();window.webContents.sendInputEvent({type:"keyDown",keyCode:"Escape"});window.webContents.sendInputEvent({type:"keyUp",keyCode:"Escape"});
      await new Promise(resolve=>setTimeout(resolve,100));
      if(!await window.webContents.executeJavaScript(`!document.querySelector('.command-palette')&&document.activeElement?.classList.contains('command-button')`))throw new Error("Command Escape did not restore trigger focus.");
      holdOverview=true;
      await window.webContents.executeJavaScript(`document.querySelector('.command-button').focus();document.querySelector('.command-button').click()`);
      for(let attempt=0;!releaseOverview;attempt++){if(attempt>50)throw new Error("Delayed overview did not reach fixture.");await new Promise(resolve=>setTimeout(resolve,20));}
      const latestTitle="Newest overview fixture "+"long-title-".repeat(12);
      const latestOverview={...heldOverview,tasks:heldOverview.tasks.map((task,index)=>index===0?{...task,title:latestTitle}:task)};
      window.webContents.send("workspace:overview-changed",latestOverview);
      await new Promise(resolve=>setTimeout(resolve,100));holdOverview=false;releaseOverview();releaseOverview=undefined;
      await new Promise(resolve=>setTimeout(resolve,100));
      if(!await window.webContents.executeJavaScript(`document.querySelector('.command-results').textContent.includes(${JSON.stringify(latestTitle)})`))throw new Error("A stale initial overview replaced newer command results.");
      await window.webContents.executeJavaScript(`(()=>{const input=document.querySelector('.command-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Newest overview');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
      await new Promise(resolve=>setTimeout(resolve,100));
      writeFileSync(path.join(output,`${width}-${theme}-commands-results.png`),(await window.webContents.capturePage()).toPNG());
      await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Close commands"]').click()`);
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.surface-switcher button')).find(b=>b.textContent==='Platform').click()`);
      for (let attempt = 0; ; attempt++) {
        if (await window.webContents.executeJavaScript(`document.querySelector('h1')?.textContent==='Platform'`)) break;
        if (attempt > 50) throw new Error("Platform did not render.");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      writeFileSync(path.join(output, `${width}-${theme}-platform.png`), (await window.webContents.capturePage()).toPNG());
      await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.surface-switcher button')).find(b=>b.textContent==='Workspace').click()`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await auditSidebarNavigation(window,output,width,height,theme);
    }
  }
  async function retryCatalogue(scope,name){
 const alert=JSON.stringify(scope+' .model-discovery-feedback [role="alert"]'),feedback=JSON.stringify(scope+' .model-discovery-feedback'),status=JSON.stringify(scope+' .model-discovery-feedback[role="status"]'),button=JSON.stringify(scope+' button[aria-label="Retry models"]');
 const values=()=>window.webContents.executeJavaScript('Array.from(document.querySelectorAll('+JSON.stringify(scope+' input,'+scope+' select')+')).map(control=>control.value).join("|")');
 for(let attempt=0;!await window.webContents.executeJavaScript('document.querySelector('+alert+')?.textContent.includes("Owned model catalogue failure")');attempt++){if(attempt>50)throw Error('Model failure not rendered');await new Promise(resolve=>setTimeout(resolve,20));}
 if(await window.webContents.executeJavaScript('document.querySelector('+alert+').textContent.includes("Error invoking remote method")'))throw Error('Model error exposes transport prefix');
 if(scope==='.task-create-fields')await window.webContents.executeJavaScript('(()=>{const input=document.querySelector('+JSON.stringify('input[aria-label="Model"]')+');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"fixture-model");input.dispatchEvent(new Event("input",{bubbles:true}));})()');
 const fields=await values();
 writeFileSync(path.join(output,'1040-dark-'+name+'-failure.png'),(await window.webContents.capturePage()).toPNG());
 const calls=modelCalls;holdModels=true;
 await window.webContents.executeJavaScript('(()=>{const button=document.querySelector('+button+');button.click();button.click()})()');
 for(let attempt=0;!releaseModels;attempt++){if(attempt>50)throw Error('Retry not delivered');await new Promise(resolve=>setTimeout(resolve,20));}
 if(modelCalls!==calls+1||!await window.webContents.executeJavaScript('document.querySelector('+status+')?.textContent.includes("Loading models")'))throw Error('Model retry duplicates requests or lacks status');
 writeFileSync(path.join(output,'1040-dark-'+name+'-pending.png'),(await window.webContents.capturePage()).toPNG());
 releaseModels();releaseModels=undefined;
 for(let attempt=0;await window.webContents.executeJavaScript('Boolean(document.querySelector('+feedback+'))');attempt++){if(attempt>50)throw Error('Retry did not recover');await new Promise(resolve=>setTimeout(resolve,20));}
 if(await values()!==fields)throw Error('Model retry changed selections');
}
  failModels=true;
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.surface-switcher button')).find(button=>button.textContent==='Workspace').click();Array.from(document.querySelectorAll('.sidebar-item')).find(button=>button.textContent.trim()==='Tasks').click()`);
  for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-list-heading button'))`);attempt++){if(attempt>50)throw Error('Task setup did not render');await new Promise(resolve=>setTimeout(resolve,50));}
  await window.webContents.executeJavaScript(`document.querySelector('.task-list-heading button').click()`);
  await new Promise(resolve=>setTimeout(resolve,100));
  await retryCatalogue(".task-create-fields","initial-models");
  for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('select[aria-label="Initial reasoning effort"] option[value="fixture-high"]'))`);attempt++){if(attempt>50)throw Error('Initial reasoning catalogue not rendered');await new Promise(resolve=>setTimeout(resolve,20));}
  await window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('select[aria-label="Initial reasoning effort"]');select.value='fixture-high';select.dispatchEvent(new Event('change',{bubbles:true}));const model=document.querySelector('input[aria-label="Model"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(model,'custom');model.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await new Promise(resolve=>setTimeout(resolve,50));
  if(!await window.webContents.executeJavaScript(`document.querySelector('select[aria-label="Initial reasoning effort"]').value===''`))throw Error('Changing initial model must reset effort');
  await window.webContents.executeJavaScript(`(()=>{const model=document.querySelector('input[aria-label="Model"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(model,'default');model.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await new Promise(resolve=>setTimeout(resolve,50));
  await window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('select[aria-label="Initial reasoning effort"]');select.value='fixture-high';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const beforeCreation = await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.overview().then(state=>state.tasks.map(task=>task.id))`);
  const creationFields = await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-create-fields input,.task-create-fields select')).map(control=>control.value).join('\\0')`);
  holdCreation=true;
  const clickCreate=()=>window.webContents.executeJavaScript(`(()=>{const button=Array.from(document.querySelectorAll('.task-controls button')).find(button=>button.textContent.includes('Create task'));button.scrollIntoView({block:'nearest'});button.click();button.click()})()`);
  await clickCreate();
  for(let attempt=0;!pendingCreation;attempt++){if(attempt>50)throw Error('Creation fixture did not receive command');await new Promise(resolve=>setTimeout(resolve,20));}
  if(creationCalls!==1||!await window.webContents.executeJavaScript(`document.querySelector('.task-create-fields').disabled && Array.from(document.querySelectorAll('.task-controls button')).every(button=>button.disabled)`))throw Error('Task setup duplicated creation or allowed pending edits');
  writeFileSync(path.join(output,'1040-dark-task-create-pending.png'),(await window.webContents.capturePage()).toPNG());
  pendingCreation.reject(new Error('Owned task creation failure'));pendingCreation=undefined;
  for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.task-error')?.textContent.includes('Owned task creation failure')&&!document.querySelector('.task-create-fields').disabled`);attempt++){if(attempt>50)throw Error('Creation failure did not preserve setup');await new Promise(resolve=>setTimeout(resolve,20));}
  if(await window.webContents.executeJavaScript(`document.querySelector('.task-error').textContent.includes('Error invoking remote method')`))throw Error('Creation exposed transport prefix');
  if(await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-create-fields input,.task-create-fields select')).map(control=>control.value).join('\\0')`)!==creationFields)throw Error('Failed creation changed task configuration');
  writeFileSync(path.join(output,'1040-dark-task-create-failure.png'),(await window.webContents.capturePage()).toPNG());
  await clickCreate();
  for(let attempt=0;!pendingCreation;attempt++){if(attempt>50)throw Error('Creation retry not delivered');await new Promise(resolve=>setTimeout(resolve,20));}
  if(creationCalls!==2)throw Error('Creation retry duplicated requests');pendingCreation.resolve();pendingCreation=undefined;holdCreation=false;
  for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-title'))`);attempt++){if(attempt>50)throw Error('Created task did not open');await new Promise(resolve=>setTimeout(resolve,20));}
  const afterCreation=await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.overview().then(state=>state.tasks.map(task=>task.id))`);
  if(afterCreation.length!==beforeCreation.length+1||beforeCreation.some(id=>!afterCreation.includes(id)))throw Error('Creation must persist exactly one new task');
  failModels=true;
  await window.webContents.executeJavaScript(`document.querySelector('button[aria-label="Task settings"]').click()`);
  await retryCatalogue('.task-settings','settings-models');
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-settings-actions button')).find(button=>button.textContent==='Cancel').click()`);
  const createdId=afterCreation.find(id=>!beforeCreation.includes(id));
  if(await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.task(${JSON.stringify(createdId)}).then(task=>task.reasoningEffort)`)!=='fixture-high')throw Error('Initial effort did not persist');
  await openTaskActions(window);
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-actions-menu [role="menuitem"]')).find(item=>item.textContent==='Handoff').click()`);
  await new Promise(resolve=>setTimeout(resolve,100));
  if(!await window.webContents.executeJavaScript(`document.querySelector('select[aria-label="Initial reasoning effort"]').value===''`))throw Error("Handoff must reset model-specific effort");
  await window.webContents.executeJavaScript(`(()=>{const select=document.querySelector('select[aria-label="Initial reasoning effort"]');select.value='fixture-low';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  holdCreation=true;
  await window.webContents.executeJavaScript(`(()=>{const button=Array.from(document.querySelectorAll('.task-controls button')).find(button=>button.textContent.includes('Create handoff'));button.scrollIntoView({block:'nearest'});button.click();button.click()})()`);
  for(let attempt=0;!pendingCreation;attempt++){if(attempt>50)throw Error('Handoff fixture not reached');await new Promise(resolve=>setTimeout(resolve,20));}
  if(creationCalls!==3||!await window.webContents.executeJavaScript(`document.querySelector('.task-create-fields').disabled`))throw Error('Handoff duplicated creation');
  pendingCreation.resolve();pendingCreation=undefined;holdCreation=false;
  for(let attempt=0;!await window.webContents.executeJavaScript(`Boolean(document.querySelector('.task-title'))`);attempt++){if(attempt>50)throw Error('Handoff did not open');await new Promise(resolve=>setTimeout(resolve,20));}
  if(await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.overview().then(state=>state.tasks.length)`)!==beforeCreation.length+2)throw Error('Handoff must persist exactly one new task');
  if(!await window.webContents.executeJavaScript(`window.phaseoDesktop.workspace.overview().then(async state=>{const task=state.tasks.find(value=>! ${JSON.stringify(afterCreation)}.includes(value.id));return (await window.phaseoDesktop.workspace.task(task.id)).reasoningEffort==='fixture-low'})`))throw Error("Handoff effort did not persist");
async function auditCompactDelivery(){
 await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.textContent.includes('Review native compaction')).click()`);
 for(let attempt=0;!await window.webContents.executeJavaScript(`document.querySelector('.task-title')?.value==='Review native compaction'`);attempt++){if(attempt>50)throw new Error('Compaction delivery fixture did not open');await new Promise(resolve=>setTimeout(resolve,20));}
 await window.webContents.executeJavaScript(`(()=>{const input=document.querySelector('.task-composer textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'Keep this draft 世界');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 holdCompact=true;await openTaskActions(window);
 await window.webContents.executeJavaScript(`(()=>{const item=Array.from(document.querySelectorAll('.task-actions-menu [role="menuitem"]')).find(item=>item.textContent==='Compact context');item.click();item.click()})()`);
 for(let attempt=0;!pendingCompact;attempt++){if(attempt>50)throw new Error('Compaction delivery did not reach owned fixture');await new Promise(resolve=>setTimeout(resolve,20));}
 await openTaskActions(window);
 if(compactCalls!==1||!await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-actions-menu [role="menuitem"]')).filter(item=>item.textContent!=='Pin task').every(item=>item.hasAttribute('data-disabled'))&&document.querySelector('button[aria-label="Task settings"]').disabled&&document.querySelector('.task-composer textarea').value==='Keep this draft 世界'`))throw new Error('Compaction delivery was duplicated or controls/draft changed');
 writeFileSync(path.join(output,'1040-dark-compaction-delivery-pending.png'),(await window.webContents.capturePage()).toPNG());
 window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
 holdCompact=false;pendingCompact.reject(new Error('Owned compaction delivery failure'));pendingCompact=undefined;
 for(let attempt=0;!await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="alert"]')).some(item=>item.textContent==='Owned compaction delivery failure')&&!document.querySelector('button[aria-label="Task settings"]').disabled`);attempt++){if(attempt>50)throw new Error('Compaction failure recovery did not render');await new Promise(resolve=>setTimeout(resolve,20));}
 writeFileSync(path.join(output,'1040-dark-compaction-delivery-failure.png'),(await window.webContents.capturePage()).toPNG());
 await openTaskActions(window);await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.task-actions-menu [role="menuitem"]')).find(item=>item.textContent==='Compact context').click()`);
 for(let attempt=0;compactCalls!==2||!await window.webContents.executeJavaScript(`!document.querySelector('[role="alert"]')&&document.querySelector('.task-composer textarea').value==='Keep this draft 世界'`);attempt++){if(attempt>50)throw new Error('Compaction retry did not preserve draft or clear error');await new Promise(resolve=>setTimeout(resolve,20));}
}
  await auditCompactDelivery();
  if(nativeCompactCalls!==4||claudeCompactCalls!==4||piCompactCalls!==4)throw new Error("Native compact requests were not delivered exactly once per theme/window fixture");
console.log("DESIGN_AUDIT", output);
} catch (error) { console.error(error); app.exit(1); } finally { app.quit(); }
});
