import { describe, expect, test } from "vitest";
import { computeAsyncWebhookSignature, verifyAsyncWebhookSignature } from "../src/index.js";

describe("async webhook signature helpers", () => {
  const secret = "whsec_test_123";
  const timestamp = "1781166600";
  const nowMs = Date.parse("2026-06-11T08:30:00.000Z");
  const body = JSON.stringify({
    id: "evt_123",
    type: "batch.completed",
    data: {
      id: "batch_123",
      status: "completed",
    },
  });

  test("verifies a valid AI Stats async webhook signature", () => {
    const signature = computeAsyncWebhookSignature(secret, timestamp, body);

    expect(verifyAsyncWebhookSignature({
      secret,
      body,
      headers: {
        "x-ai-stats-timestamp": timestamp,
        "x-ai-stats-signature": signature,
      },
      now: nowMs + 30_000,
    })).toBe(true);
  });

  test("rejects tampered webhook bodies", () => {
    const signature = computeAsyncWebhookSignature(secret, timestamp, body);

    expect(verifyAsyncWebhookSignature({
      secret,
      body: body.replace("completed", "failed"),
      headers: {
        "x-ai-stats-timestamp": timestamp,
        "x-ai-stats-signature": signature,
      },
      now: nowMs,
    })).toBe(false);
  });

  test("rejects stale webhook timestamps by default", () => {
    const signature = computeAsyncWebhookSignature(secret, timestamp, body);

    expect(verifyAsyncWebhookSignature({
      secret,
      body,
      headers: {
        "x-ai-stats-timestamp": timestamp,
        "x-ai-stats-signature": signature,
      },
      now: nowMs + 301_000,
    })).toBe(false);
  });

  test("accepts numeric now values in Unix seconds", () => {
    const signature = computeAsyncWebhookSignature(secret, timestamp, body);

    expect(verifyAsyncWebhookSignature({
      secret,
      body,
      headers: {
        "x-ai-stats-timestamp": timestamp,
        "x-ai-stats-signature": signature,
      },
      now: 1781166630,
    })).toBe(true);
  });

  test("accepts uppercase hex signatures", () => {
    const signature = computeAsyncWebhookSignature(secret, timestamp, body).toUpperCase();

    expect(verifyAsyncWebhookSignature({
      secret,
      body,
      headers: {
        "x-ai-stats-timestamp": timestamp,
        "x-ai-stats-signature": signature,
      },
      now: nowMs,
    })).toBe(true);
  });

  test("accepts Headers objects and binary bodies", () => {
    const bytes = new TextEncoder().encode(body);
    const signature = computeAsyncWebhookSignature(secret, timestamp, bytes);
    const headers = new Headers({
      "x-ai-stats-timestamp": timestamp,
      "x-ai-stats-signature": signature,
    });

    expect(verifyAsyncWebhookSignature({
      secret,
      body: bytes,
      headers,
      now: nowMs,
    })).toBe(true);
  });

  test("also accepts ISO timestamp headers", () => {
    const isoTimestamp = "2026-06-11T08:30:00.000Z";
    const signature = computeAsyncWebhookSignature(secret, isoTimestamp, body);

    expect(verifyAsyncWebhookSignature({
      secret,
      body,
      headers: {
        "x-ai-stats-timestamp": isoTimestamp,
        "x-ai-stats-signature": signature,
      },
      now: nowMs,
    })).toBe(true);
  });
});
