import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccountSettingsScope } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import { createClient } from "@/utils/supabase/client";
import { fetchAccountWebApi, WebApiError } from "@/lib/web-api/client";
import FreeModelSettings from "./FreeModelSettings";

jest.mock("@tanstack/react-query", () => ({ useMutation: jest.fn(), useQuery: jest.fn(), useQueryClient: jest.fn() }));
jest.mock("@/components/(gateway)/settings/PrivateSettingsQuery", () => ({ useAccountSettingsScope: jest.fn() }));
jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/web-api/client", () => ({
    fetchAccountWebApi: jest.fn(), WebApiError: class extends Error { constructor(public path: string, public status: number) { super(path); } },
}));
jest.mock("@/components/(gateway)/settings/SettingsSectionFallback", () => () => <p>Loading allowance</p>);
jest.mock("@/components/(gateway)/settings/SettingsPageHeader", () => ({ title, description }: { title: string; description: string }) => <header><h1>{title}</h1><p>{description}</p></header>);

const data = { allowOverage: false, policyVersion: 2, requestsUsedToday: 4, requestsIncluded: 1500,
    rpm: 25, overageFeeNanos: 100000, resetsAtMs: 86400000, overageAvailable: false };
const setQueryData = jest.fn();
const refetch = jest.fn();
const reset = jest.fn();
const session = jest.fn();
let query: Record<string, unknown>, mutation: Record<string, unknown>;
beforeEach(() => {
    jest.clearAllMocks();
    query = { data: { data }, isPending: false, isFetching: false, error: null, refetch };
    mutation = { isPending: false, isSuccess: false, error: null, reset, mutate: jest.fn() };
    jest.mocked(useQuery).mockImplementation(() => query as never);
    jest.mocked(useMutation).mockImplementation(() => mutation as never);
    jest.mocked(useQueryClient).mockReturnValue({ setQueryData } as never);
    jest.mocked(useAccountSettingsScope).mockReturnValue({ userId: "owner", workspaceId: "workspace-a" });
    session.mockResolvedValue({ data: { session: { user: { id: "owner" }, access_token: "session" } } });
    jest.mocked(createClient).mockReturnValue({ auth: { getSession: session } } as never);
    jest.mocked(fetchAccountWebApi).mockResolvedValue({ data });
});
const render = () => renderToStaticMarkup(<FreeModelSettings />);
const queryOptions = () => jest.mocked(useQuery).mock.calls.at(-1)![0] as any;
const mutationOptions = () => jest.mocked(useMutation).mock.calls.at(-1)![0] as any;

it("uses an owner-only key with no polling, automatic retries or inactive retention", () => {
    expect(render()).toContain("every workspace you own");
    const first = queryOptions();
    expect(first).toMatchObject({ staleTime: 0, gcTime: 0, retry: false, refetchInterval: false,
        refetchOnWindowFocus: false, refetchOnReconnect: false });
    jest.mocked(useAccountSettingsScope).mockReturnValue({ userId: "owner", workspaceId: "workspace-b" });
    render();
    expect(queryOptions().queryKey).toEqual(first.queryKey);
    jest.mocked(useAccountSettingsScope).mockReturnValue({ userId: "other", workspaceId: "workspace-b" });
    render();
    expect(queryOptions().queryKey).not.toEqual(first.queryKey);
});
it("shows loading, unavailable and auth errors without stale counters", () => {
    query = { ...query, data: undefined, isPending: true };
    expect(render()).toContain("Loading allowance");
    query = { ...query, data: { data }, isPending: false, error: new WebApiError("quota", 404) };
    expect(render()).toContain("not enabled yet");
    expect(render()).not.toContain("Included requests used");
    query.error = new WebApiError("quota", 401);
    expect(render()).toContain("Sign in again");
    expect(render()).not.toContain("Included requests used");
});
it("shows zero accurately and does not offer paid enable", () => {
    query.data = { data: { ...data, requestsUsedToday: 0 } };
    const html = render();
    expect(html).toContain("0 / 1,500");
    expect(html).toContain("Paid overage is not available");
    expect(html).not.toContain("Disable saved consent");
});
it("requires the browser session to match the owner before reading or writing", async () => {
    render();
    session.mockResolvedValue({ data: { session: { user: { id: "other" }, access_token: "other" } } });
    await expect(queryOptions().queryFn({ signal: new AbortController().signal })).rejects.toMatchObject({ status: 401 });
    await expect(mutationOptions().mutationFn(2)).rejects.toMatchObject({ status: 401 });
    expect(fetchAccountWebApi).not.toHaveBeenCalled();
});
it("sends only a version-fenced disable without an optimistic or unmounted cache update", async () => {
    render();
    const options = mutationOptions();
    expect(options.retry).toBe(false);
    expect(options.gcTime).toBe(0);
    expect(options.onSuccess).toBeUndefined();
    await options.mutationFn(2);
    expect(fetchAccountWebApi).toHaveBeenCalledWith("/api/account/free-model-quota", "session", expect.objectContaining({
        method: "PATCH", body: JSON.stringify({ allowOverage: false, expectedVersion: 2 }),
    }));
    expect(setQueryData).not.toHaveBeenCalled();
});
it("blocks repeat mutations until refresh after conflicts or ambiguous failures", () => {
    query.data = { data: { ...data, allowOverage: true } };
    mutation.error = new WebApiError("quota", 409);
    const html = render();
    expect(html).toContain("change could not be confirmed");
    expect(html).toMatch(/disabled=""[^>]*>Disable saved consent/);
    expect(html).not.toContain("consent is disabled.");
});
it("shows confirmed success and pending state accessibly", () => {
    mutation.isSuccess = true;
    expect(render()).toContain('role="status">Paid overage consent is disabled.');
    mutation = { ...mutation, isSuccess: false, isPending: true };
    query.data = { data: { ...data, allowOverage: true } };
    expect(render()).toContain("Disabling…");
});
it("labels stale state if a refresh fails and disables changes", () => {
    query.data = { data: { ...data, allowOverage: true } };
    query.error = new Error("offline");
    const html = render();
    expect(html).toContain("Showing the last confirmed state");
    expect(html).toMatch(/disabled=""[^>]*>Disable saved consent/);
});
