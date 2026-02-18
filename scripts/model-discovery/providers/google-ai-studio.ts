import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "google-ai-studio",
    name: "Google AI Studio",
    requiredEnv: ["GOOGLE_API_KEY"],
    async fetchModels() {
        const payload = await fetchJson({
            url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(process.env.GOOGLE_API_KEY ?? "")}`,
        });
        const models = asArray(asRecord(payload)?.models);
        return normalizeModelEntries(models, (item) => {
            const name = item.name;
            if (typeof name !== "string") return null;
            const parts = name.split("/");
            return parts.length > 1 && parts[1] ? parts[1] : name;
        });
    },
});
