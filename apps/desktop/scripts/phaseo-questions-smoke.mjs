import assert from 'node:assert/strict';
import { app, BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const profile = mkdtempSync(path.join(tmpdir(), 'phaseo-questions-')); app.setPath('userData', profile);
const calls = { chat: 0, code: 0, plan: 0 }; let fixtureError;
const server = createServer(async (request, response) => {
 try {
  let raw = ''; for await (const chunk of request) { raw += chunk; assert.ok(raw.length < 1024 * 1024); }
  if (request.method !== 'POST') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ data: Object.keys(calls).map(mode => ({ id: 'owned-' + mode })) })); return; }
  const body = JSON.parse(raw), mode = body.model.replace('owned-', ''), step = ++calls[mode]; assert.ok(mode in calls); assert.ok(step <= 2);
  const input = { questions: [{ header: 'Direction', question: 'Which direction should we take?', options: [{ label: 'Research', description: 'Explore the options' }, { label: 'Build', description: 'Implement the change' }] }] };
  if (step === 2) { const history = mode === 'chat' ? body.messages : body.input; const result = history.find(message => mode === 'chat' ? message.role === 'tool' : message.type === 'function_call_output'); assert.deepEqual(JSON.parse(result.content ?? result.output), { answers: [{ question: input.questions[0].question, answers: ['Owned custom direction'] }] }); }
  response.setHeader('content-type', 'text/event-stream');
  if (mode === 'chat') response.end('data: ' + JSON.stringify({ choices: [{ delta: step === 1 ? { tool_calls: [{ index: 0, id: 'ask-' + mode, type: 'function', function: { name: 'ask_user', arguments: JSON.stringify(input) } }] } : { content: 'Owned answer received' }, finish_reason: step === 1 ? 'tool_calls' : 'stop' }] }) + '\n\ndata: [DONE]\n\n');
  else response.end('data: ' + JSON.stringify({ type: 'response.completed', response: { id: 'owned-' + mode + step, model: body.model, status: 'completed', output: step === 1 ? [{ type: 'function_call', id: 'item-' + mode, call_id: 'ask-' + mode, name: 'ask_user', arguments: JSON.stringify(input) }] : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Owned answer received' }] }] } }) + '\n\n');
 } catch (error) { fixtureError = error; console.error(error); response.statusCode = 500; response.end('Owned fixture failure'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = `http://127.0.0.1:${server.address().port}/v1`, entry = process.argv.find(value => value.startsWith('--app-entry='))?.slice(12);
const deadline = setTimeout(() => { server.close(); app.exit(1); }, 60000);
await import(entry ? pathToFileURL(path.resolve(entry)).href : '../dist/main/index.mjs');
app.whenReady().then(async () => {
 try {
  const owner = BrowserWindow.getAllWindows()[0]; owner.webContents.setBackgroundThrottling(false); if (owner.webContents.isLoading()) await new Promise(resolve => owner.webContents.once('did-finish-load', resolve));
  const run = code => owner.webContents.executeJavaScript(code), wait = async code => { for (let index = 0; index < 400; index++) { const value = await run(code); if (value) return value; await new Promise(resolve => setTimeout(resolve, 25)); } throw Error('UI did not settle: ' + code); };
  const account = await run(`(async()=>{const state=await window.phaseoDesktop.workspace.command({type:'add-account',name:'Owned question fixture',kind:'api',harness:'phaseo',endpoint:${JSON.stringify(endpoint)},apiKey:'owned-unused'});return state.accounts.find(value=>value.name==='Owned question fixture').id})()`);
  const output = path.resolve('../../output/playwright/phaseo-questions', entry ? 'packaged' : 'source'); mkdirSync(output, { recursive: true }); let captures = 0;
  for (const mode of Object.keys(calls)) {
   const id = await run(`(async()=>{const api=window.phaseoDesktop.workspace,before=new Set((await api.overview()).tasks.map(task=>task.id));const state=await api.command({type:'create-task',harness:'phaseo',accountId:${JSON.stringify(account)},model:'owned-${mode}',mode:'${mode}'});const id=state.tasks.find(task=>!before.has(task.id)).id;await api.command({type:'send',id,text:'Ask me a question'});return id})()`);
   const pending = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.questions?.length?task:false})()`); assert.equal(pending.status, 'waiting'); assert.equal((pending.approvals?.length ?? 0), 0); assert.equal(calls[mode], 1);
   await wait(`Array.from(document.querySelectorAll('.task-row')).some(row=>row.title===${JSON.stringify(pending.title)})`); await run(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.title===${JSON.stringify(pending.title)}).click()`); await wait(`Boolean(document.querySelector('[aria-label="Agent questions"]'))`);
   for (const [width, height] of [[1440, 920], [1040, 680]]) for (const theme of ['light', 'dark']) { owner.setSize(width, height); await run(`document.querySelector('[aria-label="Use ${theme} theme"]')?.click()`); await run(`document.querySelector('[aria-label="Agent questions"]').scrollIntoView({block:'center'})`); await new Promise(resolve => setTimeout(resolve, 150)); writeFileSync(path.join(output, `${mode}-${theme}-${width}.png`), (await owner.webContents.capturePage()).toPNG()); captures++; }
   await run(`(()=>{const form=document.querySelector('[aria-label="Agent questions"]');Array.from(form.querySelectorAll('label')).find(label=>label.textContent.includes('Write an answer')).querySelector('input').click()})()`);
   await wait(`Boolean(document.querySelector('input[aria-label="Which direction should we take?"]'))`);
   await run(`(()=>{const input=document.querySelector('input[aria-label="Which direction should we take?"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Owned custom direction');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);
   await run(`document.querySelector('[aria-label="Agent questions"] button[type="submit"]').click()`);
   await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.status==='completed'})()`);
  }
  assert.ok(!fixtureError); assert.deepEqual(calls, { chat: 2, code: 2, plan: 2 }); console.log('PHASEO_QUESTIONS_SMOKE', JSON.stringify({ allModes: true, customAnswers: true, captures, loopbackRequests: 6, providerInferenceCalls: 0, packaged: Boolean(entry) })); clearTimeout(deadline); server.close(); app.quit();
 } catch (error) { console.error(error); clearTimeout(deadline); server.close(); app.exit(1); }
});
