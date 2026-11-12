import electron from 'electron';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const profile=mkdtempSync(path.join(tmpdir(),'phaseo-native-download-history-'));
const entry=process.argv.find(value=>value.startsWith('--app-entry='));
for(const stage of ['write','read','removed']){
 const result=spawnSync(electron,['scripts/browser-download-history-smoke.mjs','--profile='+profile,'--stage='+stage,...(entry?[entry]:[])],{stdio:'inherit',timeout:45000});
 if(result.error||result.status!==0)throw result.error??Error('Download history stage failed: '+stage+' ('+result.status+')');
}
console.log('DOWNLOAD_HISTORY_AUDIT '+JSON.stringify({profile,processRestarts:2,nativeDownload:true,retainedMetadata:true,removedMetadata:true,savedBytes:true}));
