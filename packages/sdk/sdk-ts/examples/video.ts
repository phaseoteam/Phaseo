import { AIStats } from "../src";

const key = process.env.AI_STATS_API_KEY;
if (!key) throw new Error("Set AI_STATS_API_KEY");

async function main() {
  const client = new AIStats({ apiKey: key });
  const response = await client.generateVideo({
    model: "sora-1",
    prompt: "A calm animation of floating lanterns",
  });
  console.log("video status:", response.status);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
