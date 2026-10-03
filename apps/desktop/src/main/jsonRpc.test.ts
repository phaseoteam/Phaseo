import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { JsonRpc } from "./jsonRpc";

describe("native agent transport", () => {
	it("closes a failed server-request response without an unhandled rejection", async () => {
		const input = new PassThrough(); const output = new PassThrough(); const rpc = new JsonRpc(input, output);
		vi.spyOn(output, "write").mockImplementation(() => { throw new Error("Response write failed"); });
		rpc.onRequest = async () => ({ approved: false });
		const closed = new Promise<Error>(resolve => { rpc.onClose = resolve; });
		input.write('{"id":"approval","method":"permission","params":{}}\n');
		expect((await closed).message).toBe("Response write failed"); await expect(rpc.request("next", {})).rejects.toThrow("closed");
	});
	it("preserves Unicode across byte boundaries and reports notification failures", async () => {
		const input = new PassThrough(); const rpc = new JsonRpc(input, new PassThrough());
		const request = rpc.request("unicode", {});
		const bytes = Buffer.from('{"id":1,"result":"Hello 🦊"}\n'); for (const byte of bytes) input.write(Buffer.from([byte]));
		expect(await request).toBe("Hello 🦊");
		let closed = false; rpc.onClose = () => { closed = true; }; rpc.onNotification = () => { throw new Error("Failed notification"); };
		input.write('{"method":"event","params":{}}\n'); expect(closed).toBe(true);
	});
	it("reassembles split packets and matches out-of-order responses", async () => {
		const input = new PassThrough(); const output = new PassThrough(); const rpc = new JsonRpc(input, output);
		const first = rpc.request("one", {}); const second = rpc.request("two", {});
		input.write('{"id":2,"result":"second"}\n{"id":'); input.write('1,"result":"first"}\n');
		expect(await first).toBe("first"); expect(await second).toBe("second"); rpc.close();
	});
	it("rejects outstanding requests on disconnect", async () => {
		const rpc = new JsonRpc(new PassThrough(), new PassThrough());
		const request = rpc.request("one", {}); rpc.close();
		await expect(request).rejects.toThrow("closed");
	});
	it("does not allow invalid protocol data to leave requests hanging", async () => {
		const input = new PassThrough(); const rpc = new JsonRpc(input, new PassThrough());
		const request = rpc.request("one", {}); input.write("invalid\n");
		await expect(request).rejects.toThrow("invalid JSON");
	});
});
