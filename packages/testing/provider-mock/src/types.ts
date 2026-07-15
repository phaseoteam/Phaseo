import type { IncomingHttpHeaders } from "node:http";

export type JsonSchema = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  nullable?: boolean;
  $ref?: string;
};

export type OpenApiDocument = {
  openapi?: string;
  swagger?: string;
  paths?: Record<string, Record<string, OpenApiOperation | unknown>>;
  components?: { schemas?: Record<string, JsonSchema> };
  definitions?: Record<string, JsonSchema>;
};

export type OpenApiOperation = {
  operationId?: string;
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: JsonSchema; example?: unknown }>;
  };
  parameters?: Array<{
    in?: string;
    name?: string;
    required?: boolean;
    schema?: JsonSchema;
  }>;
  responses?: Record<string, {
    content?: Record<string, { schema?: JsonSchema; example?: unknown; examples?: Record<string, { value?: unknown }> }>;
  }>;
};

export type MockRequest = {
  id: string;
  providerId: string;
  operationId: string;
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
  receivedAt: number;
};

export type MockResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  delayMs?: number;
};

export type MockOperation = {
  providerId: string;
  operationId: string;
  method: string;
  path: string;
  requestSchema?: JsonSchema;
  response?: MockResponse | ((request: MockRequest) => MockResponse | Promise<MockResponse>);
  strict?: boolean;
};

export type MockFault = {
  providerId?: string;
  operationId?: string;
  testId?: string;
  times?: number;
  response: MockResponse;
};

export type ValidationIssue = {
  path: string;
  keyword: "required" | "additionalProperties" | "type" | "enum" | "const" | "union";
  message: string;
};

export type RequestRecord = MockRequest & {
  response: { status: number };
  validationIssues: ValidationIssue[];
};

export type ProviderRegistrationOptions = {
  basePath?: string;
  strict?: boolean;
  operations?: string[];
  defaultResponse?: MockOperation["response"];
  responses?: Record<string, MockOperation["response"]>;
};

export function flattenHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).flatMap(([key, value]) => {
    if (value == null) return [];
    return [[key.toLowerCase(), Array.isArray(value) ? value.join(", ") : value]];
  }));
}
