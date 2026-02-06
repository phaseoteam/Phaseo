import { AIStats } from "../src";

const key = process.env.AI_STATS_API_KEY;
if (!key) throw new Error("Set AI_STATS_API_KEY");

async function main() {
  const client = new AIStats({ apiKey: key });
  const response = await client.generateEmbedding({
    model: "google/gemini-embedding-001",
    input: "Vector search uses embeddings to compare meaning.",
  });
  console.log("embedding length:", response.data?.[0]?.embedding?.length);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
