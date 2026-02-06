import { AIStats } from "../src";

const key = process.env.AI_STATS_API_KEY!;
if (!key) throw new Error("Set AI_STATS_API_KEY");

async function main() {
  const client = new AIStats({ apiKey: key });
  const response = await client.getModels({ limit: 5 });
  console.log("models:", response.models.slice(0, 5).map((m) => m.model));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
