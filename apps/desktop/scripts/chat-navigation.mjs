import { installControlActions } from "./fixtures/control-actions.mjs";
/** Reach a workspace area the way a person does: settings sections, the tools panel, or back to the chat. */
export async function installChatNavigation(window) {
 await installControlActions(window);
 await window.webContents.executeJavaScript(`window.__auditNavigate = async function(page) {
  const settings={Accounts:'Accounts',Agents:'Agents',MCP:'MCP servers',Settings:'General',Appearance:'Appearance'};
  const panels={Projects:'Files & changes',Terminals:'Terminal',Proposals:'Linked pull requests',Browser:'Browser'};
  if(page==='Tasks'||page==='Home'){if(document.querySelector('nav[aria-label="Settings sections"]'))await window.__auditCloseSettings();return;}
  if(page==='Scheduled tasks'){if(document.querySelector('nav[aria-label="Settings sections"]'))await window.__auditCloseSettings();const link=document.querySelector('aside button[aria-label="Scheduled tasks"]');if(!link)throw Error('Scheduled tasks link missing');link.click();return;}
  if(settings[page]){await window.__auditSettings(settings[page]);return;}
  if(panels[page]){if(document.querySelector('nav[aria-label="Settings sections"]'))await window.__auditCloseSettings();await window.__auditPanel(panels[page]);return;}
  throw Error('No workspace area named '+page);
 }; true`);
}
