import { Phaseo } from "../src";

const key = process.env.PHASEO_API_KEY;
if (!key) throw new Error("Set PHASEO_API_KEY");

async function main() {
  const client = new Phaseo({ apiKey: key });
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
