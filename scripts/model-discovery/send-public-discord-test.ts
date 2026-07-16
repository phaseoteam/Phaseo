import {
    buildWebhookPayload,
    sendDiscordWebhookPayload,
} from "../../apps/web/src/lib/model-discovery/internalModelDiscordNotifier";

const webhookUrl = process.env.DISCORD_WEBHOOK_NEW_MODELS_PUBLIC?.trim() ?? "";
const roleId = process.env.DISCORD_ROLE_ID?.trim() ?? "";

if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_NEW_MODELS_PUBLIC is required");
}

const payload = buildWebhookPayload(
    [
        {
            modelId: "phaseo/test-model",
            modelName: "Test Model Notification",
            modelUrl: "https://phaseo.app/models",
            creatorId: "phaseo",
            creatorName: "Phaseo",
            changeSummaryLines: [
                "This is a formatting test for the public model-updates channel.",
                "No production model was added by this message.",
            ],
        },
    ],
    roleId || null,
    {
        includeMentions: true,
        username: "Phaseo Model Updates",
        avatarUrl: "https://phaseo.app/png_logo_light.png",
        maxModelEmbeds: 10,
    },
);

await sendDiscordWebhookPayload(webhookUrl, payload, {
    maxAttempts: 3,
    timeoutMs: 10_000,
    retryDelayMs: 750,
    logger: console,
});

console.log("Public Discord test sent successfully.");
