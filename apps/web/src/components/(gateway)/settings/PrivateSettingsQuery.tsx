"use client";

import { Fragment, createContext, useContext, useCallback, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import { privateSettingsOptions } from "@/lib/query/privateSettings";
import { invalidateAccountQueries } from "@/lib/query/invalidation";
import type { AccountQueryScope } from "@/lib/query/queryKeys";
import SettingsSectionFallback from "./SettingsSectionFallback";
import { Button } from "@/components/ui/button";
import { readCachedSettings, type SettingsResource, type SettingsResourceData } from "@/app/(dashboard)/settings/cachedSettingsActions";

const SettingsScopeContext = createContext<AccountQueryScope | null>(null);

export function PrivateSettingsProvider({ scope, children }: { scope: AccountQueryScope; children: ReactNode }) {
	return <SettingsScopeContext value={scope}>{children}</SettingsScopeContext>;
}

export function useInvalidatePrivateSettings() {
	const client = useQueryClient();
	return useCallback(() => invalidateAccountQueries(client), [client]);
}

/** Also invalidate after partial writes; never put mutation responses in the cache. */
export function useSettingsWrite() {
	const invalidate = useInvalidatePrivateSettings();
	return useCallback(async <T,>(operation: Promise<T>): Promise<T> => {
		try { return await operation; }
		finally { void invalidate(); }
	}, [invalidate]);
}

/** Existing refresh-after-write flows must refresh both caches. */
export function useSettingsRouter() {
	const router = useRouter();
	const invalidate = useInvalidatePrivateSettings();
	const refresh = useCallback(() => { void invalidate(); router.refresh(); }, [invalidate, router]);
	return useMemo(() => ({ ...router, refresh }), [router, refresh]);
}

/** Only display DTOs belong here: never secret-reveal, payment or MFA responses. */
export function PrivateSettingsQuery<T>({ path, children, workspace = true, resource, preferredWorkspaceId, parameters, workspaceId }: {
	path: `/api/account/${string}` | "/api/enterprise/directory";
	children: (data: T) => ReactNode;
	workspace?: boolean;
	resource?: SettingsResource;
	preferredWorkspaceId?: string;
	parameters?: string;
	workspaceId?: string;
}) {
	const context = useContext(SettingsScopeContext);
	const [refreshVersion, setRefreshVersion] = useState(0);
	if (!context) throw new Error("Missing private settings scope");
	const scope = workspace ? { ...context, workspaceId: workspaceId ?? context.workspaceId } : { ...context, workspaceId: null };
	const cacheParams = new URLSearchParams();
	if (preferredWorkspaceId) cacheParams.set("preferredWorkspaceId", preferredWorkspaceId);
	if (parameters) cacheParams.set("parameters", parameters);
	const options = privateSettingsOptions(scope, cacheParams.size ? `${path}?${cacheParams}` : path);
	const query = useQuery({
		...options,
		enabled: Boolean(scope.userId && (!workspace || scope.workspaceId)),
		queryFn: async ({ signal }) => {
			const { data } = await createClient().auth.getSession();
			if (!scope.userId || data.session?.user.id !== scope.userId) throw new WebApiError(path, 401);
			signal.throwIfAborted();
			if (resource) {
				const result = await readCachedSettings(resource, scope, preferredWorkspaceId, parameters);
				signal.throwIfAborted();
				if ("denied" in result) throw new WebApiError(path, result.denied);
				if ((result.data as { signedIn?: boolean }).signedIn === false) throw new WebApiError(path, 401);
				return result.data as T;
			}
			const url = new URL(path, "https://phaseo.app");
			if (workspace) url.searchParams.set("workspaceId", scope.workspaceId!);
			if (path === "/api/enterprise/directory") {
				const response = await fetch(`${url.pathname}${url.search}`, { credentials: "same-origin", cache: "no-store", signal });
				if (!response.ok) throw new WebApiError(path, response.status);
				return await response.json() as T;
			}
			const result = await fetchAccountWebApi<T>(`${url.pathname}${url.search}` as `/api/account/${string}`, process.env.NODE_ENV === "development" ? null : data.session.access_token, { signal });
			const auth = result as { signedIn?: boolean; workspaceId?: string | null; currentUserId?: string | null };
			if (auth.signedIn === false || (auth.currentUserId && auth.currentUserId !== scope.userId)) throw new WebApiError(path, 401);
			if (workspace && auth.workspaceId && auth.workspaceId !== scope.workspaceId) throw new WebApiError(path, 403);
			return result;
		},
	});
	const identity = JSON.stringify(options.queryKey);
	const [initialRead, setInitialRead] = useState(() => ({ identity, stale: query.isStale }));
	if (initialRead.identity !== identity) {
		setInitialRead({ identity, stale: query.isStale });
		return <SettingsSectionFallback />;
	}
	if (workspace && !scope.workspaceId) return <p>Select a workspace to manage these settings.</p>;
	const denied = query.error instanceof WebApiError && [401, 402, 403, 404].includes(query.error.status);
	if (denied || (!query.data && query.error)) return <div role="alert"><p>{denied ? "Your session or workspace access changed. Reload to continue." : "Settings could not be loaded."}</p><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>;
	// Editors often initialize drafts once. On an expired-cache revisit, wait for
	// the initial read so a draft cannot retain stale values after revalidation.
	// Later mutation refetches must not unmount drafts or one-time secret dialogs.
	if (initialRead.stale && !query.isFetchedAfterMount && query.isFetching) return <SettingsSectionFallback />;
	if (!query.data) return <SettingsSectionFallback />;
	return <>
		<div className="mb-2 flex justify-end"><Button variant="ghost" size="icon" aria-label="Refresh settings" disabled={query.isFetching} onClick={() => void query.refetch().then((result) => { if (result.isSuccess) setRefreshVersion((version) => version + 1); })}><RefreshCw className={query.isFetching ? "size-4 animate-spin" : "size-4"} /></Button></div>
		{query.error ? <p role="status">Refresh failed. Showing the last loaded settings.</p> : null}
		<Fragment key={refreshVersion}>{children(query.data)}</Fragment>
	</>;
}

export function withPrivateSettings<T>(path: `/api/account/${string}`, View: ComponentType<{ initialData: T }>, workspace = true) {
	return function CachedSettingsView() {
		return <PrivateSettingsQuery<T> path={path} workspace={workspace}>{(initialData) => <View initialData={initialData} />}</PrivateSettingsQuery>;
	};
}

export function withSettingsResource<K extends SettingsResource>(resource: K, View: ComponentType<{ initialData: SettingsResourceData<K> }>, workspace = true) {
	return function CachedSettingsResource() {
		return <SettingsResourceQuery resource={resource} workspace={workspace}>{(initialData) => <View initialData={initialData} />}</SettingsResourceQuery>;
	};
}

export function SettingsResourceQuery<K extends SettingsResource>({ resource, workspace = true, children }: {
	resource: K;
	workspace?: boolean;
	children: (data: SettingsResourceData<K>) => ReactNode;
}) {
	const params = useSearchParams();
	const preferredWorkspaceId = (resource === "keys" ? params.get("workspace_id") : resource === "teams" ? params.get("workspaceId") : null) ?? undefined;
	return <PrivateSettingsQuery<SettingsResourceData<K>> path={`/api/account/settings/${resource}`} resource={resource} workspace={workspace} preferredWorkspaceId={preferredWorkspaceId}>{children}</PrivateSettingsQuery>;
}
