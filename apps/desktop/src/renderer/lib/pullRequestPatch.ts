import type { PullRequestFile } from "../../shared/pullRequestFiles";
export function pullRequestPatch(file: PullRequestFile): string | undefined {
 if(!file.patch)return;const before="a/"+(file.previousFilename??file.filename),after="b/"+file.filename;
 return "diff --git "+JSON.stringify(before)+" "+JSON.stringify(after)+"\n--- "+(file.status==="added"?"/dev/null":JSON.stringify(before))+"\n+++ "+(file.status==="removed"?"/dev/null":JSON.stringify(after))+"\n"+file.patch+"\n";
}
