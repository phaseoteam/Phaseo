import { afterEach, describe, expect, it, vi } from "vitest";
import { addPendingSend, dropDeliveredSends, pendingSendsFor } from "./pendingSends";

afterEach(() => { vi.useRealTimers(); });

describe("messages on their way", () => {
	it("show at once, vanish when refused, and stay until the stored chat arrives when sent", () => {
		vi.stubGlobal("crypto", { randomUUID: (() => { let n = 0; return () => `id-${n++}`; })() });
		vi.useFakeTimers();
		const refused = addPendingSend("chat", "First"), sent = addPendingSend("chat", "Second");
		addPendingSend("other", "Elsewhere");
		expect(pendingSendsFor("chat").map(value => value.text)).toEqual(["First", "Second"]);
		refused(false);
		expect(pendingSendsFor("chat").map(value => value.text)).toEqual(["Second"]);
		sent(true);
		expect(pendingSendsFor("chat").map(value => value.text)).toEqual(["Second"]);
		dropDeliveredSends("chat");
		expect(pendingSendsFor("chat")).toEqual([]);
		expect(pendingSendsFor("other")).toHaveLength(1);
		const late = addPendingSend("chat", "Third"); late(true);
		vi.advanceTimersByTime(5000);
		expect(pendingSendsFor("chat")).toEqual([]);
		vi.unstubAllGlobals();
	});
});
