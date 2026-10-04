import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveNativeCommand } from "./nativeProcess";
import { projectPullRequest } from "./projectPullRequests";
import { validatePullRequestFilesQuery, type PullRequestFile, type PullRequestFilesPage } from "../shared/pullRequestFiles";
const execute=promisify(execFile);
const fileProjection="reduce .[] as $file ({budget:1000000,files:[]}; ($file.patch // \"\") as $patch | ($patch|length) as $length | ($length > 0 and $length <= 200000 and $length <= .budget) as $include | .files += [{filename:$file.filename,previous_filename:$file.previous_filename,status:$file.status,additions:$file.additions,deletions:$file.deletions,sha:$file.sha,patch:(if $include then $patch else null end),preview_limited:($length > 0 and ($include|not))}] | .budget -= (if $include then $length else 0 end)) | .files";
export function parsePullRequestFiles(value: unknown): PullRequestFile[] {
 if(!Array.isArray(value)||value.length>100)throw Error("GitHub returned invalid changed files.");const seen=new Set<string>();let budget=1000000;
 return value.map(entry=>{const item=entry&&typeof entry==="object"?entry as Record<string,unknown>:{};
 const validPath=(value:unknown)=>typeof value==="string"&&value.length>0&&value.length<=4096&&!value.includes("\0");
 if(!validPath(item.filename)||seen.has(String(item.filename))||(item.previous_filename!==undefined&&item.previous_filename!==null&&!validPath(item.previous_filename))||!["added","removed","modified","renamed","copied","changed","unchanged"].includes(String(item.status))||(item.preview_limited!==undefined&&typeof item.preview_limited!=="boolean")||[item.additions,item.deletions].some(value=>!Number.isSafeInteger(value)||Number(value)<0)||typeof item.sha!=="string"||!/^[a-f0-9]{40}$/i.test(item.sha)||(item.patch!==undefined&&item.patch!==null&&typeof item.patch!=="string"))throw Error("GitHub returned invalid changed files.");seen.add(String(item.filename));
 const patch=typeof item.patch==="string"&&item.patch.length?item.patch:undefined;const available=patch!==undefined&&patch.length<=200000&&patch.length<=budget;if(available)budget-=patch.length;
 return {filename:String(item.filename),previousFilename:typeof item.previous_filename==="string"?item.previous_filename:undefined,status:String(item.status),additions:Number(item.additions),deletions:Number(item.deletions),blobOid:item.sha,patch:available?patch:undefined,preview:available?"available":patch||item.preview_limited?"too-large":"unavailable"};
 });
}
export async function projectPullRequestFiles(root: string, value: unknown): Promise<PullRequestFilesPage> {
 const query=validatePullRequestFilesQuery(value);const before=await projectPullRequest(root,query.number);
 const current=()=>before.headOid===query.headOid&&before.baseOid===query.baseOid;
 if(!current())throw Error("This pull request changed. Refresh details before reviewing files.");
 const cap=Math.min(before.changedFiles,3000);if(query.page>Math.max(1,Math.ceil(cap/100)))throw Error("This file page is no longer available.");
 let command: Awaited<ReturnType<typeof resolveNativeCommand>>;try{command=await resolveNativeCommand("gh");}catch{throw Error("Install GitHub CLI and sign in with gh auth login.");}let output:string;
 try{output=(await execute(command.executable,[...command.prefix,"api","--hostname","github.com","--method","GET",`repos/${before.repository}/pulls/${query.number}/files`,"-F","per_page=100","-F",`page=${query.page}`,"--jq",fileProjection],{cwd:root,windowsHide:true,timeout:20000,maxBuffer:8*1024*1024,env:{...process.env,GH_PROMPT_DISABLED:"1",GH_DEBUG:""}})).stdout;}catch{throw Error("Could not load changed files. Check GitHub CLI sign-in and repository access, then retry.");}
 let parsed:unknown;try{parsed=JSON.parse(output);}catch{throw Error("GitHub returned unreadable changed files.");}const files=parsePullRequestFiles(parsed);
 const expected=Math.max(0,Math.min(100,cap-(query.page-1)*100));if(files.length!==expected)throw Error("GitHub returned an incomplete changed-file page.");
 const after=await projectPullRequest(root,query.number);if(after.repository!==before.repository||after.headOid!==query.headOid||after.baseOid!==query.baseOid||after.changedFiles!==before.changedFiles)throw Error("This pull request changed while files loaded. Refresh details before reviewing files.");
 return {repository:before.repository,...query,total:before.changedFiles,files,hasNext:query.page*100<cap,limitReached:before.changedFiles>3000};
}
