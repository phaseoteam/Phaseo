import { AIStats } from "../src";

const key = process.env.AI_STATS_API_KEY;
if (!key) throw new Error("Set AI_STATS_API_KEY");

async function main() {
  const client = new AIStats({ apiKey: key });
  const response = await client.generateImage({
    model: "stability-diffusion-1",
    prompt: "A minimalistic illustration of a gateway",
  });
  console.log("image count:", response.data.length);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
