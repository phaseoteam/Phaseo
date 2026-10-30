import { builtInLogoData, createLogoResolver, mergeLogoData, type LogoData, type LogoResolver } from "@phaseo/app-kit/logos";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { request } from "@/lib/api/http";
import { createStore } from "@/lib/store";

/**
 * Logos come from the list built into the app plus the list phaseo.app publishes (/logos/manifest.json, the same
 * data), so a lab added after this build still shows its logo. The published list is kept with the catalogue's
 * public data, on disk for a week, and only adds to or overrides the built-in one.
 */
// One file on phaseo.app: a single leading slash (not //, which would be another site) and no "..".
const logoPath = z.string().regex(/^\/(?!\/)(?!.*\.\.)[\w./-]+\.(svg|png)$/);
const logoDataSchema = z.object({
  logos: z.record(z.string(), z.object({ color: logoPath.optional(), light: logoPath.optional(), dark: logoPath.optional() })),
  labels: z.record(z.string(), z.string()).default({}),
  aliases: z.record(z.string(), z.string()).default({}),
});

export function parseLogoData(raw: unknown): LogoData {
  return logoDataSchema.parse(raw);
}

export const logoDataQuery = queryOptions({
  queryKey: ["public", "logo-data"],
  queryFn: async () => parseLogoData(await request("/logos/manifest.json")),
  staleTime: 24 * 60 * 60 * 1000,
});

/** The resolver the Logo components use: built-in data until the published list arrives, then both. */
export const logoResolverStore = createStore<LogoResolver>(createLogoResolver(builtInLogoData));

export function resolverWith(published: LogoData | null | undefined) {
  return createLogoResolver(published ? mergeLogoData(builtInLogoData, published) : builtInLogoData);
}

/** Mounted once at the root: fetches the published list (or reads it from the cache) and swaps the resolver. */
export function LogoDataLoader() {
  const published = useQuery(logoDataQuery).data;
  useEffect(() => {
    if (published) logoResolverStore.set(resolverWith(published));
  }, [published]);
  return null;
}
