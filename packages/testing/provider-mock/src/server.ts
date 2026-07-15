import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { flattenHeaders, type MockFault, type MockOperation, type MockRequest, type MockResponse, type OpenApiDocument, type OpenApiOperation, type ProviderRegistrationOptions, type RequestRecord } from "./types.js";
import { validateSchema } from "./schema.js";

const METHODS = new Set(["get", "post", "put", "patch", "delete"]);

function joinPath(...parts: Array<string | undefined>): string {
  const joined = parts.filter(Boolean).join("/").replace(/\/+/g, "/");
  return `/${joined.replace(/^\/+|\/+$/g, "")}`;
}

function pathMatches(template: string, actual: string): boolean {
  const templateSegments = template.split("/").filter(Boolean);
  const actualSegments = actual.split("/").filter(Boolean);
  return templateSegments.length === actualSegments.length && templateSegments.every((segment, index) => {
    const actualSegment = actualSegments[index];
    let templateOffset = 0;
    let actualOffset = 0;

    while (templateOffset < segment.length) {
      const placeholderStart = segment.indexOf("{", templateOffset);
      if (placeholderStart === -1) {
        return actualSegment.slice(actualOffset) === segment.slice(templateOffset);
      }

      const prefix = segment.slice(templateOffset, placeholderStart);
      if (!actualSegment.startsWith(prefix, actualOffset)) return false;
      actualOffset += prefix.length;

      const placeholderEnd = segment.indexOf("}", placeholderStart + 1);
      if (placeholderEnd === -1 || placeholderEnd === placeholderStart + 1) return false;

      const nextPlaceholder = segment.indexOf("{", placeholderEnd + 1);
      const suffix = segment.slice(
        placeholderEnd + 1,
        nextPlaceholder === -1 ? segment.length : nextPlaceholder,
      );
      if (!suffix) return nextPlaceholder === -1 && actualOffset < actualSegment.length;

      const suffixOffset = actualSegment.indexOf(suffix, actualOffset);
      if (suffixOffset <= actualOffset) return false;
      actualOffset = suffixOffset + suffix.length;
      templateOffset = nextPlaceholder === -1 ? segment.length : nextPlaceholder;
    }

    return actualOffset === actualSegment.length;
  });
}

async function readBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8");
  const contentType = String(request.headers["content-type"] ?? "");
  if (contentType.includes("json")) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

function exampleResponse(operation: OpenApiOperation): unknown {
  const response = operation.responses?.["200"] ?? operation.responses?.["201"] ?? operation.responses?.default;
  const media = response?.content?.["application/json"];
  if (media?.example !== undefined) return media.example;
  const first = Object.values(media?.examples ?? {})[0];
  return first?.value ?? { id: "mock_response", object: "mock.response" };
}

export class ProviderMockServer {
  private server: Server | undefined;
  private operations: Array<MockOperation & { document?: OpenApiDocument }> = [];
  private faults: Array<MockFault & { remaining: number }> = [];
  private records: RequestRecord[] = [];
  private sequence = 0;
  public url = "";

  register(operation: MockOperation): this {
    this.operations.push({ ...operation, method: operation.method.toUpperCase() });
    return this;
  }

  registerOpenApi(providerId: string, document: OpenApiDocument, options: ProviderRegistrationOptions = {}): this {
    for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
      for (const [method, candidate] of Object.entries(pathItem)) {
        if (!METHODS.has(method.toLowerCase()) || !candidate || typeof candidate !== "object") continue;
        const operation = candidate as OpenApiOperation;
        const operationId = operation.operationId ?? `${method.toLowerCase()}_${path.replace(/\W+/g, "_")}`;
        if (options.operations?.length && !options.operations.includes(operationId)) continue;
        const json = operation.requestBody?.content?.["application/json"];
        this.operations.push({
          providerId,
          operationId,
          method: method.toUpperCase(),
          path: joinPath(options.basePath, path),
          requestSchema: json?.schema,
          strict: options.strict,
          response: options.responses?.[operationId] ?? options.defaultResponse ?? { body: exampleResponse(operation) },
          document,
        });
      }
    }
    return this;
  }

  fault(fault: MockFault): this {
    this.faults.push({ ...fault, remaining: fault.times ?? 1 });
    return this;
  }

  getRequests(filter: Partial<Pick<MockRequest, "providerId" | "operationId">> = {}): RequestRecord[] {
    return this.records.filter((record) =>
      (!filter.providerId || record.providerId === filter.providerId) &&
      (!filter.operationId || record.operationId === filter.operationId));
  }

  getLastRequest(): RequestRecord | undefined { return this.records.at(-1); }
  clear(): void { this.records = []; this.sequence = 0; }

  async start(options: { host?: string; port?: number } = {}): Promise<this> {
    if (this.server) return this;
    const host = options.host ?? "127.0.0.1";
    this.server = createServer(async (incoming, outgoing) => {
      const parsed = new URL(incoming.url ?? "/", `http://${incoming.headers.host ?? host}`);
      const method = (incoming.method ?? "GET").toUpperCase();
      const registered = this.operations.find((operation) => operation.method === method && pathMatches(operation.path, parsed.pathname));
      if (!registered) {
        outgoing.writeHead(404, { "content-type": "application/json" });
        outgoing.end(JSON.stringify({ error: { message: `No mock operation for ${method} ${parsed.pathname}` } }));
        return;
      }
      const request: MockRequest = {
        id: `mock_req_${++this.sequence}`,
        providerId: registered.providerId,
        operationId: registered.operationId,
        method,
        path: parsed.pathname,
        query: parsed.searchParams,
        headers: flattenHeaders(incoming.headers),
        body: await readBody(incoming),
        receivedAt: Date.now(),
      };
      const issues = validateSchema(request.body, registered.requestSchema, registered.document);
      const testId = request.headers["x-test-id"];
      const fault = this.faults.find((entry) => entry.remaining > 0 &&
        (!entry.providerId || entry.providerId === request.providerId) &&
        (!entry.operationId || entry.operationId === request.operationId) &&
        (!entry.testId || entry.testId === testId));
      let response: MockResponse;
      if (fault) {
        fault.remaining -= 1;
        response = fault.response;
      } else if (registered.strict !== false && issues.length) {
        const unsupported = issues.find((issue) => issue.keyword === "additionalProperties");
        response = {
          status: 400,
          body: { error: { type: "invalid_request_error", message: unsupported ? `unsupported parameter: ${unsupported.path.replace(/^\$\./, "")}` : "request does not match provider contract", param: unsupported?.path.replace(/^\$\./, ""), details: issues } },
        };
      } else {
        response = typeof registered.response === "function" ? await registered.response(request) : registered.response ?? {};
      }
      const status = response.status ?? 200;
      this.records.push({ ...request, response: { status }, validationIssues: issues });
      if (response.delayMs) await delay(response.delayMs);
      const headers = { "content-type": "application/json", ...response.headers };
      outgoing.writeHead(status, headers);
      outgoing.end(response.body === undefined ? "" : typeof response.body === "string" || Buffer.isBuffer(response.body) ? response.body : JSON.stringify(response.body));
    });
    this.server.listen(options.port ?? 0, host);
    await once(this.server, "listening");
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("provider mock did not bind a TCP port");
    this.url = `http://${host}:${address.port}`;
    return this;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const current = this.server;
    this.server = undefined;
    current.close();
    await once(current, "close");
    this.url = "";
  }
}
