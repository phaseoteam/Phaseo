import { installControlActions } from "./fixtures/control-actions.mjs";
/** Reach a workspace area the way a person does: settings sections, the tools panel, or back to the chat. */
export async function installChatNavigation(window) {
 await installControlActions(window);
 await window.webContents.executeJavaScript(`window.__auditNavigate = async function(page) {
  const settings={Accounts:'Accounts',Agents:'Agents',MCP:'MCP servers',Missions:'Missions',Settings:'General',Appearance:'Appearance'};
  const panels={Projects:'Files & changes',Terminals:'Terminal',Proposals:'Pull requests',Browser:'Browser'};
  if(page==='Tasks'||page==='Home'){if(document.querySelector('nav[aria-label="Settings sections"]'))await window.__auditCloseSettings();return;}
  if(settings[page]){await window.__auditSettings(settings[page]);return;}
  if(panels[page]){if(document.querySelector('nav[aria-label="Settings sections"]'))await window.__auditCloseSettings();await window.__auditPanel(panels[page]);return;}
  throw Error('No workspace area named '+page);
 }; true`);
}
