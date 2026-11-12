import { act } from "react";
import { createRoot, type Root } from "test-renderer";
import { createStore } from "@/lib/store";
import type { ConnectionState, DesktopClient } from "../client";
import { useFileSearch } from "./hooks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => { root = createRoot(); });
afterEach(() => act(() => root.unmount()));

describe("a file search", () => {
  it("is read again on Refresh, so a failed or stale answer can be replaced", async () => {
    const searches: string[] = [];
    let fail = true;
    const client = {
      state: createStore<ConnectionState>({ status: "connected", via: "direct", desktopName: "Studio", protocol: 5, capabilities: ["code"] }),
      request: async (_type: string, params: { query: string }) => {
        searches.push(params.query);
        if (fail) throw new Error("The connection dropped.");
        return { entries: [{ path: "src/usage.ts", name: "usage.ts", directory: false }], truncated: false };
      },
      on: () => () => {},
    } as unknown as DesktopClient;
    let result: ReturnType<typeof useFileSearch> | undefined;
    function Probe() { result = useFileSearch(client, { projectId: "p1" }, "usage"); return null; }
    await act(async () => root.render(<Probe />));
    expect(result).toMatchObject({ result: null, error: { message: "The connection dropped." } });

    fail = false;
    await act(async () => result!.reload());
    expect(searches).toEqual(["usage", "usage"]);
    expect(result).toMatchObject({ error: null, result: { entries: [{ path: "src/usage.ts" }] } });
  });
});
