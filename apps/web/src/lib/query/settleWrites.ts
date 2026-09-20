/** Wait for every write, including those still running after a sibling fails. */
export async function settleWrites<T>(operations: readonly Promise<T>[]): Promise<T[]> {
	const results = await Promise.allSettled(operations);
	const failure = results.find((result) => result.status === "rejected");
	if (failure?.status === "rejected") throw failure.reason;
	return results.map((result) => (result as PromiseFulfilledResult<T>).value);
}
