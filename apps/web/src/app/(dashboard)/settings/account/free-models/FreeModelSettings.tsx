"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import { useAccountSettingsScope } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import { privateSettingsOptions } from "@/lib/query/privateSettings";
import { createClient } from "@/utils/supabase/client";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";

type QuotaSettings = {
    allowOverage: boolean; policyVersion: number; requestsUsedToday: number;
    requestsIncluded: number; rpm: number; overageFeeNanos: number;
    resetsAtMs: number; overageAvailable: boolean;
};
const path = "/api/account/free-model-quota";

export default function FreeModelSettings() {
    const { userId } = useAccountSettingsScope();
    // Remount the mutation state as well as changing the query key on account changes.
    return <FreeModelSettingsForOwner key={userId ?? "anonymous"} userId={userId} />;
}

function FreeModelSettingsForOwner({ userId }: { userId: string | null }) {
    const client = useQueryClient();
    const options = privateSettingsOptions({ userId, workspaceId: null }, path);
    async function readOrDisable(signal?: AbortSignal, expectedVersion?: number) {
        const { data } = await createClient().auth.getSession();
        if (!userId || data.session?.user.id !== userId) throw new WebApiError(path, 401);
        signal?.throwIfAborted();
        return fetchAccountWebApi<{ data: QuotaSettings }>(path,
            process.env.NODE_ENV === "development" ? null : data.session.access_token, {
                signal, ...(expectedVersion === undefined ? {} : {
                    method: "PATCH", body: JSON.stringify({ allowOverage: false, expectedVersion }),
                }),
            });
    }
    const query = useQuery({ ...options, enabled: Boolean(userId), staleTime: 0, gcTime: 0, retry: false,
        queryFn: ({ signal }) => readOrDisable(signal) });
    const mutation = useMutation({ retry: false,
        mutationFn: (version: number) => readOrDisable(undefined, version),
        onSuccess: result => client.setQueryData(options.queryKey, result),
    });
    const refresh = async () => {
        const result = await query.refetch();
        if (result.isSuccess) mutation.reset();
    };
    const denied = query.error instanceof WebApiError && [401, 403].includes(query.error.status);
    const unavailable = query.error instanceof WebApiError && query.error.status === 404;
    const data = !denied && !unavailable ? query.data?.data : undefined;
    return <div className="space-y-6">
        <SettingsPageHeader title="Free models" description="One allowance across every workspace you own." />
        <div className="flex justify-end">
            <Button variant="outline" disabled={!userId || query.isFetching || mutation.isPending} onClick={() => void refresh()}>Refresh</Button>
        </div>
        {!userId || denied ? <p role="alert">Sign in again to view your free model allowance.</p>
            : unavailable ? <p role="status">Free model limits are not enabled yet.</p>
                : !data && query.isPending ? <SettingsSectionFallback />
                    : !data ? <p role="alert">Could not load your allowance. Try refreshing.</p>
                        : <section aria-label="Free model allowance" className="overflow-hidden rounded-xl border bg-background/40">
                            <div className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                                <h2 className="text-sm font-medium">Included requests used today</h2>
                                <p>{data.requestsUsedToday.toLocaleString()} / {data.requestsIncluded.toLocaleString()}</p>
                            </div>
                            <div className="border-t px-4 py-3.5 text-sm text-muted-foreground">
                                Resets {new Date(data.resetsAtMs).toLocaleString(undefined, { timeZone: "UTC" })} UTC.
                                {" "}{data.rpm}-request burst, refilling at {data.rpm} per minute.
                                {" "}Admitted requests count even if the provider fails; internal retries count once.
                            </div>
                            <div className="flex flex-col gap-3 border-t px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                                <div><h2 className="text-sm font-medium">Paid overage</h2>
                                    <p className="mt-0.5 text-sm text-muted-foreground">Paid overage is not available. Requests stop at the included limit.</p>
                                    {data.allowOverage ? <p className="text-sm">Previously saved consent is enabled, but charging remains disabled.</p> : null}
                                </div>
                                {data.allowOverage ? <Button variant="outline" disabled={mutation.isPending || query.isFetching || Boolean(mutation.error || query.error)}
                                    onClick={() => mutation.mutate(data.policyVersion)}>{mutation.isPending ? "Disabling…" : "Disable saved consent"}</Button> : null}
                            </div>
                        </section>}
        {data && query.error ? <p role="alert">Refresh failed. Showing the last confirmed state; refresh before making changes.</p> : null}
        {mutation.error ? <p role="alert">The change could not be confirmed. Refresh to check the latest policy before trying again.</p> : null}
        {mutation.isSuccess ? <p role="status">Paid overage consent is disabled.</p> : null}
    </div>;
}
