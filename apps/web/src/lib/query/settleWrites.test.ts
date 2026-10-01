import { settleWrites } from "./settleWrites";

it("waits for remaining writes even after the first rejection", async () => {
	let finish!: (value: string) => void;
	const pending = new Promise<string>((resolve) => { finish = resolve; });
	const failure = new Error("first write failed");
	let settled = false;
	const result = settleWrites([Promise.reject(failure), pending]).catch((error) => { settled = true; return error; });
	await Promise.resolve();
	await Promise.resolve();
	expect(settled).toBe(false);
	finish("second write completed");
	expect(await result).toBe(failure);
	expect(settled).toBe(true);
});

it("returns actual mutation results in their original order", async () => {
	await expect(settleWrites([Promise.resolve("one"), Promise.resolve("two")])).resolves.toEqual(["one", "two"]);
});
