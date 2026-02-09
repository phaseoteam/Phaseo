import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { nanoid } from "nanoid";
import type { CommandOutputChunk, CommandRun, CommandRunRequest } from "@shared/types";

const BLOCKED_PATTERNS = [
  /(^|\s)rm\s+-rf(\s|$)/i,
  /(^|\s)del\s+\/s(\s|$)/i,
  /(^|\s)shutdown(\s|$)/i,
  /(^|\s)reboot(\s|$)/i,
  /(^|\s)format(\s|$)/i,
  /git\s+reset\s+--hard/i,
  /(^|\s)mkfs(\s|$)/i,
  /(^|\s)diskpart(\s|$)/i
];

function nowIso(): string {
  return new Date().toISOString();
}

export function validateCommand(command: string): void {
  const normalized = command.trim();
  if (!normalized) {
    throw new Error("Command cannot be empty.");
  }

  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new Error("Command blocked by safety policy.");
  }
}

export class CommandRunner {
  private readonly runs = new Map<string, ChildProcessWithoutNullStreams>();

  run(
    request: CommandRunRequest,
    onOutput: (event: CommandOutputChunk) => void,
    onDone: (run: CommandRun) => void
  ): CommandRun {
    validateCommand(request.command);

    const run: CommandRun = {
      id: nanoid(),
      command: request.command,
      workspacePath: request.workspacePath,
      startedAt: nowIso()
    };

    const child =
      process.platform === "win32"
        ? spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", request.command], {
            cwd: request.workspacePath,
            env: process.env
          })
        : spawn("/bin/bash", ["-lc", request.command], {
            cwd: request.workspacePath,
            env: process.env
          });

    this.runs.set(run.id, child);

    child.stdout.on("data", (buffer) => {
      onOutput({
        runId: run.id,
        stream: "stdout",
        chunk: buffer.toString("utf8"),
        at: nowIso()
      });
    });

    child.stderr.on("data", (buffer) => {
      onOutput({
        runId: run.id,
        stream: "stderr",
        chunk: buffer.toString("utf8"),
        at: nowIso()
      });
    });

    child.on("close", (code) => {
      this.runs.delete(run.id);
      onDone({
        ...run,
        exitCode: code ?? 0,
        finishedAt: nowIso()
      });
    });

    child.on("error", (error) => {
      this.runs.delete(run.id);
      onOutput({
        runId: run.id,
        stream: "stderr",
        chunk: `${error.message}\n`,
        at: nowIso()
      });
      onDone({
        ...run,
        exitCode: 1,
        finishedAt: nowIso()
      });
    });

    return run;
  }

  stop(runId: string): void {
    const proc = this.runs.get(runId);
    if (!proc) {
      return;
    }

    if (process.platform === "win32") {
      proc.kill();
    } else {
      proc.kill("SIGTERM");
    }

    this.runs.delete(runId);
  }
}
