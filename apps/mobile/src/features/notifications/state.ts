import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useProviders } from "@/features/providers/ProviderBrowser";
import { useCatalogueIndex } from "@/features/models/state";
import { getNotificationSettings, unregisterDevice, type NotificationSettings, type RuleInput } from "@/lib/api/notifications";
import { modelName } from "@/lib/catalogue";
import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";
import { onSignOut, useAuth } from "@/providers/AuthProvider";
import { forgetRegistration, installationId } from "./device";

/** The rule being edited, shared with the lab/provider/model picker sheets. */
export const draftRuleStore = createStore<RuleInput | null>(null);

export function useInstallationId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { void installationId().then(setId); }, []);
  return id;
}

// Stop pushing to this phone once its owner signs out.
onSignOut(async () => {
  await forgetRegistration().catch(() => undefined);
  try { await unregisterDevice(await installationId()); } catch { /* signed out already or never registered */ }
});

const SETUP_OFFERED_KEY = "phaseo.notification-setup-offered";

/** True the first time for each account on this phone: setup opens by itself after the first switch-on. */
export async function takeSetupOffer(userId: string) {
  const key = `${SETUP_OFFERED_KEY}:${userId}`;
  if (await kv.getItem(key)) return false;
  await kv.setItem(key, "1");
  return true;
}

/** Shared with the start-up registration check, so the screen opens on the settings it already fetched. */
export function notificationSettingsQuery(userId: string | null, id: string | null) {
  return queryOptions({ queryKey: ["account", userId, "notifications", id] as const, queryFn: () => getNotificationSettings(id!), retry: false });
}

export function useNotificationSettings() {
  const { session } = useAuth();
  const id = useInstallationId();
  const queryClient = useQueryClient();
  const userId = session?.user.id ?? null;
  const options = useMemo(() => notificationSettingsQuery(userId, id), [userId, id]);
  const query = useQuery({ ...options, enabled: Boolean(session && id) });
  const set = useCallback((settings: NotificationSettings) => queryClient.setQueryData(options.queryKey, settings), [queryClient, options]);
  /** For optimistic changes; a no-op before the settings have loaded. */
  const patch = useCallback((change: (current: NotificationSettings) => NotificationSettings) => queryClient.setQueryData(options.queryKey, (current) => (current ? change(current) : current)), [queryClient, options]);
  return { ...query, installationId: id, set, patch };
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
