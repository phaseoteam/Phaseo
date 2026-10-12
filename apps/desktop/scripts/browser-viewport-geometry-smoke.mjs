import { app, BrowserWindow } from 'electron';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
const directory=process.argv.find(value=>value.startsWith('--profile='))?.slice(10);
const hostEntry=process.argv.find(value=>value.startsWith('--host='))?.slice(7);
if(!directory||!hostEntry)throw Error('Use the geometry audit runner');
app.setPath('userData',directory);
setTimeout(()=>{console.error('GEOMETRY_TIMEOUT');app.exit(1);},30000).unref();
const {BrowserHost}=await import(pathToFileURL(hostEntry).href);
const server=createServer((_request,response)=>{response.writeHead(200,{'Content-Type':'text/html'});response.end('<meta name="viewport" content="width=device-width, initial-scale=1"><title>Owned viewport</title>Owned preview');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
app.whenReady().then(async()=>{console.log("GEOMETRY_READY");
const owner=new BrowserWindow({width:1440,height:1100,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
owner.webContents.setBackgroundThrottling(false);
await owner.loadURL("data:text/html,<title>Owned host</title>");
const host=new BrowserHost();host.command(owner,{id:'owned',type:'show',bounds:{x:100,y:80,width:575,height:605}});host.command(owner,{id:'owned',type:'navigate',url:'http://127.0.0.1:'+server.address().port});
const view=owner.contentView.children[0];const page=view.webContents;page.setBackgroundThrottling(false);console.log("GEOMETRY_LOADING",page.getURL(),page.isLoading());
if(page.isLoading())await new Promise(resolve=>page.once('did-finish-load',resolve));
console.log("GEOMETRY_LOADED",page.getURL());const results=[];
try{
 for(const zoom of [1,1.25,1.5]){owner.webContents.setZoomFactor(zoom);
 for(const [mode,width,height] of [['phone',390,844],['phone-landscape',844,390],['tablet',768,1024],['tablet-landscape',1024,768]]){
  host.command(owner,{id:'owned',type:'viewport',viewport:mode});
  for(const [frameWidth,frameHeight] of [[376,605],[375,605],[575,605],[574,605],[489,601],[391,599],[392,600],[578,643]]){
   host.command(owner,{id:'owned',type:'show',bounds:{x:100,y:80,width:frameWidth,height:frameHeight}});
   await new Promise(resolve=>setTimeout(resolve,100));
   const actual=await page.executeJavaScript('({width:innerWidth,height:innerHeight,screenWidth:screen.width,screenHeight:screen.height})');
   
   const bounds=view.getBounds();const [ownerWidth,ownerHeight]=owner.getContentSize();const frame={x:Math.round(100*zoom),y:Math.round(80*zoom),width:Math.min(ownerWidth-Math.round(100*zoom),Math.round(frameWidth*zoom)),height:Math.min(ownerHeight-Math.round(80*zoom),Math.round(frameHeight*zoom))};const contained=bounds.x>=frame.x&&bounds.y>=frame.y&&bounds.x+bounds.width<=frame.x+frame.width&&bounds.y+bounds.height<=frame.y+frame.height;const centred=Math.abs(bounds.x-frame.x-(frame.width-bounds.width)/2)<=1&&Math.abs(bounds.y-frame.y-(frame.height-bounds.height)/2)<=1;
   results.push({zoom,mode,frameWidth,frameHeight,bounds,actual,expected:{width,height},contained,centred,passed:contained&&centred&&actual.width===width&&actual.height===height&&actual.screenWidth===width&&actual.screenHeight===height});
  }
 }
 }
 mkdirSync(path.resolve('../../output/playwright/browser-viewport'),{recursive:true});writeFileSync(path.resolve('../../output/playwright/browser-viewport/geometry.json'),JSON.stringify(results,null,2));
 console.log('NATIVE_VIEWPORT_GEOMETRY '+JSON.stringify({cases:results.length,failed:results.filter(value=>!value.passed)}));
 host.command(owner,{id:'owned',type:'close'});owner.destroy();server.close();app.exit(results.every(value=>value.passed)?0:1);
}catch(error){console.error(error);server.close();app.exit(1);}

}).catch(error=>{console.error(error);server.close();app.exit(1);});
