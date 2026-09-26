import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MutationObserver, QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import FreeModelSettings from "./FreeModelSettings";

jest.mock("@tanstack/react-query", () => ({ ...jest.requireActual("@tanstack/react-query"),
    useMutation: jest.fn(), useQuery: jest.fn(), useQueryClient: jest.fn() }));
jest.mock("@/components/(gateway)/settings/PrivateSettingsQuery", () => ({
    useAccountSettingsScope: () => ({ userId: "owner-a", workspaceId: "workspace-a" }),
}));
jest.mock("@/utils/supabase/client", () => ({ createClient: () => ({ auth: {
    getSession: async () => ({ data: { session: { user: { id: "owner-a" }, access_token: "fixture" } } }),
} }) }));
jest.mock("@/lib/web-api/client", () => ({ ...jest.requireActual("@/lib/web-api/client"), fetchAccountWebApi: jest.fn() }));
let click: (() => void) | undefined;
jest.mock("@/components/ui/button", () => ({ Button: ({ children, onClick }: any) => {
    if (children === "Disable saved consent") click = onClick;
    return <button onClick={onClick}>{children}</button>;
} }));

const original = { data: { allowOverage: true, policyVersion: 4, requestsUsedToday: 123,
    requestsIncluded: 1500, rpm: 25, overageFeeNanos: 100000, resetsAtMs: 86400000, overageAvailable: false } };
const confirmed = { data: { ...original.data, allowOverage: false, policyVersion: 5 } };
let client: QueryClient;
let observer: MutationObserver<any, any, any, any>;
let unsubscribe: () => void;
let key: readonly unknown[];
let finish: (value: typeof confirmed) => void;
let completed: Promise<unknown>;

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    click = undefined;
    client = new QueryClient();
    jest.mocked(useQueryClient).mockReturnValue(client);
    jest.mocked(useQuery).mockImplementation(options => {
        key = options.queryKey;
        client.setQueryDefaults(key, { gcTime: 0 });
        client.setQueryData(key, original);
        return { data: original, isPending: false, isFetching: false, error: null } as never;
    });
    jest.mocked(useMutation).mockImplementation(options => {
        observer = new MutationObserver(client, options as any);
        unsubscribe = observer.subscribe(() => {});
        return { ...observer.getCurrentResult(), mutate: (variables: unknown, callbacks: any) => {
            completed = observer.mutate(variables, callbacks);
        } } as never;
    });
    jest.mocked(fetchAccountWebApi).mockImplementation(() => new Promise(resolve => { finish = resolve as typeof finish; }));
    renderToStaticMarkup(<FreeModelSettings />);
});
afterEach(() => { unsubscribe(); client.clear(); jest.useRealTimers(); });

async function start() {
    click!();
    // Wait for the real mutation observer's asynchronous session preflight.
    for (let i = 0; i < 10 && !jest.mocked(fetchAccountWebApi).mock.calls.length; i++) await Promise.resolve();
    expect(fetchAccountWebApi).toHaveBeenCalledTimes(1);
}

it("updates a still-mounted owner only after confirmation", async () => {
    await start();
    expect(client.getQueryData(key)).toEqual(original);
    finish(confirmed);
    await completed;
    expect(client.getQueryData(key)).toEqual(confirmed);
});

it.each([false, true])("does not restore an unmounted owner's cache (owner returned: %s)", async returned => {
    await start();
    unsubscribe();
    client.removeQueries({ queryKey: key });
    const newer = { data: { ...original.data, policyVersion: 6, requestsUsedToday: 456 } };
    if (returned) client.setQueryData(key, newer);
    finish(confirmed);
    await completed;
    expect(client.getQueryData(key)).toEqual(returned ? newer : undefined);
    await jest.advanceTimersByTimeAsync(1);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
});
