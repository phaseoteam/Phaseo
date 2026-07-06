import { Phaseo } from "../src";

const key = process.env.PHASEO_API_KEY!;
if (!key) throw new Error("Set PHASEO_API_KEY");

async function main() {
  const client = new Phaseo({ apiKey: key });
  const response = await client.getModels({ limit: 5 });
  console.log("models:", response.models.slice(0, 5).map((m) => m.model));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
