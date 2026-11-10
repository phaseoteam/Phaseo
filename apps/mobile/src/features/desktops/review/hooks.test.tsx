import { act } from "react";
import { createRoot, type Root } from "test-renderer";
import { createStore } from "@/lib/store";
import type { ConnectionState, DesktopClient } from "../client";
import type { PhoneDiffScope, PhoneResults } from "../protocol";
import { useThreadDiff } from "./hooks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Diff = PhoneResults["read_diff"];
const diff = (hash: string): Diff => ({ repository: true, files: [], hash, truncated: false });

/** A computer that answers each read only when the test says, so answers can arrive out of order. */
function slowDesktop() {
  const answers: { scope: PhoneDiffScope; resolve(diff: Diff): void; reject(error: Error): void }[] = [];
  const client = {
    state: createStore<ConnectionState>({ status: "connected", via: "direct", desktopName: "Studio", protocol: 4, capabilities: ["code"] }),
    request: (_type: string, params: { scope: PhoneDiffScope }) => new Promise<Diff>((resolve, reject) => { answers.push({ scope: params.scope, resolve, reject }); }),
    on: () => () => {},
  } as unknown as DesktopClient;
  const answer = (scope: PhoneDiffScope) => answers.find((entry) => entry.scope === scope)!;
  return { client, answer };
}

let root: Root;
beforeEach(() => { root = createRoot(); });
afterEach(() => act(() => root.unmount()));

describe("a thread's review", () => {
  const chat = { id: "usage-fix", status: "completed" } as const;

  it("shows the segment chosen last when an earlier segment's answer arrives after it", async () => {
    const { client, answer } = slowDesktop();
    let result: ReturnType<typeof useThreadDiff> | undefined;
    function Probe({ scope }: { scope: PhoneDiffScope }) { result = useThreadDiff(client, chat, scope, null); return null; }
    await act(async () => root.render(<Probe scope="branch" />));
    await act(async () => root.render(<Probe scope="turn" />));
    await act(async () => answer("turn").resolve(diff("turn")));
    expect(result).toMatchObject({ loading: false, diff: { hash: "turn" } });
    await act(async () => answer("branch").resolve(diff("branch")));
    expect(result).toMatchObject({ loading: false, diff: { hash: "turn" }, error: null });
  });

  it("ignores an earlier segment's failure that arrives after the chosen one loaded", async () => {
    const { client, answer } = slowDesktop();
    let result: ReturnType<typeof useThreadDiff> | undefined;
    function Probe({ scope }: { scope: PhoneDiffScope }) { result = useThreadDiff(client, chat, scope, null); return null; }
    await act(async () => root.render(<Probe scope="branch" />));
    await act(async () => root.render(<Probe scope="uncommitted" />));
    await act(async () => answer("uncommitted").resolve(diff("uncommitted")));
    await act(async () => answer("branch").reject(new Error("No base branch.")));
    expect(result).toMatchObject({ loading: false, diff: { hash: "uncommitted" }, error: null });
  });

  it("reads a file on its own once per diff, and again after a failure once the diff is read again", async () => {
    const listed = { path: "huge.txt", status: "added", additions: 7000, deletions: 0 } as const;
    const fileReads: string[] = [], listeners: ((event: { type: string; reconnect?: boolean }) => void)[] = [];
    let failNext = 2;
    const client = {
      state: createStore<ConnectionState>({ status: "connected", via: "direct", desktopName: "Studio", protocol: 4, capabilities: ["code"] }),
      request: async (type: string, params: { path?: string }) => {
        if (type === "read_diff") return { repository: true, files: [listed], hash: "same", truncated: false };
        fileReads.push(params.path!);
        if (failNext-- > 0) throw new Error("The connection dropped.");
        return { file: { ...listed, patch: "+x\n" } };
      },
      on: (listener: (typeof listeners)[number]) => { listeners.push(listener); return () => {}; },
    } as unknown as DesktopClient;
    let result: ReturnType<typeof useThreadDiff> | undefined;
    function Probe() { result = useThreadDiff(client, chat, "uncommitted", null); return null; }
    await act(async () => root.render(<Probe />));
    await act(async () => result!.loadFile("huge.txt"));
    await act(async () => result!.loadFile("huge.txt"));
    expect(fileReads).toHaveLength(1);
    expect(result!.fileOf(listed)).toBe("The connection dropped.");

    // A reconnect reads the diff again; its hash is unchanged, but the failed file is asked for again.
    await act(async () => { for (const listener of listeners) listener({ type: "connected", reconnect: true }); });
    expect(result!.fileOf(listed)).toEqual(listed);
    await act(async () => result!.loadFile("huge.txt"));
    expect(fileReads).toHaveLength(2);

    // So does Refresh, and then the read that works is kept.
    await act(async () => result!.reload());
    await act(async () => result!.loadFile("huge.txt"));
    await act(async () => result!.loadFile("huge.txt"));
    expect(fileReads).toHaveLength(3);
    expect(result!.fileOf(listed)).toMatchObject({ patch: "+x\n" });
  });
});
