import type { PullRequestFile } from "../../shared/pullRequestFiles";

/** Checks changed-line coverage only; this does not establish full file/context availability. */
export function pullRequestPatchCoversChanges(file: PullRequestFile): boolean {
 if (!file.patch) return false;
 let additions = 0, deletions = 0, oldRemaining = 0, newRemaining = 0, hasHunk = false;
 for (const line of file.patch.split("\n")) {
  const hunk = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?:.*)$/.exec(line);
  if (hunk) {
   if (oldRemaining || newRemaining) return false;
   oldRemaining = hunk[1] === undefined ? 1 : Number(hunk[1]);
   newRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
   if (!Number.isSafeInteger(oldRemaining) || !Number.isSafeInteger(newRemaining)) return false;
   hasHunk = true;
  } else if (line === "\\ No newline at end of file") {
   if (!hasHunk) return false;
  } else if (line === "" && oldRemaining === 0 && newRemaining === 0) {
   // A trailing line terminator is not a context line.
  } else {
   if (!hasHunk) return false;
   if (line.startsWith("+")) { additions++; newRemaining--; }
   else if (line.startsWith("-")) { deletions++; oldRemaining--; }
   else if (line.startsWith(" ")) { oldRemaining--; newRemaining--; }
   else return false;
   if (oldRemaining < 0 || newRemaining < 0) return false;
  }
 }
 return hasHunk && oldRemaining === 0 && newRemaining === 0 && additions === file.additions && deletions === file.deletions;
}
