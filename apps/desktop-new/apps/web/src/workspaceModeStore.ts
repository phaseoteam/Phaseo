import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceMode = "chat" | "code";

export const useWorkspaceModeStore = create<{
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
}>()(
  persist(
    (set) => ({ mode: "chat", setMode: (mode) => set({ mode }) }),
    { name: "phaseo-workspace-mode", partialize: ({ mode }) => ({ mode }) },
  ),
);
