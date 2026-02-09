import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, normalize, relative, resolve } from "node:path";
import { dialog } from "electron";
import type { WorkspaceFile } from "@shared/types";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".turbo", ".idea", ".vscode"]);

function ensureInWorkspace(workspacePath: string, relativePath: string): string {
  const absoluteWorkspace = resolve(workspacePath);
  const absoluteFile = resolve(workspacePath, relativePath);
  const relativeToWorkspace = relative(absoluteWorkspace, absoluteFile);

  if (relativeToWorkspace.startsWith("..") || relativeToWorkspace.includes(`..${normalize("/")}`)) {
    throw new Error("Path escapes workspace boundary");
  }

  return absoluteFile;
}

export async function pickWorkspaceFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory", "promptToCreate"],
    title: "Select a workspace folder"
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0] ?? null;
}

export function listWorkspaceFiles(workspacePath: string, maxFiles = 3000): WorkspaceFile[] {
  const root = resolve(workspacePath);
  const output: WorkspaceFile[] = [];

  const walk = (currentDir: string): void => {
    if (output.length >= maxFiles) {
      return;
    }

    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (output.length >= maxFiles) {
        break;
      }

      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const absolutePath = join(currentDir, entry.name);
      const rel = relative(root, absolutePath).replace(/\\/g, "/");

      output.push({
        path: rel,
        name: entry.name,
        isDirectory: entry.isDirectory()
      });

      if (entry.isDirectory()) {
        walk(absolutePath);
      }
    }
  };

  walk(root);

  return output.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }

    return a.path.localeCompare(b.path);
  });
}

export function readWorkspaceFile(workspacePath: string, relativePath: string): string {
  const absoluteFile = ensureInWorkspace(workspacePath, relativePath);
  const stats = statSync(absoluteFile);
  if (!stats.isFile()) {
    throw new Error("Target path is not a file");
  }

  return readFileSync(absoluteFile, "utf8");
}

export function writeWorkspaceFile(workspacePath: string, relativePath: string, content: string): void {
  const absoluteFile = ensureInWorkspace(workspacePath, relativePath);
  writeFileSync(absoluteFile, content, "utf8");
}
