import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { PropsWithChildren } from "react";
import { kv } from "@/lib/storage";
import { onSignOut } from "./AuthProvider";

const DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, gcTime: 7 * DAY, retry: 1, networkMode: "offlineFirst" },
  },
});

const persister = createAsyncStoragePersister({ storage: kv, key: "phaseo.query-cache", throttleTime: 2000 });

/** Query keys starting with "public" hold catalogue data and survive restarts; account data never touches disk here. */
export const isPublicQuery = (key: readonly unknown[]) => key[0] === "public";

onSignOut(() => {
  queryClient.removeQueries({ predicate: (query) => !isPublicQuery(query.queryKey) });
});

export function QueryProvider({ children }: PropsWithChildren) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 7 * DAY,
        buster: "mobile-v4",
        dehydrateOptions: { shouldDehydrateQuery: (query) => query.state.status === "success" && isPublicQuery(query.queryKey) },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
