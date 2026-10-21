import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProviders } from "@/features/providers/ProviderBrowser";
import { useCatalogueIndex } from "@/features/models/state";
import { getNotificationSettings, unregisterDevice, type NotificationSettings, type RuleInput } from "@/lib/api/notifications";
import { modelName } from "@/lib/catalogue";
import { createStore } from "@/lib/store";
import { onSignOut, useAuth } from "@/providers/AuthProvider";
import { installationId } from "./device";

/** The rule being edited, shared with the lab/provider/model picker sheets. */
export const draftRuleStore = createStore<RuleInput | null>(null);

export function useInstallationId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { void installationId().then(setId); }, []);
  return id;
}

// Stop pushing to this phone once its owner signs out.
onSignOut(async () => {
  try { await unregisterDevice(await installationId()); } catch { /* signed out already or never registered */ }
});

export function useNotificationSettings() {
  const { session } = useAuth();
  const id = useInstallationId();
  const queryClient = useQueryClient();
  const key = useMemo(() => ["account", session?.user.id ?? null, "notifications", id] as const, [session?.user.id, id]);
  const query = useQuery({ queryKey: key, queryFn: () => getNotificationSettings(id!), enabled: Boolean(session && id), retry: false });
  const set = useCallback((settings: NotificationSettings) => queryClient.setQueryData(key, settings), [queryClient, key]);
  return { ...query, installationId: id, set };
}

/** Display names for lab, provider and model IDs in rule summaries. */
export function useRuleNames() {
  const { index, data } = useCatalogueIndex();
  const providers = useProviders();
  return useMemo(() => {
    const labs = new Map<string, string>();
    for (const card of data?.models ?? []) if (card.organisation_id && card.organisation_name) labs.set(card.organisation_id, card.organisation_name);
    const providerNames = new Map((providers.data ?? []).map((provider) => [provider.api_provider_id, provider.api_provider_name]));
    return {
      labs,
      lab: (id: string) => labs.get(id) ?? id,
      provider: (id: string) => providerNames.get(id) ?? id,
      model: (id: string) => {
        const card = index.get(id);
        return card ? modelName(card) : id;
      },
    };
  }, [data, index, providers.data]);
}
