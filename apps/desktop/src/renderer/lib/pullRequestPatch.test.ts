import { describe, expect, it } from "vitest";
import { pullRequestPatch } from "./pullRequestPatch";
import { parseReviewPatch } from "../components/diffRendering";
const file={filename:"src/owned.ts",status:"modified",additions:1,deletions:1,blobOid:"a".repeat(40),patch:"@@ -1 +1 @@\n-before\n+after",preview:"available" as const};
describe("PR patch presentation",()=>{
 it("wraps native hunks for the existing viewer without altering copy source",()=>{const patch=pullRequestPatch(file)!;expect(patch).toContain(file.patch);expect(parseReviewPatch(patch)).toHaveLength(1);});
 it("keeps rename names and quotes special path characters inert",()=>{const patch=pullRequestPatch({...file,filename:'new "file".ts',previousFilename:"old.ts",status:"renamed"})!;expect(patch).toContain(JSON.stringify('b/new "file".ts'));expect(patch).toContain(JSON.stringify("a/old.ts"));});
 it("uses absent-side headers for additions/removals and leaves unavailable patches absent",()=>{expect(pullRequestPatch({...file,status:"added"})).toContain("--- /dev/null");expect(pullRequestPatch({...file,status:"removed"})).toContain("+++ /dev/null");expect(pullRequestPatch({...file,patch:undefined})).toBeUndefined();});
});
