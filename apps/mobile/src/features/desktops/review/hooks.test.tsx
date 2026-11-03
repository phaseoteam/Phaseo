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
});
