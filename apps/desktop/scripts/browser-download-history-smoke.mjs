import { app, BrowserWindow, webContents } from 'electron';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const profile=process.argv.find(value=>value.startsWith('--profile='))?.slice(10);
const stage=process.argv.find(value=>value.startsWith('--stage='))?.slice(8);
if(!profile||!['write','read','removed'].includes(stage))throw Error('Expected owned profile and stage');
app.setPath('userData',profile);
const entry=process.argv.find(value=>value.startsWith('--app-entry='))?.slice(12);
let server;
if(stage==='write'){server=createServer((request,response)=>{if(request.url==='/file'){response.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="history.txt"'});response.end('Owned restart download');}else{response.writeHead(200,{'Content-Type':'text/html'});response.end('<title>Owned restart page</title>Owned download history');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));}
await import(entry?pathToFileURL(path.resolve(entry)).href:'../dist/main/index.mjs');
app.whenReady().then(async()=>{
 const owner=BrowserWindow.getAllWindows()[0];
 const run=code=>owner.webContents.executeJavaScript(code);
 const wait=async code=>{for(let attempt=0;!await run(code);attempt++){if(attempt>150)throw Error('Did not settle '+code);await new Promise(resolve=>setTimeout(resolve,30));}};
 try{
  if(owner.webContents.isLoading())await new Promise(resolve=>owner.webContents.once('did-finish-load',resolve));
  await wait(`Boolean(document.querySelector('.task-list'))`);
  await run(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Tools').click()`);
  await wait(`Boolean(document.querySelector('.browser-download-toolbar'))`);
  if(stage==='write'){
   const address='http://127.0.0.1:'+server.address().port;
   await run(`window.phaseoDesktop.browser({id:'draft',type:'navigate',url:${JSON.stringify(address)}})`);
   let browser;for(let attempt=0;attempt<150;attempt++){browser=webContents.getAllWebContents().find(value=>value.getURL()===address+'/'&&!value.isLoading());if(browser)break;await new Promise(resolve=>setTimeout(resolve,30));}if(!browser)throw Error('Owned browser unavailable');
   browser.session.once('will-download',(_event,item)=>item.setSavePath(path.join(profile,'history.txt')));
   browser.downloadURL(address+'/file');
   await wait(`window.phaseoDesktop.browserDownload({type:'list'}).then(values=>values.length===1&&values[0].status==='completed')`);
  }
  await run(`document.querySelector('.browser-download-toolbar button').click()`);
  if(stage==='removed'){await wait(`document.querySelector('.browser-downloads')?.textContent.includes('No downloads in this chat.')`);if(!await run(`window.phaseoDesktop.browserDownload({type:'list'}).then(values=>values.length===0)`))throw Error('Removed record returned after restart');}
  else{
   await wait(`document.querySelector('.browser-downloads')?.textContent.includes('history.txt')&&document.querySelector('.browser-downloads')?.textContent.includes('Completed')`);
   const records=await run(`window.phaseoDesktop.browserDownload({type:'list'})`);
   if(records.length!==1||records[0].path!==path.join(profile,'history.txt')||records[0].sourceId!=='draft'||readFileSync(records[0].path,'utf8')!=='Owned restart download')throw Error('Restart changed download metadata or bytes');
   if(stage==='read'){await run(`Array.from(document.querySelectorAll('.browser-downloads button')).find(button=>button.textContent==='Remove').click()`);await wait(`window.phaseoDesktop.browserDownload({type:'list'}).then(values=>values.length===0)`);}
  }
  if(!existsSync(path.join(profile,'history.txt')))throw Error('Metadata removal deleted the file');
  console.log('DOWNLOAD_HISTORY_STAGE '+JSON.stringify({stage,profile,completed:true}));server?.close();app.quit();
 }catch(error){console.error(error);server?.close();app.exit(1);}
});
process.on('unhandledRejection',error=>{console.error(error);server?.close();app.exit(1);});
setTimeout(()=>{console.error('Download history stage timeout');server?.close();app.exit(1);},30000).unref();
