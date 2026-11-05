/** A request to the main process that is still running past the threshold ("slow"), then when it settles ("done"). */
export type SlowRequestEvent = { id: number; name: string; state: "slow" | "done" };

export const SLOW_REQUEST_MS = 10_000;

/** Requests that wait on the person or are long by nature (a dialog, a sign-in, a clone) never count as slow. */
const expectedLong = /choose|pick|dialog|save|export|import|clone|login|logIn|signIn|auth|record|prepare|wait|download|install|update|probe|checkout|scan|refresh/i;

let next = 0;

/**
 * The API with each method that returns a promise timed: past `after` ms it reports "slow", and "done" once it
 * settles. Results, errors and everything else pass through untouched; nested objects are wrapped the same way.
 */
export function withSlowRequestNotice<T extends object>(api: T, report: (event: SlowRequestEvent) => void, after = SLOW_REQUEST_MS, path = ""): T {
	const wrapped: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(api)) {
		const name = path ? `${path}.${key}` : key;
		if (typeof value === "function") {
			wrapped[key] = (...args: unknown[]) => {
				const result = (value as (...values: unknown[]) => unknown).apply(api, args);
				if (!result || typeof (result as Promise<unknown>).finally !== "function" || expectedLong.test(key)) return result;
				const id = ++next;
				let slow = false;
				const timer = setTimeout(() => { slow = true; report({ id, name, state: "slow" }); }, after);
				void (result as Promise<unknown>).finally(() => { clearTimeout(timer); if (slow) report({ id, name, state: "done" }); }).catch(() => undefined);
				return result;
			};
		}
		else wrapped[key] = value && typeof value === "object" && !Array.isArray(value) ? withSlowRequestNotice(value as object, report, after, name) : value;
	}
	return wrapped as T;
}

/** "workspace.usageReport" → "usage report". */
export function slowRequestLabel(name: string) {
	return (name.split(".").at(-1) ?? name).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}
