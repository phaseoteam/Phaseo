import { act } from "react";
import { createRoot, type Root } from "test-renderer";
import type { DesktopClient } from "./client";
import { useArchivedChats } from "./hooks";
import type { PhoneChat } from "./protocol";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const chat = (id: string): PhoneChat => ({ id, title: id, mode: "code", status: "completed", updatedAt: "2026-11-01T10:00:00Z", unread: false, needsYou: false, archived: true });

/** A computer with more archived threads than one page holds. */
function archive(pages: Record<string, { chats: PhoneChat[]; cursor?: string }>) {
  const asked: unknown[] = [];
  const client = {
    request: (type: string, params: { cursor?: string }) => { asked.push({ type, ...params }); return Promise.resolve(pages[params.cursor ?? ""]); },
    on: () => () => {},
  } as unknown as DesktopClient;
  return { client, asked };
}

let root: Root;
beforeEach(() => { root = createRoot(); });
afterEach(() => act(() => root.unmount()));

describe("a computer's archive", () => {
  it("reads past the first page, asking for archived threads each time", async () => {
    const { client, asked } = archive({ "": { chats: [chat("a"), chat("b")], cursor: "b" }, b: { chats: [chat("c")] } });
    let result: ReturnType<typeof useArchivedChats> | undefined;
    function Probe() { result = useArchivedChats(client); return null; }
    await act(async () => root.render(<Probe />));
    expect(result!.chats!.map((entry) => entry.id)).toEqual(["a", "b"]);
    await act(async () => { await result!.loadMore!(); });
    expect(result!.chats!.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    expect(asked).toEqual([{ type: "list_chats", archived: true }, { type: "list_chats", archived: true, cursor: "b" }]);
    // The last page has no cursor, so there's nothing more to load.
    expect(result!.loadMore).toBeNull();
  });
});
