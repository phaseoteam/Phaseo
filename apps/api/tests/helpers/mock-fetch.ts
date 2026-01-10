export type FetchCall = {
    url: string;
    method: string;
    headers: Record<string, string>;
    bodyText: string | null;
    bodyJson: any;
};

export type FetchMockHandler = {
    match: (url: string, init?: RequestInit) => boolean;
    response: Response | (() => Response | Promise<Response>);
    onRequest?: (call: FetchCall) => void;
};

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
    if (!headers) return {};
    if (headers instanceof Headers) {
        return Object.fromEntries(headers.entries());
    }
    if (Array.isArray(headers)) {
        return Object.fromEntries(headers);
    }
    return { ...headers } as Record<string, string>;
}

async function readBodyText(body: RequestInit["body"]): Promise<string | null> {
    if (body === undefined || body === null) return null;
    if (typeof body === "string") return body;
    if (body instanceof Uint8Array) return new TextDecoder().decode(body);
    if (body instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(body));
    if (typeof Blob !== "undefined" && body instanceof Blob) {
        return await body.text();
    }
    return null;
}

export function installFetchMock(handlers: FetchMockHandler[]) {
    const original = globalThis.fetch;
    const calls: FetchCall[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string"
            ? input
            : (input instanceof URL ? input.toString() : input.url);
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        const headers = headersToRecord(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        const bodyText = await readBodyText(init?.body ?? (input instanceof Request ? input.body : undefined));
        let bodyJson: any = null;
        if (bodyText) {
            try {
                bodyJson = JSON.parse(bodyText);
            } catch {
                bodyJson = bodyText;
            }
        }
        const call: FetchCall = { url, method, headers, bodyText, bodyJson };
        calls.push(call);

        const handler = handlers.find((entry) => entry.match(url, init));
        if (!handler) {
            throw new Error(`Unexpected fetch call: ${method} ${url}`);
        }
        if (handler.onRequest) handler.onRequest(call);
        const response = typeof handler.response === "function" ? await handler.response() : handler.response;
        return response;
    }) as typeof fetch;

    return {
        calls,
        restore() {
            globalThis.fetch = original;
        },
    };
}

export function jsonResponse(body: any, init?: ResponseInit): Response {
    return new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: {
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
        },
    });
}
