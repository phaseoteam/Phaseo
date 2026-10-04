import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { resolveNativeCommand } from "./nativeProcess";
import { projectPullRequestFiles } from "./projectPullRequestFiles";
import { projectPullRequest } from "./projectPullRequests";
import { validatePullRequestFilesQuery } from "../shared/pullRequestFiles";
import type { PullRequestContents } from "../shared/pullRequestContents";
const execute=promisify(execFile);
const metadataQuery='query PhaseoPRBlob($owner:String!,$name:String!,$expression:String!){repository(owner:$owner,name:$name){object(expression:$expression){__typename ... on Blob{oid byteSize isBinary}}}}';
const oidPattern=/^[a-f0-9]{40}$/i;
export function decodePullRequestBlob(value:unknown, oid:string, size:number):string {
 if(!Number.isSafeInteger(size)||size<0||size>1024*1024)throw Error("Full context supports files up to 1 MB and 10,000 lines.");
 const blob=value as {sha?:unknown;size?:unknown;encoding?:unknown;content?:unknown}|null;
 if(!blob||blob.sha!==oid||blob.size!==size||blob.encoding!=="base64"||typeof blob.content!=="string")throw Error("GitHub returned invalid file contents.");
 const encoded=blob.content.replace(/\n/g,"");
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)||encoded.length>1400000)throw Error("GitHub returned invalid file encoding.");
 const bytes=Buffer.from(encoded,"base64");
 if(bytes.length!==size||createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")!==oid)throw Error("GitHub file contents do not match the reviewed blob.");
 if(bytes.includes(0))throw Error("Full context requires UTF-8 text files.");
 let text:string;try{text=new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw Error("Full context requires UTF-8 text files.");}
 if(text.split("\n").length>10000)throw Error("Full context supports files up to 1 MB and 10,000 lines.");return text;
}
export async function projectPullRequestContents(root:string,value:unknown):Promise<PullRequestContents> {
 const query=validatePullRequestFilesQuery(value);const filename=(value as {filename?:unknown}).filename;
 if(typeof filename!=="string"||!filename.length||filename.length>4096||filename.includes("\0"))throw Error("Invalid pull-request file request.");
 const page=await projectPullRequestFiles(root,query);const file=page.files.find(file=>file.filename===filename);
 if(!file)throw Error("This file is not in the confirmed pull-request page.");
 const command=await resolveNativeCommand("gh");
 async function api(args:string[]):Promise<unknown>{let output:string;try{output=(await execute(command.executable,[...command.prefix,"api","--hostname","github.com",...args],{cwd:root,windowsHide:true,timeout:20000,maxBuffer:2*1024*1024,env:{...process.env,GH_PROMPT_DISABLED:"1",GH_DEBUG:""}})).stdout;}catch{throw Error("Could not load full file context. Check GitHub CLI sign-in and repository access, then retry.");}try{return JSON.parse(output);}catch{throw Error("GitHub returned unreadable file context.");}}
 const comparison=await api(["--method","GET",`repos/${page.repository}/compare/${query.baseOid}...${query.headOid}`,"--jq","{oid:.merge_base_commit.sha}"]) as {oid?:unknown}|null;
 const mergeBase=comparison?.oid;
 if(typeof mergeBase!=="string"||!oidPattern.test(mergeBase))throw Error("GitHub did not confirm the pull-request merge base.");
 const [owner,name]=page.repository.split("/");
 async function contents(revision:string,path:string,expectedOid?:string){
  const response=await api(["graphql","-f",`query=${metadataQuery}`,"-F",`owner=${owner}`,"-F",`name=${name}`,"-f",`expression=${revision}:${path}`]) as {errors?:unknown[];data?:{repository?:{object?:{__typename?:unknown;oid?:unknown;byteSize?:unknown;isBinary?:unknown}}}}|null;
  const blob=response?.data?.repository?.object;
  if(response?.errors?.length||!blob||blob.__typename!=="Blob"||typeof blob.oid!=="string"||!oidPattern.test(blob.oid)||!Number.isSafeInteger(blob.byteSize)||Number(blob.byteSize)<0||typeof blob.isBinary!=="boolean")throw Error("GitHub could not confirm this file at the reviewed commit.");
  if(expectedOid&&blob.oid!==expectedOid)throw Error("This file does not match the reviewed blob.");
  if(blob.isBinary)throw Error("Full context requires UTF-8 text files.");
  if(Number(blob.byteSize)>1024*1024)throw Error("Full context supports files up to 1 MB and 10,000 lines.");
  const value=await api(["--method","GET",`repos/${page.repository}/git/blobs/${blob.oid}`,"--jq","{sha,size,encoding,content}"]);
  return {name:path,contents:decodePullRequestBlob(value,blob.oid,Number(blob.byteSize))};
 }
 const oldFile=file.status==="added"?null:await contents(mergeBase,file.previousFilename??file.filename,file.status==="removed"?file.blobOid:undefined);
 const newFile=file.status==="removed"?null:await contents(query.headOid,file.filename,file.blobOid);
 const after=await projectPullRequest(root,query.number);
 if(after.repository!==page.repository||after.headOid!==query.headOid||after.baseOid!==query.baseOid)throw Error("This pull request changed while context loaded. Refresh details before reviewing files.");
 return {mergeBaseOid:mergeBase,headOid:query.headOid,oldFile,newFile};
}
