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
  }; true`);
}
