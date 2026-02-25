import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
	id: "elevenlabs",
	name: "ElevenLabs",
	requiredEnv: ["ELEVENLABS_API_KEY"],
	async fetchModels() {
		const apiKey = process.env.ELEVENLABS_API_KEY;
		if (!apiKey) {
			throw new Error("Missing API key: ELEVENLABS_API_KEY");
		}

		const baseUrl = String(process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");
		const payload = await fetchJson({
			url: `${baseUrl}/v1/models`,
			init: {
				headers: {
					"xi-api-key": apiKey,
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
			if (typeof item.model_id === "string" && item.model_id.trim()) {
				return item.model_id.trim();
			}
			if (typeof item.id === "string" && item.id.trim()) {
				return item.id.trim();
			}
			if (typeof item.name === "string" && item.name.trim()) {
				return item.name.trim();
			}
			return null;
		});
	},
});
