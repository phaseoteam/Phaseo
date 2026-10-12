import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "./workspaceStore";
import { handoffPrompt } from "./handoffPrompt";
import { validateCommand } from "../shared/workspace";

describe("cross-harness handoff", () => {
	it("copies visible conversation without carrying account credentials or native session state", () => {
		const store = new WorkspaceStore(":memory:");
		try {
			const source = store.apply({ type: "create-task", harness: "codex", mode: "chat", model: "default" });
			source.messages = [{ id: "message", role: "user", text: "Prior context", createdAt: "" }]; source.nativeSessionId = "native"; source.status = "completed"; store.saveTask(source);
			const handoff = store.apply(validateCommand({ type: "handoff", id: source.id, harness: "claude", mode: "chat", model: "default" }) as { type: "handoff"; id: string; harness: "claude"; mode: "chat"; model: string });
			expect(handoff.messages).toEqual(source.messages); expect(handoff.handoffFrom).toBe("codex"); expect(handoff.parentId).toBe(source.id);
			expect(handoff.nativeSessionId).toBeUndefined(); expect(handoff.nativeForkFrom).toBeUndefined(); expect(handoff.accountId).toBeUndefined();
			handoff.messages.push({ id: "next", role: "user", text: "Continue", createdAt: "" });
			expect(handoffPrompt(handoff, "Continue")).toContain("user: Prior context");
			expect(handoffPrompt({ ...handoff, nativeSessionId: "new-native" }, "Continue")).toBe("Continue");
			expect(handoffPrompt({ ...handoff, harness: "phaseo" }, "Continue")).toBe("Continue");
			expect(store.getTask(source.id).messages).toHaveLength(1);
			source.status = "running"; store.saveTask(source);
			expect(() => store.apply({ type: "handoff", id: source.id, harness: "claude", mode: "chat", model: "default" })).toThrow("Stop");
		} finally { store.close(); }
	});
});
