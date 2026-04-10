// Purpose: Shared helpers for active-providers live integration test.

import fs from "node:fs";
import path from "node:path";

function nowIso(): string {
    return new Date().toISOString();
}

function timestampSlug(): string {
    return nowIso().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function serializeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function resultsReportPath(): string {
    const explicit = (process.env.LIVE_RESULTS_PATH ?? "").trim();
    if (explicit) return path.resolve(explicit);
    return path.resolve(process.cwd(), "reports", "provider-live", `active-providers-${timestampSlug()}.json`);
}

export function writeResultsReport(
	providers: string[],
	scenarios: string[],
	runs: unknown[],
	gatewayUrl: string,
	allowTransientFailures: boolean,
) {
    const reportPath = resultsReportPath();
    const totals = {
        passed: 0,
        failed: 0,
        skipped_no_model: 0,
        skipped_transient: 0,
    };

    for (const run of runs) {
        if (run.status === "passed") totals.passed += 1;
        if (run.status === "failed") totals.failed += 1;
        if (run.status === "skipped_no_model") totals.skipped_no_model += 1;
        if (run.status === "skipped_transient") totals.skipped_transient += 1;
    }

    const payload = {
        generated_at: nowIso(),
        gateway_url: gatewayUrl,
        strict_transient_failures: !allowTransientFailures,
        providers,
        scenarios,
        totals,
        runs: runs,
    };

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), "utf8");
    console.log(`[live-provider-tests] results report: ${reportPath}`);
}

export function extractResponseText(jsonBody: any): string {
    if (typeof jsonBody?.output_text === "string" && jsonBody.output_text.trim()) return jsonBody.output_text;
    const output = Array.isArray(jsonBody?.output) ? jsonBody.output : [];
    const parts: string[] = [];
    for (const item of output) {
        if (item?.type !== "message") continue;
        const content = Array.isArray(item?.content) ? item.content : [];
        for (const part of content) {
            if (typeof part?.text === "string") parts.push(part.text);
        }
    }
    return parts.join("\n");
}

export function parseJsonLoose(text: string): any | null {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced?.[1]) {
            try {
                return JSON.parse(fenced[1].trim());
            } catch {
                // continue
            }
        }
        const objMatch = trimmed.match(/\{[\s\S]*\}/);
        if (objMatch?.[0]) {
            try {
                return JSON.parse(objMatch[0]);
            } catch {
                return null;
            }
        }
        return null;
    }
}
