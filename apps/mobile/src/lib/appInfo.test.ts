import { versionLabel } from "./appInfo";

// Only the pure label is tested; the device and build modules load native code.
jest.mock("expo-device", () => ({}));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "0.1.0", extra: {} } } }));
jest.mock("./haptics", () => ({ hapticsHere: () => "" }));

describe("versionLabel", () => {
  it("shows the build number, and the commit only when asked", () => {
    expect(versionLabel("0.1.0", { number: 4123, commit: "c9eb5636b8" })).toBe("0.1.0 (build 4123)");
    expect(versionLabel("0.1.0", { number: 4123, commit: "c9eb5636b8" }, { commit: true })).toBe("0.1.0 (build 4123, c9eb5636b8)");
  });

  it("falls back to the commit, then to the version alone", () => {
    expect(versionLabel("0.1.0", { number: null, commit: "c9eb5636b8" })).toBe("0.1.0 (c9eb5636b8)");
    expect(versionLabel("0.1.0", { number: 1, commit: null }, { commit: true })).toBe("0.1.0 (build 1)");
    expect(versionLabel("0.1.0", { number: null, commit: null })).toBe("0.1.0");
  });
});
