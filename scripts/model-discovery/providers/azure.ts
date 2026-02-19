import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "azure",
    name: "Azure",
    requiredEnv: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_BASE_URL"],
    async fetchModels() {
        const key = process.env.AZURE_OPENAI_API_KEY;
        const baseUrl = process.env.AZURE_OPENAI_BASE_URL;
        if (!key) {
            throw new Error("Missing API key: AZURE_OPENAI_API_KEY");
        }
        if (!baseUrl) {
            throw new Error("Missing base URL for azure");
        }

        const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "2024-02-15-preview";
        const payload = await fetchJson({
            url: `${baseUrl.replace(/\/+$/, "")}/openai/models?api-version=${encodeURIComponent(apiVersion)}`,
            init: {
                headers: {
                    "api-key": key,
                },
            },
        });

        const models = asArray(asRecord(payload)?.data).length
            ? asArray(asRecord(payload)?.data)
            : asArray(asRecord(payload)?.models);
        return normalizeModelEntries(models, (item) => (typeof item.id === "string" ? item.id : null));
    },
});
