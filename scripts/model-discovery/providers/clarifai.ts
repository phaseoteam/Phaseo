import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "clarifai",
    name: "Clarifai",
    requiredEnv: ["CLARIFAI_PAT"],
    async fetchModels() {
        const apiKey = process.env.CLARIFAI_PAT;
        if (!apiKey) {
            throw new Error("Missing API key: CLARIFAI_PAT");
        }

        const baseUrl = String(process.env.CLARIFAI_BASE_URL || "https://api.clarifai.com").replace(/\/+$/, "");
        const payload = await fetchJson({
            url: `${baseUrl}/v2/models`,
            init: {
                headers: {
                    Authorization: `Key ${apiKey}`,
                },
            },
        });

        const payloadRecord = asRecord(payload);
        const models = asArray(payloadRecord?.models).length
            ? asArray(payloadRecord?.models)
            : asArray(payloadRecord?.data).length
              ? asArray(payloadRecord?.data)
              : asArray(payload);
        const textToTextModels = models.filter((value) => {
            const row = asRecord(value);
            if (!row) return false;
            return typeof row.model_type_id === "string" && row.model_type_id.trim().toLowerCase() === "text-to-text";
        });

        return normalizeModelEntries(textToTextModels, (item) => {
            if (typeof item.id === "string" && item.id.trim()) {
                return item.id.trim();
            }
            if (typeof item.model_id === "string" && item.model_id.trim()) {
                return item.model_id.trim();
            }
            if (typeof item.name === "string" && item.name.trim()) {
                return item.name.trim();
            }
            return null;
        });
    },
});

