import { Phaseo } from "../src";

const key = process.env.PHASEO_API_KEY;
if (!key) throw new Error("Set PHASEO_API_KEY");

async function main() {
  const client = new Phaseo({ apiKey: key });
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
