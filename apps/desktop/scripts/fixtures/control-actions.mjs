/** Drive actual rendered shadcn controls; never replace application state. */
export async function installControlActions(owner) {
  await owner.webContents.executeJavaScript(`window.__auditChoose = async function(label,value) {
    const pause=()=>new Promise(resolve=>setTimeout(resolve,25));
    const find=()=>Array.from(document.querySelectorAll('button[role="combobox"]')).find(button=>button.getAttribute('aria-label')===label);
    let trigger;
    for(let attempt=0;attempt<800;attempt++){trigger=find();if(trigger&&!trigger.disabled)break;if(attempt===799)throw Error('Control unavailable: '+label);await pause();}
    const details=trigger.closest('details');if(details&&!details.open){details.querySelector('summary').click();await pause();}
    trigger.click();
    let popup;
    for(let attempt=0;attempt<200;attempt++){popup=Array.from(document.querySelectorAll('[aria-label]')).find(element=>element.getAttribute('aria-label')===label+' options'&&element.getClientRects().length&&!element.closest('[hidden]'));if(popup)break;if(attempt===199)throw Error('Control did not open: '+label);await pause();}
    const search=popup.querySelector('[aria-label="Search models"]');
    if(search){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,String(value));search.dispatchEvent(new Event('input',{bubbles:true}));await pause();}
    let item;
    for(let attempt=0;attempt<200;attempt++){item=Array.from(popup.querySelectorAll('[data-option-value]')).find(element=>element.dataset.optionValue===String(value));if(item)break;if(attempt===199)throw Error('Option unavailable in '+label+': '+value);await pause();}
    if(item.hasAttribute('data-disabled')&&item.getAttribute('data-disabled')!=='false')throw Error('Option disabled in '+label);
    item.click();
    for(let attempt=0;attempt<200;attempt++){const current=find();if(current&&current.value===String(value)&&current.getAttribute('aria-expanded')==='false')return;if(attempt===199)throw Error('Selection did not settle: '+label);await pause();}
  };
  window.__auditSession = async function(kind,value) {
    const pause=()=>new Promise(resolve=>setTimeout(resolve,25));
    if(!document.querySelector('.session-picker-popup'))document.querySelector('[aria-label="Model and runtime"]').click();
    for(let i=0;!document.querySelector('.session-picker-popup')&&i<200;i++)await pause();
    const popup=document.querySelector('.session-picker-popup');if(!popup)throw Error('Session picker unavailable');
    if(kind==='harness') {
      const names={phaseo:'Phaseo',codex:'Codex',claude:'Claude Code',opencode:'OpenCode 2',pi:'Pi',cursor:'Cursor',grok:'Grok',acp:'ACP agent'};
      Array.from(popup.querySelectorAll('[aria-label=Runtimes] button')).find(el=>el.textContent===names[value]).click();
      for(let i=0;i<200;i++){if(!popup.querySelector('[aria-busy=true]'))break;await pause();}
    } else {
      const input=popup.querySelector('[aria-label="Search models"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));
      let item;for(let i=0;i<800;i++){item=Array.from(popup.querySelectorAll('[data-option-value]')).find(el=>el.dataset.optionValue===value);if(item)break;await pause();}
      if(!item)throw Error('Session model unavailable: '+value);item.click();
    }
    await pause(); document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    for(let i=0;i<200&&document.querySelector('.session-picker-popup');i++)await pause();
  };
  ${shellActions}; true`);
}

/** Helpers for the redesigned shell: command palette, chat header, dropdown menus and the settings page. */
const shellActions = String.raw`
  window.__auditUntil = async function(predicate,label,attempts=400) {
    for(let attempt=0;attempt<attempts;attempt++){const value=await predicate();if(value)return value;await new Promise(resolve=>setTimeout(resolve,25));}
    throw Error('Did not settle: '+label);
  };
  window.__auditButton = (text,root=document) => Array.from(root.querySelectorAll('button')).find(button=>button.textContent.trim()===text);
  window.__auditType = (input,value) => {
    // The composer is an editor, not a text field: its element exposes the draft as its value property.
    if(input?.isContentEditable){input.value=value;return;}
    const prototype=input instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));
  };
  /** The open chat's title from its header, or undefined when no chat is open. */
  window.__auditChatTitle = () => { const header=document.querySelector('main header'); return header?.querySelector('button[title="Rename"]')?.textContent ?? header?.querySelector('input[aria-label="Chat title"]')?.value; };
  window.__auditPalette = async function() {
    const input=()=>document.querySelector('[data-slot="dialog-content"] [cmdk-input]');
    if(!input())window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));
    return window.__auditUntil(input,'command palette');
  };
  window.__auditPaletteClose = async function() {
    document.querySelector('[data-slot="dialog-content"] [cmdk-input]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    await window.__auditUntil(()=>!document.querySelector('[data-slot="dialog-content"]'),'command palette close');
  };
  /** Search the command palette and select the item whose label matches exactly. */
  window.__auditPaletteRun = async function(query,label=query,group) {
    const input=await window.__auditPalette();window.__auditType(input,query);
    const item=await window.__auditUntil(()=>Array.from(document.querySelectorAll('[data-slot="dialog-content"] [cmdk-group]')).filter(value=>!group||value.querySelector('[cmdk-group-heading]')?.textContent===group).flatMap(value=>Array.from(value.querySelectorAll('[cmdk-item]'))).find(value=>{const title=value.querySelector('span.flex-1');if(title)return title.textContent.trim()===label;const copy=value.cloneNode(true);copy.querySelectorAll('[data-slot="command-shortcut"]').forEach(node=>node.remove());return copy.textContent.trim()===label;}),'command '+label);
    item.click();
    await window.__auditUntil(()=>!document.querySelector('[data-slot="dialog-content"] [cmdk-input]'),'command palette close');
  };
  /** Open a chat by title through the command palette, the app's way to reach any chat. */
  window.__auditOpenChat = async function(title) {
    if(document.querySelector('nav[aria-label="Settings sections"]'))await window.__auditCloseSettings();
    if(window.__auditChatTitle()===title)return;
    await window.__auditPaletteRun(title,title,'Chats');
    await window.__auditUntil(()=>window.__auditChatTitle()===title,'chat '+title);
  };
  /** Open a chat by id when titles repeat: palette items also match on the chat id. */
  window.__auditOpenChatId = async function(id) {
    if(document.querySelector('nav[aria-label="Settings sections"]'))await window.__auditCloseSettings();
    const title=(await window.phaseoDesktop.workspace.overview()).tasks.find(task=>task.id===id)?.title;if(!title)throw Error('Unknown chat '+id);
    await window.__auditPaletteRun(id,title,'Chats');
    await window.__auditUntil(()=>JSON.parse(localStorage.getItem('phaseo.desktop.selectedTask')??'null')===id&&window.__auditChatTitle()===title,'chat '+id);
  };
  /** Open a dropdown menu from its trigger and choose an item by its text. */
  window.__auditMenu = async function(trigger,label) {
    const selector=typeof trigger==='string'?trigger:undefined;
    // An item's shortcut label (such as the B after Browser) is not part of its name.
    const name=value=>Array.from(value.childNodes).filter(node=>!(node.nodeType===1&&node.matches('[data-slot="dropdown-menu-shortcut"]'))).map(node=>node.textContent).join('').trim();
    const matches=typeof label==='function'?label:value=>value.textContent.trim()===label||name(value)===label;
    const items=()=>Array.from(document.querySelectorAll('[data-slot="dropdown-menu-content"] [role^="menuitem"]'));
    let item;
    // Re-query a selector between attempts: a trigger can re-mount while its menu loads.
    for(let attempt=0;attempt<3&&!item;attempt++){
      if(selector)trigger=await window.__auditUntil(()=>{const value=document.querySelector(selector);return value&&!value.disabled&&value;},'menu trigger '+selector);
      if(trigger.getAttribute('aria-expanded')!=='true')trigger.click();
      item=await window.__auditUntil(()=>items().find(matches),'menu item '+label,120).catch(error=>{if(attempt===2)throw Error(error.message+' (menu: '+(items().map(value=>value.textContent.trim()).join(' | ')||'closed')+'; trigger: '+(trigger.getAttribute('aria-label')??trigger.textContent.trim())+')');});
    }
    if(item.hasAttribute('data-disabled')||item.getAttribute('aria-disabled')==='true')throw Error('Menu item disabled: '+label);
    item.click();
    await window.__auditUntil(()=>!document.querySelector('[data-slot="dropdown-menu-content"]'),'menu close '+label);
  };
  window.__auditSettings = async function(section) {
    if(!document.querySelector('nav[aria-label="Settings sections"]'))window.dispatchEvent(new KeyboardEvent('keydown',{key:',',ctrlKey:true,bubbles:true}));
    const nav=await window.__auditUntil(()=>document.querySelector('nav[aria-label="Settings sections"]'),'settings');
    const button=await window.__auditUntil(()=>window.__auditButton(section,nav),'settings section '+section);
    button.click();
    await window.__auditUntil(()=>button.getAttribute('aria-current')==='page','settings section '+section);
  };
  window.__auditCloseSettings = async function() {
    const back=window.__auditButton('Back to app',document.querySelector('nav[aria-label="Settings sections"]')??document);if(back)back.click();
    await window.__auditUntil(()=>!document.querySelector('nav[aria-label="Settings sections"]'),'settings close');
  };
  /** Show a tab of the right-hand tools panel. */
  window.__auditPanel = async function(label) {
    if(label==='Files & changes')label='Files';
    if(!document.querySelector('aside[aria-label="Tools"]'))await window.__auditPaletteRun('Show files and changes');
    // Browser and terminal tabs are titled by their page or session, so they are found by kind.
    const selector=label==='Browser'?'[role=tab][data-browser-tab-id]':label==='Terminal'?'[role=tab][data-pane-tab^="terminal:"]':'[role=tab][title="'+label+'"]';
    const find=()=>document.querySelector('aside[aria-label="Tools"] [role=tablist] '+selector);
    // A surface that is not open yet opens from the empty pane's launcher, or from the "+" menu.
    if(!find()){
      const launcher=Array.from(document.querySelectorAll('aside[aria-label="Tools"] button')).find(button=>button.querySelector('kbd')&&button.textContent.startsWith(label));
      if(launcher)launcher.click();
      else{document.querySelector('aside[aria-label="Tools"] [aria-label="Open a surface"]').click();const item=await window.__auditUntil(()=>Array.from(document.querySelectorAll('[role=menuitem]')).find(node=>node.textContent.startsWith(label)),'surface '+label);item.click();}
    }
    const tab=await window.__auditUntil(find,'panel tab '+label);
    tab.click();await window.__auditUntil(()=>tab.getAttribute('aria-selected')==='true','panel tab '+label);
  };
  /** Start a new Code chat in a project, choosing it from the new chat's project menu. */
  window.__auditUseProject = async function(name) {
    if(document.querySelector('nav[aria-label="Settings sections"]'))await window.__auditCloseSettings();
    const code=Array.from(document.querySelectorAll('[role=radiogroup][aria-label=Workspace] [role=radio]')).find(button=>button.textContent==='Code');
    if(code&&code.getAttribute('aria-checked')!=='true')code.click();
    (await window.__auditUntil(()=>Array.from(document.querySelectorAll('aside button')).find(button=>button.textContent.startsWith('New chat')),'new chat button')).click();
    const picker=await window.__auditUntil(()=>Array.from(document.querySelectorAll('main button')).find(button=>button.textContent.trim()===name||button.textContent.includes('Choose a project')),'project menu');
    if(picker.textContent.trim()!==name)await window.__auditMenu(picker,name);
    await window.__auditUntil(()=>Array.from(document.querySelectorAll('main button')).some(button=>button.textContent.trim()===name),'project '+name);
  };
  /** The details card in the title bar (Git actions), opened if needed. */
  window.__auditDetails = async function() {
    if(!document.querySelector('.git-actions'))(await window.__auditUntil(()=>document.querySelector('[aria-label="Chat details"]'),'details button')).click();
    return (await window.__auditUntil(()=>document.querySelector('.git-actions'),'Git actions')).closest('[data-slot="popover-content"]')??document.querySelector('.git-actions');
  };
  /** Switch the theme through the command palette's theme action. */
  window.__auditTheme = async function(theme) {
    if(document.documentElement.dataset.theme===theme)return;
    await window.__auditPaletteRun('Use '+theme+' theme');
    await window.__auditUntil(()=>document.documentElement.dataset.theme===theme,'theme '+theme);
  }`;
