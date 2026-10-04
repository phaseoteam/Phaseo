export async function installChatNavigation(window) {
 await window.webContents.executeJavaScript(`window.__auditNavigate = async function(page) {
  if(page==='Tasks'||page==='Home'){document.querySelector('.topbar [aria-label="Chats"]').click();return;}
  document.querySelector('.topbar .command-button:has(kbd)').click();
  for(let i=0;!document.querySelector('dialog[open] input');i++){if(i>100)throw Error('Commands did not open');await new Promise(r=>setTimeout(r,20));}
  const titles={Projects:'Open projects',Accounts:'Open accounts',Agents:'Open agents',MCP:'Open MCP connections',Terminals:'Open terminals',Inbox:'Open inbox',Settings:'Open settings',Missions:'Open missions',Proposals:'Open proposals'};
  const input=document.querySelector('dialog[open] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,titles[page]);input.dispatchEvent(new Event('input',{bubbles:true}));
  for(let i=0;;i++){const item=Array.from(document.querySelectorAll('dialog[open] [role="option"]')).find(item=>item.querySelector('span')?.textContent===titles[page]);if(item){item.click();return;}if(i>100)throw Error('Command not found '+page);await new Promise(r=>setTimeout(r,20));}
 }; true`);
}
