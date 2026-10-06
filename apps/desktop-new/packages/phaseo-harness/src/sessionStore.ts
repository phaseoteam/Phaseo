import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import type { AgentMessage } from "@phaseo/agent-sdk";
import type { HarnessResult } from "./runner.js";

export type HarnessSession = {
  version: 1;
  id: string;
  cwd: string;
  model: string;
  mode: "default" | "plan";
  messages: AgentMessage[];
  result?: HarnessResult;
};

/** Session state belongs to Phaseo, not the SDK or the UI's loaded message window. */
export class HarnessSessionStore {
  constructor(private readonly directory: string) {}
  private filename(id: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))
      throw new Error("Invalid Phaseo session.");
    return NodePath.join(this.directory, `${id}.json`);
  }
  async load(id: string): Promise<HarnessSession> {
    const filename = this.filename(id);
    const stat = await NodeFSP.stat(filename);
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024)
      throw new Error("Phaseo session state exceeds its supported size.");
    const value = JSON.parse(await NodeFSP.readFile(filename, "utf8")) as HarnessSession;
    if (
      value.version !== 1 ||
      value.id !== id ||
      typeof value.cwd !== "string" ||
      typeof value.model !== "string" ||
      !["default", "plan"].includes(value.mode) ||
      !Array.isArray(value.messages)
    )
      throw new Error("Invalid Phaseo session state.");
    return value;
  }
  async save(session: HarnessSession) {
    const filename = this.filename(session.id);
    const json = JSON.stringify(session);
    if (Buffer.byteLength(json) > 64 * 1024 * 1024)
      throw new Error("Phaseo session state exceeds its supported size.");
    await NodeFSP.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${filename}.${NodeCrypto.randomUUID()}.tmp`;
    try {
      await NodeFSP.writeFile(temporary, json, { mode: 0o600, flag: "wx" });
      await NodeFSP.rename(temporary, filename);
    } finally {
      await NodeFSP.rm(temporary, { force: true });
    }
  }
}
