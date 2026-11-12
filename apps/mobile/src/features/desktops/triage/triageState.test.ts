import type { ConnectionState } from "../client";
import { filesIssues, phoneBuild, triageBlocker, triageDiagnostics, triages } from "./triageState";

const connected = (protocol: number, capabilities: ("code" | "changes" | "terminal")[]): ConnectionState => ({ status: "connected", via: "direct", desktopName: "Studio PC", protocol, capabilities });

describe("triage from the phone", () => {
  test("needs a computer from protocol 8 that allows Read code and Make changes", () => {
    expect(triageBlocker(connected(7, ["code", "changes"]), "Studio PC")).toBe("Update Phaseo on Studio PC to triage from this phone.");
    expect(triageBlocker(connected(8, ["code"]), "Studio PC")).toBe("Allow Read code and Make changes for this phone on Studio PC: Settings → Phone.");
    expect(triageBlocker(connected(8, ["changes"]), "Studio PC")).toContain("Allow Read code and Make changes");
    expect(triageBlocker(connected(8, ["code", "changes"]), "Studio PC")).toBeNull();
    expect(triages(connected(8, ["code", "changes"]))).toBe(true);
    // Offline, the connection notice says why; the form just can't start yet.
    expect(triageBlocker({ status: "offline", message: "No route" } as ConnectionState, "Studio PC")).toBeNull();
    expect(triages({ status: "offline", message: "No route" } as ConnectionState)).toBe(false);
  });

  test("files an issue only with Make changes", () => {
    expect(filesIssues(connected(8, ["code"]))).toBe(false);
    expect(filesIssues(connected(8, ["changes"]))).toBe(true);
    expect(filesIssues(connected(7, ["changes"]))).toBe(false);
  });

  test("sends the full commit, and leaves out a short one rather than send what the computer can't fetch", () => {
    const base = { version: "0.1.0", dirty: false, buildNumber: 2600, builtAt: null, platform: "android", osVersion: "15", device: "Pixel 9", runtime: null };
    expect(phoneBuild({ ...base, commit: "A".repeat(40) })).toEqual({ version: "0.1.0", platform: "android", commit: "a".repeat(40), buildNumber: 2600, osVersion: "15", device: "Pixel 9" });
    expect(phoneBuild({ ...base, commit: "56dc9386b8", dirty: true })).toEqual({ version: "0.1.0", platform: "android", dirty: true, buildNumber: 2600, osVersion: "15", device: "Pixel 9" });
    expect(phoneBuild({ ...base, commit: null, buildNumber: null, osVersion: null, device: null })).toEqual({ version: "0.1.0", platform: "android" });
  });

  test("describes slow operations by name and time only, newest first, never their details", () => {
    const at = Date.parse("2026-11-12T10:00:00.000Z");
    const text = triageDiagnostics([{ name: "chat.open", ms: 81.4, at, detail: "Chat about my tax return" }, { name: "stream.flush", ms: 52, at: at - 1000 }]);
    expect(text).toBe("2026-11-12T10:00:00.000Z chat.open took 81 ms\n2026-11-12T09:59:59.000Z stream.flush took 52 ms");
    expect(text).not.toContain("tax");
    expect(triageDiagnostics(Array.from({ length: 80 }, (_, index) => ({ name: `op${index}`, ms: 60, at })), 50).split("\n")).toHaveLength(50);
  });
});
