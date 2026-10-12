import { describe, expect, it } from "vitest";
import { pullRequestPatchCoversChanges } from "./pullRequestPatchCoverage";
const file = {filename:"file.ts",status:"modified",blobOid:"a".repeat(40),preview:"available" as const,additions:1,deletions:1,patch:"@@ -1 +1 @@\n-before\n+after"};
describe("PR changed-line coverage",()=>{
 it("accepts valid changes and unchanged context across multiple hunks",()=>{expect(pullRequestPatchCoversChanges({...file,additions:2,patch:"@@ -1,2 +1,2 @@ heading\n context\n-before\n+after\n@@ -9,0 +10 @@\n+added\n"})).toBe(true);});
 it("recognizes absent sides and no-final-newline markers",()=>{expect(pullRequestPatchCoversChanges({...file,deletions:0,patch:"@@ -0,0 +1 @@\n+added\n\\ No newline at end of file"})).toBe(true);expect(pullRequestPatchCoversChanges({...file,additions:0,patch:"@@ -1 +0,0 @@\n-removed"})).toBe(true);});
 it("rejects missing changes even when the returned hunk is internally valid",()=>{expect(pullRequestPatchCoversChanges({...file,additions:2})).toBe(false);});
 it.each(["@@ -1,2 +1,2 @@\n-before\n+after","@@ -1 +1 @@\n-before\n+after\n+extra","@@ -1 +1 @@\n-before\n@@ -2 +2 @@\n-before\n+after","malformed","@@ -1,9007199254740992 +1 @@\n-before\n+after",undefined])("rejects truncated or unsupported hunks: %s",patch=>{expect(pullRequestPatchCoversChanges({...file,patch})).toBe(false);});
});
