import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { killTree, OWN_GROUP } from "./kill";

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

describe("killTree", () => {
	// Windows ends the tree with taskkill /T; off Windows it's the agent's process group.
	it.skipIf(process.platform === "win32")("ends what the agent's shell started, not just the shell", async () => {
		const child = spawn("sleep 30 & echo $!; wait", { shell: true, ...OWN_GROUP });
		const grandchild = await new Promise<number>((resolve) => child.stdout.once("data", (data: Buffer) => resolve(Number(String(data).trim()))));
		expect(alive(grandchild)).toBe(true);
		const exited = new Promise((resolve) => child.once("exit", resolve));
		killTree(child);
		await exited;
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(alive(grandchild)).toBe(false);
	});
});
