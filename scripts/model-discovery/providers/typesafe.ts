import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "typesafe",
    name: "TypeSafe",
    requiredEnv: ["TYPESAFE_API_KEY"],
    async fetchModels() {
        const apiKey = process.env.TYPESAFE_API_KEY;
        if (!apiKey) {
            throw new Error("Missing API key: TYPESAFE_API_KEY");
        }

        const payload = await fetchJson({
            url: "https://api.typesafe.ai/v1/models",
            init: {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            },
        });

        const payloadRecord = asRecord(payload);
        const models = asArray(payloadRecord?.models).length
            ? asArray(payloadRecord?.models)
            : asArray(payloadRecord?.data).length
                ? asArray(payloadRecord?.data)
                : asArray(payload);

        return normalizeModelEntries(models, (item) => {
            if (typeof item.name === "string" && item.name.trim()) {
                return item.name.trim();
            }
            if (typeof item.id === "string" && item.id.trim()) {
                return item.id.trim();
            }
            return null;
        });
    },
});
