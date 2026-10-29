import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveNativeCommand } from "./nativeProcess";
import { projectPullRequest } from "./projectPullRequests";
import { validatePullRequestFilesQuery, validateSetFilesViewed, type PullRequestFile, type PullRequestFilesPage, type PullRequestFilesQuery, type PullRequestFilesViewed, type PullRequestFileViewedState } from "../shared/pullRequestFiles";
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
 const query=validatePullRequestFilesQuery(value);if(query.commit)return commitFiles(root,{...query,commit:query.commit});const before=await projectPullRequest(root,query.number);
 const current=()=>before.headOid===query.headOid&&before.baseOid===query.baseOid;
 if(!current())throw Error("This pull request changed. Details will update automatically.");
 const cap=Math.min(before.changedFiles,3000);if(query.page>Math.max(1,Math.ceil(cap/100)))throw Error("This file page is no longer available.");
 let command: Awaited<ReturnType<typeof resolveNativeCommand>>;try{command=await resolveNativeCommand("gh");}catch{throw Error("Install GitHub CLI and sign in with gh auth login.");}let output:string;
 try{output=(await execute(command.executable,[...command.prefix,"api","--hostname","github.com","--method","GET",`repos/${before.repository}/pulls/${query.number}/files`,"-F","per_page=100","-F",`page=${query.page}`,"--jq",fileProjection],{cwd:root,windowsHide:true,timeout:20000,maxBuffer:8*1024*1024,env:{...process.env,GH_PROMPT_DISABLED:"1",GH_DEBUG:""}})).stdout;}catch{throw Error("Could not load changed files. Check GitHub CLI sign-in and repository access, then retry.");}
 let parsed:unknown;try{parsed=JSON.parse(output);}catch{throw Error("GitHub returned unreadable changed files.");}const files=parsePullRequestFiles(parsed);
 const expected=Math.max(0,Math.min(100,cap-(query.page-1)*100));if(files.length!==expected)throw Error("GitHub returned an incomplete changed-file page.");
 const after=await projectPullRequest(root,query.number);if(after.repository!==before.repository||after.headOid!==query.headOid||after.baseOid!==query.baseOid||after.changedFiles!==before.changedFiles)throw Error("This pull request changed while files loaded. Details will update automatically.");
 return {repository:before.repository,...query,total:before.changedFiles,files,hasNext:query.page*100<cap,limitReached:before.changedFiles>3000};
}

async function gh(root: string, args: string[], failure: string) {
 let command: Awaited<ReturnType<typeof resolveNativeCommand>>;try{command=await resolveNativeCommand("gh");}catch{throw Error("Install GitHub CLI and sign in with gh auth login.");}
 try{return (await execute(command.executable,[...command.prefix,...args],{cwd:root,windowsHide:true,timeout:20000,maxBuffer:8*1024*1024,env:{...process.env,GH_PROMPT_DISABLED:"1",GH_DEBUG:""}})).stdout;}catch{throw Error(failure);}
}
/** One commit's own changes, a page of 100 at a time. GitHub does not say how many there are, so a full page means there may be more. */
async function commitFiles(root: string, query: PullRequestFilesQuery & { commit: string }): Promise<PullRequestFilesPage> {
 const before=await projectPullRequest(root,query.number);
 if(before.headOid!==query.headOid||before.baseOid!==query.baseOid)throw Error("This pull request changed. Details will update automatically.");
 const output=await gh(root,["api","--hostname","github.com","--method","GET",`repos/${before.repository}/commits/${query.commit}`,"-F","per_page=100","-F",`page=${query.page}`,"--jq",`.files | ${fileProjection}`],"Could not load this commit's changes. Check GitHub CLI sign-in and repository access, then retry.");
 let parsed:unknown;try{parsed=JSON.parse(output);}catch{throw Error("GitHub returned unreadable changed files.");}const files=parsePullRequestFiles(parsed);
 const hasNext=files.length===100&&query.page<30;
 return {repository:before.repository,...query,total:(query.page-1)*100+files.length+(hasNext?1:0),files,hasNext,limitReached:false};
}

const viewedQuery="query PhaseoFilesViewed($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){id files(first:100,after:$after){totalCount pageInfo{hasNextPage endCursor} nodes{path viewerViewedState}}}}}";
const viewedStates:Record<string,PullRequestFileViewedState>={VIEWED:"viewed",UNVIEWED:"unviewed",DISMISSED:"dismissed"};
/** Ten pages at most: past a thousand files the count is marked short rather than read for ever. */
export function parseFilesViewedPage(value: unknown): { id: string; files: PullRequestFilesViewed["files"]; total: number; next?: string } {
 const pull=((value as {data?:{repository?:{pullRequest?:Record<string,unknown>}}})?.data?.repository?.pullRequest)??{};const connection=(pull.files??{}) as {totalCount?:unknown;pageInfo?:{hasNextPage?:unknown;endCursor?:unknown};nodes?:unknown};
 if(typeof pull.id!=="string"||!Array.isArray(connection.nodes)||!Number.isSafeInteger(connection.totalCount))throw Error("GitHub returned unreadable viewed files.");
 const files=connection.nodes.flatMap(entry=>{const node=(entry??{}) as {path?:unknown;viewerViewedState?:unknown};const state=viewedStates[String(node.viewerViewedState)];return typeof node.path==="string"&&node.path.length<=4096&&state?[{path:node.path,state}]:[];});
 const next=connection.pageInfo?.hasNextPage===true&&typeof connection.pageInfo.endCursor==="string"&&connection.pageInfo.endCursor.length<=2048?connection.pageInfo.endCursor:undefined;
 return {id:pull.id,files,total:Number(connection.totalCount),...(next?{next}:{})};
}
async function repositoryAndNumber(root: string, number: unknown) {
 if(!Number.isSafeInteger(number)||Number(number)<1||Number(number)>2147483647)throw Error("Invalid pull-request number.");
 const details=await projectPullRequest(root,Number(number));return {repository:details.repository,number:Number(number)};
}
export async function projectPullRequestFilesViewed(root: string, number: unknown): Promise<PullRequestFilesViewed> {
 const {repository}=await repositoryAndNumber(root,number);const [owner,name]=repository.split("/");
 const files:PullRequestFilesViewed["files"]=[];let after:string|undefined,total=0;
 for(let page=0;page<10;page++){
  const output=await gh(root,["api","graphql","--hostname","github.com","-f",`query=${viewedQuery}`,"-F",`owner=${owner}`,"-F",`name=${name}`,"-F",`number=${number}`,...(after?["-f",`after=${after}`]:[])],"Your viewed files could not be read from GitHub.");
  let parsed:unknown;try{parsed=JSON.parse(output);}catch{throw Error("GitHub returned unreadable viewed files.");}
  const result=parseFilesViewedPage(parsed);files.push(...result.files);total=result.total;after=result.next;if(!after)break;
 }
 return {files,truncated:files.length<total};
}
/** One request for a whole batch of ticks: each path is its own aliased mutation. */
export async function projectSetPullRequestFilesViewed(root: string, value: unknown): Promise<void> {
 const request=validateSetFilesViewed(value);const {repository}=await repositoryAndNumber(root,request.number);const [owner,name]=repository.split("/");
 const idOutput=await gh(root,["api","graphql","--hostname","github.com","-f","query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){id}}}","-F",`owner=${owner}`,"-F",`name=${name}`,"-F",`number=${request.number}`],"Could not update viewed files.");
 let id:unknown;try{id=JSON.parse(idOutput)?.data?.repository?.pullRequest?.id;}catch{/* Checked below. */}
 if(typeof id!=="string"||!/^[A-Za-z0-9_+=/-]{1,200}$/.test(id))throw Error("Could not update viewed files.");
 const variables=request.files.map((_,index)=>`$p${index}:String!`).join(",");
 const fields=request.files.map((file,index)=>`f${index}:${file.viewed?"markFileAsViewed":"unmarkFileAsViewed"}(input:{pullRequestId:$id,path:$p${index}}){clientMutationId}`).join(" ");
 await gh(root,["api","graphql","--hostname","github.com","-f",`query=mutation($id:ID!,${variables}){${fields}}`,"-f",`id=${id}`,...request.files.flatMap((file,index)=>["-f",`p${index}=${file.path}`])],"Could not update viewed files.");
}
