import type { runTriage as RunTriage } from "./agent";
import { clearTriage, startTriage, stopTriage, triageRun } from "./run";

jest.mock("@/features/chat/transport", () => ({ ChatRequestError: class extends Error {}, streamRequestBody: jest.fn() }));
jest.mock("@/features/chat/models", () => ({ requestCapabilities: jest.fn(async () => ({})) }));
jest.mock("./source", () => ({ SourceReader: class { exists = async () => true; } }));
const mockRunTriage = jest.fn<ReturnType<typeof RunTriage>, Parameters<typeof RunTriage>>();
jest.mock("./agent", () => ({ runTriage: (...args: Parameters<typeof RunTriage>) => mockRunTriage(...args) }));

const BUILD = { app: "Phaseo for Android", version: "0.1.0", buildNumber: 1, commit: "a".repeat(40), dirty: false, device: "Pixel", os: "Android 15" };
const DRAFT = { title: "Stop throws", body: "Cause: runner.ts:3" };
const start = () => startTriage({ report: "Stop crashes", build: BUILD, diagnostics: "", model: "m", workspaceId: null });

afterEach(() => { clearTriage(); mockRunTriage.mockReset(); });

describe("a triage run on the phone", () => {
  it("keeps a draft it made when a later request fails, and Edit and try again keeps the description", async () => {
    mockRunTriage.mockImplementation(async (args) => {
      args.onDraft?.(DRAFT);
      throw new Error("Your workspace is out of credit.");
    });
    await start();
    expect(triageRun.get()).toMatchObject({ status: "failed", error: "Your workspace is out of credit.", draft: DRAFT, report: "Stop crashes" });
    clearTriage(true);
    expect(triageRun.get()).toEqual({ status: "idle", report: "Stop crashes" });
  });

  it("keeps a draft it made when the person stops it", async () => {
    mockRunTriage.mockImplementation((args) => new Promise((_, reject) => {
      args.onDraft?.(DRAFT);
      args.signal.addEventListener("abort", () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" })));
    }));
    const running = start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(triageRun.get()).toMatchObject({ status: "running", draft: DRAFT });
    stopTriage();
    await running;
    expect(triageRun.get()).toMatchObject({ status: "stopped", error: null, draft: DRAFT });
    clearTriage();
    expect(triageRun.get()).toEqual({ status: "idle" });
  });
});
