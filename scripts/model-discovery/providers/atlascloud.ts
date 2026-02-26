import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

function hasLlmCategory(model: Record<string, unknown>): boolean {
    const categories = asArray(model.categories).filter((value): value is string => typeof value === "string");
    if (categories.some((value) => value.trim().toLowerCase() === "llm")) return true;

    const category = model.category;
    if (typeof category === "string") {
        return category
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .some((value) => value === "llm");
    }

    return false;
}

export default defineProvider({
    id: "atlascloud",
    name: "AtlasCloud",
    requiredEnv: ["ATLAS_CLOUD_API_KEY"],
    async fetchModels() {
        const apiKey = process.env.ATLAS_CLOUD_API_KEY;
        if (!apiKey) {
            throw new Error("Missing API key: ATLAS_CLOUD_API_KEY");
        }

        const baseUrl = String(process.env.ATLAS_CLOUD_BASE_URL || "https://api.atlascloud.ai").replace(/\/+$/, "");
        const payload = await fetchJson({
            url: `${baseUrl}/api/v1/models`,
            init: {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            },
        });

        const payloadRecord = asRecord(payload);
        const models = asArray(payloadRecord?.data).length
            ? asArray(payloadRecord?.data)
            : asArray(payloadRecord?.models).length
              ? asArray(payloadRecord?.models)
              : asArray(payload);

        const llmModels = models.filter((value) => {
            const row = asRecord(value);
            return row ? hasLlmCategory(row) : false;
        });

        return normalizeModelEntries(llmModels, (item) => (typeof item.id === "string" ? item.id.trim() : null));
    },
});

