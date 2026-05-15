import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { dirname, resolve } from "path";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { performance } from "perf_hooks";
import { URL } from "url";

type ProbeResult = {
    route: string;
    url: string;
    attempt: number;
    status: number;
    redirectedFrom: string | null;
    durationMs: number;
    requestBytesEstimated: number;
    responseHeaderBytes: number;
    responseBodyBytes: number;
    responseBytesEstimated: number;
    totalBytesEstimated: number;
    contentLength: string;
    contentEncoding: string;
    contentType: string;
    cacheControl: string;
    cdnCacheControl: string;
    vercelCdnCacheControl: string;
    xVercelCache: string;
    xNextjsCache: string;
    age: string;
    etag: string;
    xMiddlewareRewrite: string;
};

type RawResponse = {
    status: number;
    statusMessage: string;
    headers: Record<string, string | string[] | undefined>;
    rawHeaders: string[];
    bodyBytes: number;
    redirectedFrom: string | null;
};

type RequestHeaders = Record<string, string>;

const DEFAULT_ROUTES = [
    "/",
    "/models",
    "/rankings",
    "/api-providers",
    "/pricing",
    "/compare",
    "/api/frontend/search",
    "/api/pricing/models",
    "/sitemap.xml",
    "/robots.txt",
    "/.well-known/ai-stats-home.md?path=/",
    "/og/models/openai/gpt-4o",
];

const DEFAULT_HEADERS = {
    "user-agent": "ai-stats-fot-probe/1.0",
    accept: "*/*",
    "accept-encoding": "br, gzip, deflate",
    connection: "close",
};

function printUsage() {
    console.log(`Usage:
  pnpm --filter @ai-stats/web measure:fot -- --base=https://example.com --repeat=2 --output=tmp/fot.csv

Options:
  --base=<url>             Base URL. Defaults to FOT_BASE_URL or http://localhost:3100.
  --route=<path>           Route to probe. Repeat for multiple routes.
  --routes=<a,b,c>         Comma-separated route list.
  --repeat=<n>             Attempts per route. Defaults to 2.
  --revalidate             Send Pragma/Cache-Control no-cache to force CDN revalidation where supported.
  --header="Name: value"   Extra request header. Repeat for multiple headers.
  --output=<path>          Write CSV by default, or JSON when the path ends in .json.
  --json                   Print raw JSON to stdout.
  --timeout-ms=<n>         Request timeout. Defaults to 30000.`);
}

function argValue(flag: string) {
    const prefix = `${flag}=`;
    const value = process.argv.find((item) => item.startsWith(prefix));
    return value ? value.slice(prefix.length).trim() : null;
}

function argValues(flag: string) {
    const prefix = `${flag}=`;
    return process.argv
        .filter((item) => item.startsWith(prefix))
        .map((item) => item.slice(prefix.length).trim())
        .filter(Boolean);
}

function hasArg(flag: string) {
    return process.argv.includes(flag);
}

function parseHeaders(): RequestHeaders {
    const headers: RequestHeaders = { ...DEFAULT_HEADERS };

    if (hasArg("--revalidate")) {
        headers.pragma = "no-cache";
        headers["cache-control"] = "no-cache";
    }

    for (const raw of argValues("--header")) {
        const separatorIndex = raw.indexOf(":");
        if (separatorIndex <= 0) {
            throw new Error(`Invalid --header value "${raw}". Use --header="Name: value".`);
        }

        const name = raw.slice(0, separatorIndex).trim().toLowerCase();
        const value = raw.slice(separatorIndex + 1).trim();
        if (!name || !value) {
            throw new Error(`Invalid --header value "${raw}". Use --header="Name: value".`);
        }
        headers[name] = value;
    }

    return headers;
}

function parsePositiveInt(value: string | null, fallback: number) {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeBase(raw: string | null) {
    const base = raw ?? process.env.FOT_BASE_URL ?? "http://localhost:3100";
    return base.endsWith("/") ? base.slice(0, -1) : base;
}

function normalizeRoutes() {
    const routeArgs = argValues("--route");
    const commaRoutes = argValue("--routes")
        ?.split(",")
        .map((route) => route.trim())
        .filter(Boolean);
    const routes = routeArgs.length > 0 ? routeArgs : commaRoutes;
    return routes && routes.length > 0 ? routes : DEFAULT_ROUTES;
}

function asHeader(value: string | string[] | undefined) {
    if (Array.isArray(value)) return value.join(", ");
    return value ?? "";
}

function responseHeaderBytes(status: number, statusMessage: string, rawHeaders: string[]) {
    let raw = `HTTP/1.1 ${status} ${statusMessage}\r\n`;
    for (let i = 0; i < rawHeaders.length; i += 2) {
        raw += `${rawHeaders[i]}: ${rawHeaders[i + 1] ?? ""}\r\n`;
    }
    raw += "\r\n";
    return Buffer.byteLength(raw);
}

function estimateRequestBytes(url: URL, headers: RequestHeaders) {
    let raw = `GET ${url.pathname}${url.search} HTTP/1.1\r\n`;
    raw += `host: ${url.host}\r\n`;
    for (const [name, value] of Object.entries(headers)) {
        raw += `${name}: ${value}\r\n`;
    }
    raw += "\r\n";
    return Buffer.byteLength(raw);
}

function resolveRoute(base: string, route: string) {
    if (/^https?:\/\//i.test(route)) {
        return new URL(route);
    }
    return new URL(route.startsWith("/") ? route : `/${route}`, `${base}/`);
}

function requestRaw(
    url: URL,
    headers: RequestHeaders,
    redirectsRemaining = 3,
): Promise<RawResponse> {
    const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest;

    return new Promise((resolveResponse, reject) => {
        const startedAt = performance.now();
        const req = requestFn(
            url,
            {
                method: "GET",
                headers,
                timeout: parsePositiveInt(argValue("--timeout-ms"), 30_000),
            },
            (res) => {
                const chunks: Buffer[] = [];

                res.on("data", (chunk: Buffer) => {
                    chunks.push(chunk);
                });

                res.on("end", () => {
                    const location = res.headers.location;
                    const status = res.statusCode ?? 0;

                    if (
                        location &&
                        status >= 300 &&
                        status < 400 &&
                        redirectsRemaining > 0
                    ) {
                        const nextUrl = new URL(location, url);
                        requestRaw(nextUrl, headers, redirectsRemaining - 1)
                            .then((redirected) =>
                                resolveResponse({
                                    ...redirected,
                                    redirectedFrom: url.toString(),
                                }),
                            )
                            .catch(reject);
                        return;
                    }

                    resolveResponse({
                        status,
                        statusMessage: res.statusMessage ?? "",
                        headers: res.headers,
                        rawHeaders: res.rawHeaders,
                        bodyBytes: chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
                        redirectedFrom: null,
                    });
                });
            },
        );

        req.on("timeout", () => {
            req.destroy(new Error(`Request timed out after ${performance.now() - startedAt}ms`));
        });
        req.on("error", reject);
        req.end();
    });
}

async function probeRoute(
    base: string,
    route: string,
    attempt: number,
    requestHeaders: RequestHeaders,
): Promise<ProbeResult> {
    const url = resolveRoute(base, route);
    const startedAt = performance.now();
    const response = await requestRaw(url, requestHeaders);
    const durationMs = Math.round(performance.now() - startedAt);
    const headers = response.headers;
    const headerBytes = responseHeaderBytes(
        response.status,
        response.statusMessage,
        response.rawHeaders,
    );
    const requestBytes = estimateRequestBytes(url, requestHeaders);
    const responseBytes = headerBytes + response.bodyBytes;

    return {
        route,
        url: url.toString(),
        attempt,
        status: response.status,
        redirectedFrom: response.redirectedFrom,
        durationMs,
        requestBytesEstimated: requestBytes,
        responseHeaderBytes: headerBytes,
        responseBodyBytes: response.bodyBytes,
        responseBytesEstimated: responseBytes,
        totalBytesEstimated: requestBytes + responseBytes,
        contentLength: asHeader(headers["content-length"]),
        contentEncoding: asHeader(headers["content-encoding"]),
        contentType: asHeader(headers["content-type"]),
        cacheControl: asHeader(headers["cache-control"]),
        cdnCacheControl: asHeader(headers["cdn-cache-control"]),
        vercelCdnCacheControl: asHeader(headers["vercel-cdn-cache-control"]),
        xVercelCache: asHeader(headers["x-vercel-cache"]),
        xNextjsCache: asHeader(headers["x-nextjs-cache"]),
        age: asHeader(headers.age),
        etag: asHeader(headers.etag),
        xMiddlewareRewrite: asHeader(headers["x-middleware-rewrite"]),
    };
}

function csvEscape(value: string | number | null) {
    const stringValue = String(value ?? "");
    if (!/[",\r\n]/.test(stringValue)) return stringValue;
    return `"${stringValue.replaceAll('"', '""')}"`;
}

function toCsv(results: ProbeResult[]) {
    const columns = [
        "route",
        "url",
        "attempt",
        "status",
        "redirectedFrom",
        "durationMs",
        "requestBytesEstimated",
        "responseHeaderBytes",
        "responseBodyBytes",
        "responseBytesEstimated",
        "totalBytesEstimated",
        "contentLength",
        "contentEncoding",
        "contentType",
        "cacheControl",
        "cdnCacheControl",
        "vercelCdnCacheControl",
        "xVercelCache",
        "xNextjsCache",
        "age",
        "etag",
        "xMiddlewareRewrite",
    ] as const;

    return [
        columns.join(","),
        ...results.map((result) =>
            columns.map((column) => csvEscape(result[column])).join(","),
        ),
    ].join("\n");
}

function printSummary(results: ProbeResult[]) {
    const latestByRoute = new Map<string, ProbeResult>();
    for (const result of results) {
        latestByRoute.set(result.route, result);
    }

    console.log(
        [
            "route".padEnd(42),
            "status".padStart(6),
            "body".padStart(10),
            "headers".padStart(9),
            "total".padStart(10),
            "vercel".padEnd(10),
            "next".padEnd(8),
            "age".padStart(6),
        ].join("  "),
    );
    console.log("-".repeat(112));

    for (const result of latestByRoute.values()) {
        console.log(
            [
                result.route.slice(0, 42).padEnd(42),
                String(result.status).padStart(6),
                String(result.responseBodyBytes).padStart(10),
                String(result.responseHeaderBytes).padStart(9),
                String(result.totalBytesEstimated).padStart(10),
                (result.xVercelCache || "-").padEnd(10),
                (result.xNextjsCache || "-").padEnd(8),
                (result.age || "-").padStart(6),
            ].join("  "),
        );
    }
}

async function writeOutput(outputPath: string, contents: string) {
    const absolutePath = resolve(process.cwd(), outputPath);
    await mkdir(dirname(absolutePath), { recursive: true });

    await new Promise<void>((resolveWrite, reject) => {
        const stream = createWriteStream(absolutePath, { encoding: "utf8" });
        stream.on("error", reject);
        stream.on("finish", resolveWrite);
        stream.end(contents);
    });

    console.log(`Wrote ${absolutePath}`);
}

async function main() {
    if (hasArg("--help") || hasArg("-h")) {
        printUsage();
        return;
    }

    const base = normalizeBase(argValue("--base"));
    const routes = normalizeRoutes();
    const repeat = parsePositiveInt(argValue("--repeat"), 2);
    const requestHeaders = parseHeaders();
    const results: ProbeResult[] = [];

    console.log(`Probing ${routes.length} route(s) at ${base} with ${repeat} attempt(s).`);

    for (let attempt = 1; attempt <= repeat; attempt += 1) {
        for (const route of routes) {
            try {
                results.push(await probeRoute(base, route, attempt, requestHeaders));
            } catch (error) {
                console.error(
                    `Failed ${route} attempt ${attempt}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }
    }

    if (hasArg("--json")) {
        console.log(JSON.stringify(results, null, 2));
    } else {
        printSummary(results);
    }

    const outputPath = argValue("--output");
    if (outputPath) {
        await writeOutput(
            outputPath,
            outputPath.endsWith(".json") ? JSON.stringify(results, null, 2) : toCsv(results),
        );
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
