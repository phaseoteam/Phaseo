import { closeActions, confirm, dismissToast, MAX_TOASTS, overlayStore, settleConfirm, showActions, toast, TOAST_MS } from "./overlayStore";

describe("in-app dialogs", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    overlayStore.set({ confirm: null, toasts: [], menu: null });
  });
  afterEach(() => jest.useRealTimers());

  test("a confirmation resolves with the button pressed and stays visible while it closes", async () => {
    const answer = confirm({ title: "Delete this chat?", confirmLabel: "Delete", destructive: true });
    expect(overlayStore.get().confirm).toMatchObject({ title: "Delete this chat?", confirmLabel: "Delete", cancelLabel: "Cancel", destructive: true, open: true });
    settleConfirm(true);
    await expect(answer).resolves.toBe(true);
    expect(overlayStore.get().confirm).toMatchObject({ title: "Delete this chat?", open: false });
    // Settling twice does nothing.
    settleConfirm(false);
    await expect(answer).resolves.toBe(true);
  });

  test("a newer confirmation replaces an open one, which counts as cancelled", async () => {
    const first = confirm({ title: "First" });
    const second = confirm({ title: "Second" });
    await expect(first).resolves.toBe(false);
    settleConfirm(true);
    await expect(second).resolves.toBe(true);
  });

  test("toasts go away by themselves, can be dismissed, and only the latest few stay", () => {
    const id = toast("Copied");
    expect(overlayStore.get().toasts).toEqual([{ id, message: "Copied", title: undefined, tone: "neutral" }]);
    jest.advanceTimersByTime(TOAST_MS);
    expect(overlayStore.get().toasts).toEqual([]);
    const ids = Array.from({ length: MAX_TOASTS + 2 }, (_, index) => toast(`Notice ${index}`, { tone: "error" }));
    expect(overlayStore.get().toasts.map((entry) => entry.id)).toEqual(ids.slice(-MAX_TOASTS));
    dismissToast(ids.at(-1)!);
    expect(overlayStore.get().toasts).toHaveLength(MAX_TOASTS - 1);
  });

  test("a toast with the same key replaces the shown one in place and restarts its timer", () => {
    const other = toast("Saved", { durationMs: 10_000 });
    const first = toast("4 taps away", { key: "version", durationMs: 2500 });
    jest.advanceTimersByTime(2000);
    const second = toast("3 taps away", { key: "version", durationMs: 2500 });
    expect(second).toBe(first);
    expect(overlayStore.get().toasts.map((entry) => [entry.id, entry.message])).toEqual([[other, "Saved"], [first, "3 taps away"]]);
    jest.advanceTimersByTime(2000);
    expect(overlayStore.get().toasts.map((entry) => entry.message)).toEqual(["Saved", "3 taps away"]);
    jest.advanceTimersByTime(500);
    expect(overlayStore.get().toasts.map((entry) => entry.message)).toEqual(["Saved"]);
  });

  test("the same notice twice shows once", () => {
    const first = toast("Version copied.");
    jest.advanceTimersByTime(TOAST_MS - 100);
    expect(toast("Version copied.")).toBe(first);
    expect(overlayStore.get().toasts).toHaveLength(1);
    jest.advanceTimersByTime(TOAST_MS - 100);
    expect(overlayStore.get().toasts).toHaveLength(1);
    expect(toast("Version copied.", { tone: "error" })).not.toBe(first);
    expect(overlayStore.get().toasts).toHaveLength(2);
  });

  test("an action menu opens with its anchor and closes without losing its rows", () => {
    showActions({ title: "Chat", anchor: { x: 10, y: 20, width: 0, height: 0 }, actions: [{ key: "pin", label: "Pin", onPress: () => undefined }] });
    expect(overlayStore.get().menu).toMatchObject({ title: "Chat", open: true, anchor: { x: 10, y: 20 } });
    closeActions();
    expect(overlayStore.get().menu).toMatchObject({ open: false, actions: [{ key: "pin" }] });
  });
});
