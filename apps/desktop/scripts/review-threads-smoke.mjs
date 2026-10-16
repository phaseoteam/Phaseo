import assert from 'node:assert/strict';
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import childProcess from 'node:child_process';
import { promisify } from 'node:util';
import { syncBuiltinESMExports } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { installControlActions } from './fixtures/control-actions.mjs';
// Inline review threads in the pull request Code tab, driven through the production gh adapter with an owned fake gh.
const profile=mkdtempSync(path.join(tmpdir(),'phaseo-review-threads-'));app.setPath('userData',profile);mkdirSync(path.join(profile,'workspace'));
const project=path.join(profile,'project');mkdirSync(project);for(const args of [['init','-b','fixture'],['remote','add','origin','https://github.com/owned/repo.git']])childProcess.execFileSync('git',args,{cwd:project,stdio:'ignore'});
const now='2026-10-04T00:00:00Z',head='a'.repeat(40),base='b'.repeat(40);
const db=new DatabaseSync(path.join(profile,'workspace/workspace.sqlite'));db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE tasks (id TEXT PRIMARY KEY,data TEXT NOT NULL)');db.prepare('INSERT INTO projects VALUES (?,?)').run('project',JSON.stringify({id:'project',name:'Owned reviews',directory:project,createdAt:now}));
for(const [id,projectId] of [['project-chat','project'],['personal-chat',undefined]])db.prepare('INSERT INTO tasks VALUES (?,?)').run(id,JSON.stringify({id,title:id,projectId,harness:'phaseo',model:'owned',mode:'chat',status:'completed',queue:[],pinned:false,archived:false,messages:[],createdAt:now,updatedAt:now}));db.close();
const ownedGh=path.join(profile,'owned-gh.exe'),originalExec=childProcess.execFile,realExec=promisify(originalExec);let reads=0,viewReads=0,failView=true,fixtureFailure;const writes=[];
const path0='src/review 世界.ts';
const detail={number:12,title:'Owned review',body:'Owned pull request',state:'OPEN',author:{login:'owner'},isDraft:false,headRefName:'owned',baseRefName:'main',headRefOid:head,baseRefOid:base,updatedAt:now,reviewDecision:'REVIEW_REQUIRED',additions:1,deletions:1,changedFiles:1,mergeable:'MERGEABLE',mergeStateStatus:'CLEAN',commits:{nodes:[{commit:{statusCheckRollup:{state:'SUCCESS'}}}]}};
const threads=[{id:'PRRT_0',path:path0,line:1,originalLine:1,diffSide:'RIGHT',isResolved:false,isOutdated:false,viewerCanReply:true,viewerCanResolve:true,viewerCanUnresolve:true,comments:{totalCount:2,nodes:[{id:'PRRC_0',author:{login:'reviewer'},body:'Owned thread remark\n\n<script>window.reviewInjected=true</script>',createdAt:now},{id:'PRRC_1',author:null,body:'Deleted author reply',createdAt:now}]}}];
const view=()=>({data:{viewer:{login:'viewer'},repository:{mergeCommitAllowed:true,squashMergeAllowed:true,rebaseMergeAllowed:false,viewerPermission:'WRITE',pullRequest:{...detail,id:'PR_owned',createdAt:now,mergedAt:null,closedAt:null,author:{login:'owner',__typename:'User'},headRef:{id:'REF'},headRepository:{nameWithOwner:'owned/repo'},viewerCanUpdate:true,viewerCanDeleteHeadRef:false,labels:{nodes:[]},reviewRequests:{nodes:[]},latestOpinionatedReviews:{nodes:[]},history:{totalCount:1,nodes:[{commit:{oid:head,messageHeadline:'Owned commit',committedDate:now,additions:1,deletions:1,authors:{nodes:[{name:'Owner',user:{login:'owner'}}]}}}]},comments:{totalCount:0,nodes:[]},reviews:{totalCount:0,nodes:[]},reviewThreads:{totalCount:threads.length,nodes:threads}}}}});
const fieldsOf=args=>Object.fromEntries(args.flatMap((arg,index)=>['-f','-F'].includes(arg)?[[args[index+1].slice(0,args[index+1].indexOf('=')),args[index+1].slice(args[index+1].indexOf('=')+1)]]:[]));
async function ownedExecute(executable,args,options,input=''){
 if(executable==='where.exe'&&args[0]==='gh')return {stdout:ownedGh+'\r\n',stderr:''};
 if(executable!==ownedGh&&!(process.platform!=='win32'&&executable==='gh'))return realExec(executable,args,options);
 try{reads++;assert.equal(options.cwd,project);assert.equal(options.windowsHide,true);assert.ok(options.timeout<=30000);assert.equal(options.env.GH_PROMPT_DISABLED,'1');assert.equal(options.env.GH_DEBUG,'');assert.ok(args.includes('--hostname'));assert.equal(args[args.indexOf('--hostname')+1],'github.com');const fields=fieldsOf(args);let result;
 if(args.includes('repos/owned/repo/pulls/12/files'))result=[{filename:path0,status:'modified',additions:1,deletions:1,sha:'c'.repeat(40),patch:'@@ -1 +1 @@\n-before\n+after',preview_limited:false}];
 else if(fields.query?.startsWith('mutation')){const body=fields.body==='@-'?input:fields.body;writes.push({query:fields.query,id:fields.id,body});if(fields.query.includes('resolveReviewThread'))threads[0].isResolved=true;if(fields.query.includes('unresolveReviewThread'))threads[0].isResolved=false;if(fields.query.includes('addPullRequestReviewThreadReply')){threads[0].comments.nodes.push({id:'PRRC_'+threads[0].comments.nodes.length,author:{login:'viewer'},body,createdAt:now});threads[0].comments.totalCount++;}result={data:{}};}
 else if(fields.query?.includes('query PhaseoPullRequestView(')){viewReads++;assert.equal(fields.number,'12');assert.equal(fields.owner,'owned');assert.equal(fields.name,'repo');if(failView){failView=false;throw Object.assign(Error('Owned initial view read failure'),{stderr:'gh: Owned initial view read failure (HTTP 502)'});}result=view();}
 else if(fields.query?.includes('query PhaseoFilesViewed(')){assert.equal(fields.number,'12');result={data:{repository:{pullRequest:{id:'PR_owned',files:{totalCount:1,pageInfo:{hasNextPage:false,endCursor:null},nodes:[{path:path0,viewerViewedState:'UNVIEWED'}]}}}}};}
 else if(fields.query?.includes('query PhaseoPullRequests(')){assert.equal(fields.owner,'owned');assert.equal(fields.name,'repo');result={data:{repository:{pullRequests:{nodes:[detail],pageInfo:{hasNextPage:false,endCursor:null}}}}};}
 else if(fields.query?.includes('query PhaseoPullRequest(')){assert.equal(fields.number,'12');result={data:{repository:{pullRequest:detail}}};}
 else throw Error('Unexpected owned gh call');return {stdout:JSON.stringify(result),stderr:''};
 }catch(error){if(!String(error).includes('Owned initial'))fixtureFailure=error;throw error;}
}
// Promisified reads and the callback form the write path uses (bodies arrive on stdin).
const wrapped=function(file,args,options,callback){if(typeof callback!=='function'||(file!==ownedGh&&!(process.platform!=='win32'&&file==='gh')))return originalExec(...arguments);let input='';const child={stdin:{on(){},end(value){input=value??'';ownedExecute(file,args,options,input).then(result=>callback(null,result.stdout,result.stderr),error=>callback(error,'',error.stderr??String(error)));}}};return child;};
wrapped[promisify.custom]=(file,args,options)=>ownedExecute(file,args,options);childProcess.execFile=wrapped;syncBuiltinESMExports();
const entry=process.argv.find(value=>value.startsWith('--app-entry='))?.slice(12),deadline=setTimeout(()=>app.exit(1),90000);await import(entry?pathToFileURL(path.resolve(entry)).href:'../dist/main/index.mjs');
app.whenReady().then(async()=>{try{
 const owner=BrowserWindow.getAllWindows()[0];owner.webContents.setBackgroundThrottling(false);if(owner.webContents.isLoading())await new Promise(resolve=>owner.webContents.once('did-finish-load',resolve));await installControlActions(owner);const run=code=>owner.webContents.executeJavaScript(code),wait=async code=>{for(let index=0;index<300;index++){const result=await run(code);if(result)return result;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Review workflow did not settle: '+code);};
 const pane='[aria-label="Pull request #12"]';
 const click=async(label,scope=pane)=>run(`(()=>{const button=Array.from(document.querySelectorAll(${JSON.stringify(scope+' button')})).find(button=>button.textContent.trim()===${JSON.stringify(label)});if(!button)throw Error('Missing button '+${JSON.stringify(label)});button.click()})()`);
 // Annotations may render in the diff's light or shadow DOM; look in both.
 const thread=`(()=>{for(const host of document.querySelectorAll('${pane} [data-pr-file]')){const found=host.querySelector('[data-thread-id="PRRT_0"]')??Array.from(host.querySelectorAll('*')).map(node=>node.shadowRoot?.querySelector('[data-thread-id="PRRT_0"]')).find(Boolean);if(found)return found;}return null;})()`;
 await run(`window.__auditOpenChat('project-chat')`);await run(`window.__auditPanel('Linked pull requests')`);await wait(`document.querySelector('section[aria-label="Pull requests"]')?.textContent.includes('No linked pull requests')`);
 await run(`document.querySelector('[aria-label="Show open pull requests"]').click()`);await wait(`document.querySelector('[data-pull-request-row="12"]')`);await run(`document.querySelector('[data-pull-request-row="12"] button').click()`);
 await wait(`document.querySelector('${pane} [role="alert"]')?.textContent.includes('Owned initial view read failure')`);await click('Retry');await wait(`document.querySelector('${pane}')?.textContent.includes('Owned pull request')`);
 assert.equal(await run(`document.querySelector('${pane} [role="alert"]')`),null);
 await click('Code');await wait(`document.querySelectorAll('${pane} [data-pr-file]').length===1&&document.querySelector('${pane} .review-diff')`);await wait(`Boolean(${thread})`);
 assert.equal(await run(`Boolean(window.reviewInjected||${thread}.querySelector('script'))`),false);assert.equal(await run(`${thread}.textContent.includes('Owned thread remark')&&${thread}.textContent.includes('ghost')`),true);
 const output=path.resolve('../../output/playwright/review-threads',entry?'packaged':'source');mkdirSync(output,{recursive:true});let captures=0;
 async function capture(state){for(const [width,height] of [[1440,920],[1180,800],[1040,680]])for(const theme of ['light','dark']){owner.setSize(width,height);await run(`window.__auditTheme(${JSON.stringify(theme)})`);await new Promise(resolve=>setTimeout(resolve,100));assert.equal(await run(`(()=>{const node=document.querySelector('${pane}');return node.scrollWidth<=node.clientWidth+1})()`),true);writeFileSync(path.join(output,`${state}-${theme}-${width}.png`),(await owner.webContents.capturePage()).toPNG());captures++;}}
 await capture('ready');
 await run(`Array.from(${thread}.querySelectorAll('button')).find(button=>button.textContent.trim()==='Reply').click()`);await wait(`${thread}.querySelector('textarea')`);
 await run(`(()=>{const field=${thread}.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Owned reply\\n--not-a-flag');field.dispatchEvent(new Event('input',{bubbles:true}))})()`);
 await run(`Array.from(${thread}.querySelectorAll('button')).find(button=>button.textContent.trim()==='Reply').click()`);await wait(`${thread}?.textContent.includes('3 comments')`);
 assert.deepEqual(writes.at(-1),{query:writes.at(-1).query,id:'PRRT_0',body:'Owned reply\n--not-a-flag'});assert.ok(writes.at(-1).query.includes('addPullRequestReviewThreadReply'));await capture('replied');
 await run(`Array.from(${thread}.querySelectorAll('button')).find(button=>button.textContent.trim()==='Resolve').click()`);await wait(`Array.from(${thread}?.querySelectorAll('button')??[]).some(button=>button.textContent.trim()==='Unresolve')`);assert.ok(writes.at(-1).query.includes('resolveReviewThread'));
 await run(`Array.from(${thread}.querySelectorAll('button')).find(button=>button.textContent.trim()==='Unresolve').click()`);await wait(`Array.from(${thread}?.querySelectorAll('button')??[]).some(button=>button.textContent.trim()==='Resolve')`);assert.ok(writes.at(-1).query.includes('unresolveReviewThread'));
 await run(`window.__auditOpenChat('personal-chat')`);await wait(`!document.querySelector('${pane}')`);
 const before=reads;for(const request of [{number:0,headOid:head,action:{type:'close'}},{number:12,headOid:head,action:{type:'reply',threadId:'invalid\nidentity',body:'x'}},{number:12,headOid:'short',action:{type:'resolve',threadId:'PRRT_0',resolved:true}}]){let rejected=false;try{await run(`window.phaseoDesktop.workspace.pullRequestAction('project',${JSON.stringify(request)})`);}catch{rejected=true;}assert.equal(rejected,true);}assert.equal(reads,before);
 let rejected=false;try{await ipcMain._invokeHandlers.get('workspace:pull-request-view')({sender:{id:-1}},'project',12);}catch{rejected=true;}assert.equal(rejected,true);assert.equal(reads,before);if(fixtureFailure)throw fixtureFailure;
 console.log('REVIEW_THREADS_SMOKE',JSON.stringify({productionAdapter:true,productionIpc:true,ownedCliReads:reads,viewReads,retry:true,inlineThreads:true,reply:true,resolve:true,unresolve:true,markdownIsolation:true,trustedSender:true,invalidBeforeNative:true,captures,githubWrites:writes.length,providerInferenceCalls:0,packaged:Boolean(entry)}));clearTimeout(deadline);childProcess.execFile=originalExec;syncBuiltinESMExports();app.quit();
}catch(error){console.error(error);clearTimeout(deadline);app.exit(1);}});
