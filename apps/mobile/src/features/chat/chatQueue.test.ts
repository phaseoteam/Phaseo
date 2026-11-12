import { beginEdit, cancelEdit, EMPTY_QUEUE, enqueue, removeQueued, resumeQueue, saveEdit, settleQueue, takeNext, type QueuedMessage } from "./chatQueue";

const message = (id: string, text = id): QueuedMessage => ({ id, text, attachments: [], workspaceId: "ws" });
const image = { id: "img", kind: "image" as const, name: "a.png", mimeType: "image/png", uri: "file:///a.png" };

describe("chat queue", () => {
  it("sends queued messages oldest first", () => {
    let queue = enqueue(enqueue(EMPTY_QUEUE, message("a")), message("b"));
    const first = takeNext(queue);
    expect(first.next?.id).toBe("a");
    queue = first.queue;
    expect(takeNext(queue).next?.id).toBe("b");
  });

  it("holds after answers are stopped or fail, until resumed", () => {
    const queue = enqueue(EMPTY_QUEUE, message("a"));
    expect(settleQueue(queue, "done")).toBe(queue);
    const held = settleQueue(queue, "error");
    expect(takeNext(held).next).toBeNull();
    expect(takeNext(resumeQueue(settleQueue(queue, "stopped"))).next?.id).toBe("a");
    // An empty queue has nothing to hold back.
    expect(settleQueue(EMPTY_QUEUE, "error").held).toBe(false);
  });

  it("waits while a queued message is edited, and sends the edit in its place", () => {
    let queue = beginEdit(enqueue(enqueue(EMPTY_QUEUE, message("a", "first")), message("b")), "a");
    expect(takeNext(queue).next).toBeNull();
    // Only one message is edited at a time.
    expect(beginEdit(queue, "b")).toBe(queue);
    queue = saveEdit(queue, "  first, reworded ", [image]);
    expect(queue.editing).toBeNull();
    expect(takeNext(queue).next).toEqual({ id: "a", text: "first, reworded", attachments: [image], workspaceId: "ws" });
  });

  it("keeps the message as it was when the edit is cancelled", () => {
    const queue = cancelEdit(beginEdit(enqueue(EMPTY_QUEUE, message("a", "first")), "a"));
    expect(queue).toMatchObject({ editing: null, items: [message("a", "first")] });
  });

  it("drops a message edited down to nothing, and one removed", () => {
    const queue = enqueue(enqueue(EMPTY_QUEUE, message("a")), message("b"));
    expect(saveEdit(beginEdit(queue, "a"), "   ", []).items.map((item) => item.id)).toEqual(["b"]);
    expect(removeQueued(beginEdit(queue, "b"), "b")).toMatchObject({ editing: null, items: [message("a")] });
  });
});
