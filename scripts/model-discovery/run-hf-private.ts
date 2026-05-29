import path from "node:path";
import { syncUpstreamDiscoveryIssues, type UpstreamDiscoveryIssueEntry } from "./github-issues";
import { runInternalModelDiscovery, type HuggingFaceDiscoveryIssueSignal } from "./run-internal";

const ISSUE_STATE_PATH = path.join(process.cwd(), "scripts", "model-discovery", "state", "provider-change-issues.json");

function nowIso(): string {
    return new Date().toISOString();
}

function buildHfIssueEntries(hfAdditionsByOrg: HuggingFaceDiscoveryIssueSignal[]): UpstreamDiscoveryIssueEntry[] {
    const ts = nowIso();
    const out: UpstreamDiscoveryIssueEntry[] = [];

    for (const orgEntry of hfAdditionsByOrg) {
        for (const modelId of orgEntry.addedModelIds) {
            out.push({
                source: "huggingface",
                ts,
                action: "create",
                platformId: "huggingface",
                platformName: "Hugging Face",
                providerId: orgEntry.org,
                providerName: orgEntry.org,
                modelId,
                modelUrl: `https://huggingface.co/${modelId}`,
                reason: "Detected from watched Hugging Face source",
            });
        }
    }

    return out;
}

async function syncHfIssues(hfAdditionsByOrg: HuggingFaceDiscoveryIssueSignal[]): Promise<void> {
    const entries = buildHfIssueEntries(hfAdditionsByOrg);
    console.log("[internal-model-check] Syncing GitHub issues for detected upstream Hugging Face model changes.");
    const issueSync = await syncUpstreamDiscoveryIssues(entries, {
        statePath: ISSUE_STATE_PATH,
        logger: console,
    });
    if (!issueSync.skipped) {
        console.log(
            `[internal-model-check] Hugging Face GitHub issue sync complete: created=${issueSync.created}, updated=${issueSync.updated}.`
        );
    }
}

async function main(): Promise<void> {
    const args = [...process.argv.slice(2), "--skip-internal"];
    await runInternalModelDiscovery(args, {
        afterHfNotifications: syncHfIssues,
    });
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[internal-model-check] Fatal error: ${message}`);
    process.exitCode = 1;
});
