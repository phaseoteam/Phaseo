import { afterEach, describe, expect, it, vi } from "vitest";

const toasts: string[] = [];
vi.mock("../components/ui/toast", () => ({ showToast: (_type: string, title: string) => { toasts.push(title); } }));
const { setUpdateState, versionText } = await import("./updateState");

afterEach(() => { toasts.length = 0; });

describe("app version and updates", () => {
	it("shows the version with the build's short commit when known", () => {
		expect(versionText({ version: "0.4.2", commit: "1a2b3c4d5e6f" })).toBe("0.4.2 (1a2b3c4)");
		expect(versionText({ version: "0.4.2" })).toBe("0.4.2");
	});
	it("announces a downloaded update once per version", () => {
		setUpdateState({ status: "downloading" });
		setUpdateState({ status: "ready", version: "0.5.0" });
		setUpdateState({ status: "ready", version: "0.5.0" });
		setUpdateState({ status: "ready", version: "0.5.1" });
		expect(toasts).toEqual(["Phaseo 0.5.0 is ready", "Phaseo 0.5.1 is ready"]);
	});
});
