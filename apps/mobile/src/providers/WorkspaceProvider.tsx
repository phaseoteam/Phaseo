import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { getWorkspaces, resolveWorkspace, type Workspace } from "@/lib/api/account";
import { kv } from "@/lib/storage";
import { onSignOut, useAuth } from "./AuthProvider";

const STORAGE_KEY = "phaseo.workspace";

type WorkspaceValue = {
  workspaces: Workspace[];
  workspace: Workspace | null;
  workspaceId: string | null;
  loading: boolean;
  selectWorkspace(id: string): void;
};

const WorkspaceContext = createContext<WorkspaceValue>({ workspaces: [], workspace: null, workspaceId: null, loading: false, selectWorkspace: () => undefined });

export const useWorkspace = () => useContext(WorkspaceContext);

onSignOut(() => kv.removeItem(STORAGE_KEY));

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [saved, setSaved] = useState<{ userId: string; id: string | null } | null>(null);
  const selected = saved && saved.userId === userId ? saved.id : null;

  useEffect(() => {
    if (!userId) return;
    void kv.getItem(STORAGE_KEY).then((value) => setSaved({ userId, id: value }));
  }, [userId]);

  const workspaces = useQuery({ queryKey: ["account", userId, "workspaces"], queryFn: getWorkspaces, enabled: Boolean(userId) });
  // Without a saved choice, open the workspace the web would (the user's default).
  const fallback = useQuery({ queryKey: ["account", userId, "default-workspace"], queryFn: () => resolveWorkspace(), enabled: Boolean(userId) && selected == null });

  const selectWorkspace = useCallback((id: string) => {
    if (userId) setSaved({ userId, id });
    void kv.setItem(STORAGE_KEY, id);
  }, [userId]);

  const value = useMemo<WorkspaceValue>(() => {
    const list = workspaces.data ?? [];
    const id = (selected && list.some((entry) => entry.id === selected) ? selected : null) ?? fallback.data ?? list[0]?.id ?? null;
    return {
      workspaces: list,
      workspaceId: id,
      workspace: list.find((entry) => entry.id === id) ?? null,
      loading: workspaces.isLoading || (selected == null && fallback.isLoading),
      selectWorkspace,
    };
  }, [workspaces.data, workspaces.isLoading, selected, fallback.data, fallback.isLoading, selectWorkspace]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
