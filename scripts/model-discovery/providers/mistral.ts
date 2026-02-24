import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

// Mistral's `created` can drift between list calls, so we diff on stable metadata only.
const STABLE_MISTRAL_MODEL_KEYS = new Set(["id", "capabilities", "max_context_length"]);

function normalizeMistralModelForDiff(model: Record<string, unknown>): Record<string, unknown> {
    const stable: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(model)) {
        if (STABLE_MISTRAL_MODEL_KEYS.has(key) || key.toLowerCase().includes("deprecat")) {
            stable[key] = value;
        }
    }

    return stable;
}

export default defineProvider({
    id: "mistral",
    name: "Mistral",
    requiredEnv: ["MISTRAL_API_KEY"],
    async fetchModels() {
        const payload = await fetchJson({
            url: "https://api.mistral.ai/v1/models",
            init: {
                headers: {
                    Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
                },
            },
        });
        const data = asArray(asRecord(payload)?.data);
        const stableData = data.map((entry) => {
            const model = asRecord(entry);
            if (!model) return entry;
            return normalizeMistralModelForDiff(model);
        });
        return normalizeModelEntries(stableData, (item) => (typeof item.id === "string" ? item.id : null));
    },
});
