import { afterAll, afterEach, expect, it, vi } from "vite-plus/test";
import { useWorkspaceModeStore } from "./workspaceModeStore";

const values = vi.hoisted(() => {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  vi.stubGlobal("window", { localStorage });
  return values;
});

afterAll(() => vi.unstubAllGlobals());

afterEach(() => {
  useWorkspaceModeStore.getState().setMode("chat");
  values.clear();
});

it("restores the chosen workspace after rehydration and keeps its actions usable", async () => {
  useWorkspaceModeStore.getState().setMode("code");
  const persisted = values.get("phaseo-workspace-mode")!;
  useWorkspaceModeStore.setState({ mode: "chat" });
  values.set("phaseo-workspace-mode", persisted);
  await useWorkspaceModeStore.persist.rehydrate();
  expect(useWorkspaceModeStore.getState().mode).toBe("code");
  useWorkspaceModeStore.getState().setMode("chat");
  expect(JSON.parse(values.get("phaseo-workspace-mode")!).state).toEqual({ mode: "chat" });
});
