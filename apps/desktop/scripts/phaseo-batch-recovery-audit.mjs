import assert from 'node:assert/strict';
import electron from 'electron';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const entry = arg('app-entry'), stage = arg('stage');
if (stage) {
 const { app, BrowserWindow } = await import('electron');
 const profile = arg('profile'), endpoint = arg('endpoint'), mode = arg('mode');
 app.setPath('userData', profile);
 const deadline = setTimeout(() => app.exit(1), 45000);
 await import(entry ? pathToFileURL(path.resolve(entry)).href : '../dist/main/index.mjs');
 app.whenReady().then(async () => { try {
  const owner = BrowserWindow.getAllWindows()[0];
  owner.webContents.setBackgroundThrottling(false);
  if (owner.webContents.isLoading()) await new Promise(resolve => owner.webContents.once('did-finish-load', resolve));
  const run = code => owner.webContents.executeJavaScript(code);
  const wait = async code => { for (let i = 0; i < 600; i++) { const value = await run(code); if (value) return value; await new Promise(resolve => setTimeout(resolve, 25)); } throw Error('Batch recovery did not settle: ' + code); };
  let id;
  if (stage === 'prepare') {
   id = await run(`(async()=>{const api=window.phaseoDesktop.workspace;const state=await api.command({type:'add-account',name:'Owned batch recovery',kind:'api',harness:'phaseo',endpoint:${JSON.stringify(endpoint)},apiKey:'owned-unused'});const accountId=state.accounts.find(account=>account.name==='Owned batch recovery').id;await api.mcp({type:'save',connection:{id:'12345678-1234-1234-1234-123456789abc',name:'Owned batch',enabled:true,transport:'http',url:${JSON.stringify(endpoint.replace(/\/v1$/, '/mcp'))}}});const created=await api.command({type:'create-task',harness:'phaseo',accountId,model:'owned',mode:${JSON.stringify(mode)}});const id=created.tasks[0].id;await api.command({type:'send',id,text:'Perform two owned effects'});return id})()`);
   const task = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.approvals?.length?task:false})()`);
   await run(`window.phaseoDesktop.workspace.command({type:'send',id:${JSON.stringify(id)},text:'Queued batch follow-up'})`);
   writeFileSync(path.join(profile, 'pending.json'), JSON.stringify({ taskId: id, runId: task.nativeSessionId }));
   console.log('BATCH_RECOVERY_PREPARED'); return;
  }
  id = JSON.parse(readFileSync(path.join(profile, 'pending.json'), 'utf8')).taskId;
  const restored = await run(`window.phaseoDesktop.workspace.task(${JSON.stringify(id)})`); assert.equal(restored.status, 'interrupted');
  assert.deepEqual(restored.queue.map(message => message.text), stage === 'write' ? ['Queued batch follow-up'] : []);
  await run(`window.phaseoDesktop.workspace.command({type:'resume',id:${JSON.stringify(id)}})`);
  if (stage === 'write') {
   for (let index = 0; index < 2; index++) {
    const task = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.approvals?.length?task:false})()`);
    await run(`window.phaseoDesktop.workspace.command({type:'approval',id:${JSON.stringify(id)},approvalId:${JSON.stringify(task.approvals[0].id)},decision:'accept'})`);
   }
   const task = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});return (task.activities??[]).some(activity=>activity.id.endsWith(':two')&&activity.status==='running')?task:false})()`);
   writeFileSync(path.join(profile, 'pending.json'), JSON.stringify({ taskId: id, runId: task.nativeSessionId }));
   console.log('BATCH_RECOVERY_PENDING'); return;
  }
  const task = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.approvals?.length?task:false})()`);
  assert.equal(task.approvals.length, 1); assert.ok(task.approvals[0].description.includes('may already have completed'));
  await wait(`Array.from(document.querySelectorAll('.task-row')).some(row=>row.title===${JSON.stringify(task.title)})`);
  await run(`Array.from(document.querySelectorAll('.task-row')).find(row=>row.title===${JSON.stringify(task.title)}).click()`);
  const output = path.resolve('../../output/playwright/phaseo-batch-recovery', entry ? 'packaged' : 'source', mode); mkdirSync(output, { recursive: true });
  await wait(`document.body.textContent.includes('may already have completed')`);
  for (const [width, height] of [[1440, 920], [1040, 680]]) for (const theme of ['light', 'dark']) {
   owner.setSize(width, height); await run(`document.querySelector('[aria-label="Use ${theme} theme"]')?.click()`); await new Promise(resolve => setTimeout(resolve, 150));
   writeFileSync(path.join(output, `interrupted-action-${theme}-${width}.png`), (await owner.webContents.capturePage()).toPNG());
  }
  await run(`window.phaseoDesktop.workspace.command({type:'approval',id:${JSON.stringify(id)},approvalId:${JSON.stringify(task.approvals[0].id)},decision:'decline'})`);
  const finished = await wait(`(async()=>{const task=await window.phaseoDesktop.workspace.task(${JSON.stringify(id)});if(task.status==='failed')throw Error(task.error);return task.status==='completed'?task:false})()`);
  assert.equal(finished.messages.filter(message => message.role === 'user' && message.text === 'Queued batch follow-up').length, 1);
  console.log('BATCH_RECOVERY_RESUMED'); clearTimeout(deadline); app.quit();
 } catch (error) { console.error(error); clearTimeout(deadline); app.exit(1); } });
} else for (const mode of ['code', 'plan']) {
 const profile = mkdtempSync(path.join(tmpdir(), 'phaseo-batch-crash-')); let requests = 0, firstEffects = 0, secondEffects = 0, active, fixtureError, held;
 const server = createServer(async (request, response) => { try {
  let raw = ''; for await (const chunk of request) { raw += chunk; assert.ok(raw.length < 1024 * 1024); }
  if (request.url === '/mcp') {
   if (request.method === 'DELETE') { response.writeHead(204); response.end(); return; }
   if (request.method !== 'POST') { response.writeHead(405); response.end(); return; }
   const rpc = JSON.parse(raw); if (rpc.id === undefined) { response.writeHead(202); response.end(); return; }
   let result;
   if (rpc.method === 'initialize') result = { protocolVersion: rpc.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'owned-batch', version: '1' } };
   else if (rpc.method === 'tools/list') result = { tools: [{ name: 'effect', inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }] };
   else if (rpc.method === 'tools/call') {
    if (rpc.params.arguments.value === 'first') { firstEffects++; result = { content: [{ type: 'text', text: 'Confirmed first effect' }] }; }
    else { assert.equal(rpc.params.arguments.value, 'second'); secondEffects++; held = response; return; }
   } else result = {};
   response.writeHead(200, { 'content-type': 'application/json', ...(rpc.method === 'initialize' ? { 'mcp-session-id': 'owned-batch-session' } : {}) }); response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result })); return;
  }
  if (request.method !== 'POST') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'owned' }] })); return; }
  const body = JSON.parse(raw); requests++; assert.ok(requests <= 2);
  let output;
  if (requests === 1) {
   const name = body.tools.map(tool => tool.function ?? tool).find(tool => tool.name?.startsWith('phaseo_')).name;
   output = ['first', 'second'].map((value, index) => ({ type: 'function_call', id: `owned-item-${index}`, call_id: index ? 'two' : 'one', name, arguments: JSON.stringify({ value }) }));
  } else {
   const results = body.input.filter(item => item.type === 'function_call_output'); assert.deepEqual(results.map(item => item.call_id), ['one', 'two']);
   assert.ok(results[0].output.includes('Confirmed first effect')); assert.ok(results[1].output.includes('rejected'));
   assert.equal(body.input.filter(item => item.role === 'user' && item.content === 'Queued batch follow-up').length, 1);
   output = [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Owned batch recovered.' }] }];
  }
  response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end('data: ' + JSON.stringify({ type: 'response.completed', response: { id: `owned-${requests}`, model: 'owned', status: 'completed', output } }) + '\n\n');
 } catch (error) { fixtureError = error; console.error(error); response.writeHead(500); response.end('Owned fixture failure'); } });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
 const launch = (value, marker) => new Promise((resolve, reject) => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  active = spawn(electron, [path.resolve('scripts/phaseo-batch-recovery-audit.mjs'), `--stage=${value}`, `--profile=${profile}`, `--endpoint=${endpoint}`, `--mode=${mode}`, ...(entry ? [`--app-entry=${path.resolve(entry)}`] : [])], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; const timer = setTimeout(() => reject(Error('Owned batch child deadline: ' + output)), 50000);
  const receive = data => { output += data.toString(); if (output.includes(marker)) { clearTimeout(timer); resolve(); } }; active.stdout.on('data', receive); active.stderr.on('data', receive);
  active.on('exit', code => { clearTimeout(timer); if (!output.includes(marker)) reject(Error(`Owned batch child exited ${code}: ${output}`)); });
 });
 const crash = async () => {
  const child = active; assert.equal(child.exitCode, null); assert.equal(child.signalCode, null);
  let killError;
  try {
   if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 15000, stdio: 'pipe' }); else assert.ok(child.kill('SIGKILL'));
  } catch (error) {
   // Only the known Windows already-exited tree result is admissible. Missing
   // executables, timeouts and permission failures must still fail the audit.
   const reasons = String(error.stderr).split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('Reason:'));
   if (process.platform !== 'win32' || error.status !== 128 || !reasons.length || reasons.some(line => line !== 'Reason: There is no running instance of the task.')) throw error;
   killError = error;
  }
  // Windows tree traversal can report already-exited descendants after killing
  // the parent. Confirm this exact spawned process exited before reopening it.
  await new Promise((resolve, reject) => {
   if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
   const exited = () => { clearTimeout(timer); resolve(); };
   const timer = setTimeout(() => { child.removeListener('exit', exited); reject(Error('Owned batch parent did not exit after forced crash.', { cause: killError })); }, 5000);
   child.once('exit', exited);
  });
  if (killError) console.log('BATCH_CRASH_CONFIRMED_AFTER_TREE_RACE', JSON.stringify({ pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode }));
 };
 try {
  await launch('prepare', 'BATCH_RECOVERY_PREPARED'); assert.equal(firstEffects, 0); assert.equal(secondEffects, 0); await crash();
  await launch('write', 'BATCH_RECOVERY_PENDING'); for (let i = 0; i < 200 && !held; i++) await new Promise(resolve => setTimeout(resolve, 25)); assert.ok(held);
  await crash(); held.destroy();
  const pending = JSON.parse(readFileSync(path.join(profile, 'pending.json'), 'utf8'));
  const db = new DatabaseSync(path.join(profile, 'workspace/workspace.sqlite'));
  const checkpoint = JSON.parse(db.prepare('SELECT data FROM agent_runs WHERE id=?').get(pending.runId).data); db.close();
  assert.deepEqual(checkpoint.run.pause.pendingToolCalls.map(item => item.call.id), ['two']);
  assert.equal(typeof checkpoint.run.pause.pendingToolCalls[0].executionStartedAt, 'string');
  assert.deepEqual(checkpoint.run.messages.filter(message => message.role === 'tool').map(message => message.toolCallId), ['one']);
  assert.deepEqual(checkpoint.run.pause.continuationMessages, [{ role: 'user', content: 'Queued batch follow-up' }]);
  await launch('read', 'BATCH_RECOVERY_RESUMED'); await new Promise(resolve => active.exitCode !== null ? resolve() : active.once('exit', resolve));
  if (fixtureError) throw fixtureError; assert.equal(firstEffects, 1); assert.equal(secondEffects, 1); assert.equal(requests, 2);
  console.log('PHASEO_BATCH_RECOVERY_AUDIT', JSON.stringify({ mode, packaged: Boolean(entry), forcedCrashes: 2, durableFollowUp: true, firstEffects, interruptedSecondAttempts: secondEffects, loopbackModelRequests: requests, providerInferenceCalls: 0, captures: 4 }));
 } finally { if (active?.exitCode === null && active?.signalCode === null) active.kill(); held?.destroy(); server.closeAllConnections(); server.close(); }
}
