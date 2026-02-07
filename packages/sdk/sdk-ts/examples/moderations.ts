import { AIStats } from "../src";

const key = process.env.AI_STATS_API_KEY;
if (!key) throw new Error("Set AI_STATS_API_KEY");

async function main() {
  const client = new AIStats({ apiKey: key });
  const response = await client.generateModeration({
    model: "openai/moderation-latest",
    input: "Please rate this message for safety.",
  });
  console.log("moderation result:", response.results?.[0]?.categories);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
