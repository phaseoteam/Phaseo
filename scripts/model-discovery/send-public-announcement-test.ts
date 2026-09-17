import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    buildPublicModelAnnouncementPayload,
    type PublicModelAnnouncementModel,
} from "../../apps/api/src/pipeline/model-discovery/public-model-announcement-discord";
import { sendDiscordWebhookPayload } from "../../apps/api/src/pipeline/model-discovery/discord-webhook";

const TEST_WEBHOOK_ENV = "DISCORD_WEBHOOK_NEW_MODELS_PUBLIC_TEST";
const PRODUCTION_WEBHOOK_ENV = "DISCORD_WEBHOOK_NEW_MODELS_PUBLIC";
const ALLOWED_WEBHOOK_ENVS = new Set([TEST_WEBHOOK_ENV, PRODUCTION_WEBHOOK_ENV]);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DEFAULT_MODEL_ID = "phaseo/test-public-model";

function parseEnvValue(raw: string): string {
    const value = raw.trim();
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        return value.slice(1, -1);
    }
    return value;
}

function loadTestWebhookFromLocalFiles(): void {
    if (process.env[TEST_WEBHOOK_ENV]?.trim()) return;

    const candidates = [
        path.join(REPO_ROOT, "apps", "api", ".dev.vars"),
        path.join(REPO_ROOT, "scripts", "model-discovery", ".dev.vars"),
    ];

    for (const filePath of candidates) {
        if (!fs.existsSync(filePath)) continue;
        const line = fs
            .readFileSync(filePath, "utf8")
            .split(/\r?\n/)
            .find((entry) => entry.trimStart().startsWith(`${TEST_WEBHOOK_ENV}=`));
        if (!line) continue;

        const separator = line.indexOf("=");
        const value = separator >= 0 ? parseEnvValue(line.slice(separator + 1)) : "";
        if (value.trim()) {
            process.env[TEST_WEBHOOK_ENV] = value.trim();
            return;
        }
    }
}

function readFlagValue(args: string[], flag: string): string | null {
    const index = args.indexOf(flag);
    if (index < 0) return null;
    const value = args[index + 1]?.trim();
    if (!value || value.startsWith("--")) {
        throw new Error(`${flag} requires a value.`);
    }
    return value;
}

function readWebhookEnv(args: string[]): string {
    const webhookEnv = readFlagValue(args, "--webhook-env") ?? TEST_WEBHOOK_ENV;
    if (!ALLOWED_WEBHOOK_ENVS.has(webhookEnv)) {
        throw new Error(
            `--webhook-env must be ${TEST_WEBHOOK_ENV} or ${PRODUCTION_WEBHOOK_ENV}.`,
        );
    }
    return webhookEnv;
}

function modelPath(modelId: string): string {
    return modelId
        .split("/")
        .map((segment) => encodeURIComponent(segment.trim()))
        .filter(Boolean)
        .join("/");
}

function buildSampleModel(modelId: string): PublicModelAnnouncementModel {
    const encodedPath = modelPath(modelId);
    return {
        modelId,
        modelName: "Public announcement test",
        modelUrl: `https://phaseo.app/models/${encodedPath}`,
        imageUrl: `https://phaseo.app/og/models/${encodedPath}`,
        creatorId: "phaseo",
        creatorName: "Phaseo",
        changeSummaryLines: ["This is a test message and is not a catalogue announcement."],
    };
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const webhookEnv = readWebhookEnv(args);
    if (webhookEnv === TEST_WEBHOOK_ENV) {
        loadTestWebhookFromLocalFiles();
    }

    const modelId = readFlagValue(args, "--model") ?? DEFAULT_MODEL_ID;
    const payload = buildPublicModelAnnouncementPayload([buildSampleModel(modelId)], null, {
        includeMentions: false,
        username: "Phaseo Public Model Discovery (Test)",
        message: "Test notification only. No role or user mentions are included.",
        maxModelEmbeds: 1,
    });

    console.log(`[public-model-announcement-test] Prepared payload for ${modelId}.`);
    console.log("[public-model-announcement-test] Mentions: roles=0, users=0.");
    console.log(`[public-model-announcement-test] Webhook source: ${webhookEnv}.`);

    if (!args.includes("--send")) {
        console.log("[public-model-announcement-test] Dry run only. Re-run with --send to post the sample message.");
        return;
    }

    const webhookUrl = process.env[webhookEnv]?.trim();
    if (!webhookUrl) {
        throw new Error(
            `Set ${webhookEnv} in the shell environment before using --send.`,
        );
    }

    await sendDiscordWebhookPayload(webhookUrl, payload);
    console.log("[public-model-announcement-test] Sent one no-mention test message.");
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[public-model-announcement-test] Failed: ${message}`);
    process.exitCode = 1;
});
