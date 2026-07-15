import type { JsonSchema, OpenApiDocument, ValidationIssue } from "./types.js";

function resolveRef(schema: JsonSchema, document?: OpenApiDocument): JsonSchema {
  if (!schema.$ref || !document) return schema;
  const parts = schema.$ref.replace(/^#\//, "").split("/");
  let value: unknown = document;
  for (const part of parts) value = (value as Record<string, unknown> | undefined)?.[part];
  return value && typeof value === "object" ? value as JsonSchema : schema;
}

function matchesType(value: unknown, expected: string): boolean {
  if (expected === "null") return value === null;
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (expected === "integer") return typeof value === "number" && Number.isInteger(value);
  return typeof value === expected;
}

export function validateSchema(
  value: unknown,
  inputSchema: JsonSchema | undefined,
  document?: OpenApiDocument,
  path = "$",
): ValidationIssue[] {
  if (!inputSchema) return [];
  const schema = resolveRef(inputSchema, document);
  const issues: ValidationIssue[] = [];
  if (schema.allOf?.length) {
    issues.push(...schema.allOf.flatMap((candidate) => validateSchema(value, candidate, document, path)));
  }
  for (const candidates of [schema.anyOf, schema.oneOf]) {
    if (!candidates?.length) continue;
    const attempts = candidates.map((candidate) => validateSchema(value, candidate, document, path));
    if (!attempts.some((candidateIssues) => candidateIssues.length === 0)) {
      const closest = attempts.sort((a, b) => a.length - b.length)[0] ?? [];
      issues.push(...(closest.length ? closest : [{ path, keyword: "union" as const, message: "must match a documented schema variant" }]));
    }
  }

  const inferredType = !schema.type && (schema.properties || schema.required) ? "object" : schema.type;
  const expected = Array.isArray(inferredType) ? inferredType : inferredType ? [inferredType] : [];
  if (value === null && schema.nullable) return [];
  if (expected.length && !expected.some((type) => matchesType(value, type))) {
    issues.push({ path, keyword: "type", message: `must be ${expected.join(" or ")}` });
    return issues;
  }
  if ("const" in schema && !Object.is(schema.const, value)) {
    issues.push({ path, keyword: "const", message: `must equal ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    issues.push({ path, keyword: "enum", message: "must be one of the documented values" });
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (!(required in record)) issues.push({ path: `${path}.${required}`, keyword: "required", message: "is required" });
    }
    for (const [key, child] of Object.entries(record)) {
      const childSchema = schema.properties?.[key];
      if (childSchema) issues.push(...validateSchema(child, childSchema, document, `${path}.${key}`));
      else if (schema.additionalProperties === false) {
        issues.push({ path: `${path}.${key}`, keyword: "additionalProperties", message: "is not supported" });
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        issues.push(...validateSchema(child, schema.additionalProperties, document, `${path}.${key}`));
      }
    }
  } else if (Array.isArray(value) && schema.items) {
    value.forEach((child, index) => issues.push(...validateSchema(child, schema.items, document, `${path}[${index}]`)));
  }
  return issues;
}
