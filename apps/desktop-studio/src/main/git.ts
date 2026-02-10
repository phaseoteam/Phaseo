import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import type { GitPatchApplyResult, GitStatusEntry } from "@shared/types";

function runGit(workspacePath: string, args: string[]) {
  return spawnSync("git", args, {
    cwd: workspacePath,
    encoding: "utf8"
  });
}

export function isGitRepository(workspacePath: string): boolean {
  const result = runGit(workspacePath, ["rev-parse", "--is-inside-work-tree"]);
  return result.status === 0 && result.stdout.trim() === "true";
}

export function parseGitStatusPorcelain(output: string): GitStatusEntry[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length >= 3)
    .map((line) => {
      const indexStatus = line[0] ?? " ";
      const workTreeStatus = line[1] ?? " ";
      const payload = line.slice(3).trim();

      if (payload.includes(" -> ")) {
        const [originalPath, path] = payload.split(" -> ");
        return {
          path: path ?? payload,
          originalPath,
          indexStatus,
          workTreeStatus
        };
      }

      return {
        path: payload,
        indexStatus,
        workTreeStatus
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function listGitStatus(workspacePath: string): GitStatusEntry[] {
  if (!isGitRepository(workspacePath)) {
    return [];
  }

  const result = runGit(workspacePath, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "Unable to read git status.").trim();
    throw new Error(details);
  }

  return parseGitStatusPorcelain(result.stdout);
}

export function getGitDiff(workspacePath: string, relativePath?: string): string {
  if (!isGitRepository(workspacePath)) {
    return "";
  }

  const args = ["diff", "--no-color", "HEAD"];
  if (relativePath && relativePath.trim()) {
    args.push("--", relativePath);
  }

  const result = runGit(workspacePath, args);
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "Unable to read git diff.").trim();
    throw new Error(details);
  }

  return result.stdout;
}

export function applyGitPatch(workspacePath: string, patch: string): GitPatchApplyResult {
  if (!isGitRepository(workspacePath)) {
    return {
      applied: false,
      output: "Not a git repository."
    };
  }

  if (!patch.trim()) {
    return {
      applied: false,
      output: "Patch content is empty."
    };
  }

  const patchTempDir = mkdtempSync(join(tmpdir(), "desktop-studio-patch-"));
  const patchFile = join(patchTempDir, "change.patch");

  try {
    writeFileSync(patchFile, patch, "utf8");
    const result = runGit(workspacePath, ["apply", "--whitespace=nowarn", patchFile]);

    if (result.status !== 0) {
      return {
        applied: false,
        output: (result.stderr || result.stdout || "Patch failed to apply.").trim()
      };
    }

    return {
      applied: true,
      output: "Patch applied successfully."
    };
  } finally {
    rmSync(patchTempDir, { recursive: true, force: true });
  }
}
