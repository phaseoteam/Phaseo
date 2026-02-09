import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { StudioStore } from "../src/main/store";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("StudioStore", () => {
  it("persists sessions and messages", () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-store-test-"));
    tempDirs.push(dir);

    const store = new StudioStore(dir);
    const session = store.createSession("chat");
    store.addMessage(session.id, "user", "hello");

    const reloaded = new StudioStore(dir);
    const boot = reloaded.bootstrap();

    expect(boot.sessions.length).toBe(1);
    expect(boot.sessions[0]?.id).toBe(session.id);

    const messages = reloaded.listMessages(session.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe("hello");
  });
});
