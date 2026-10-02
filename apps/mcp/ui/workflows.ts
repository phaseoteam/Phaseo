import type { Model } from "./model";

export type CallTool = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
export type SavedShortlist = { name: string; ids: string[] };

export function parseShortlists(raw: string | null): SavedShortlist[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 20)
    throw new Error("Invalid saved shortlists.");
  return value.map((item) => {
    if (
      !item ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 60 ||
      !Array.isArray(item.ids) ||
      !item.ids.length ||
      item.ids.length > 3 ||
      item.ids.some(
        (id: unknown) =>
          typeof id !== "string" || !id.length || id.length > 200,
      )
    )
      throw new Error("Invalid saved shortlist.");
    return { name: item.name, ids: [...new Set<string>(item.ids)] };
  });
}

export function integrationExample(model: Model, language: string) {
  const id = JSON.stringify(model.id);
  if (language === "Python")
    return `import os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    api_key=os.environ["PHASEO_API_KEY"],\n    base_url="https://api.phaseo.app/v1",\n)\nresponse = client.chat.completions.create(\n    model=${id},\n    messages=[{"role": "user", "content": "Hello!"}],\n    max_completion_tokens=512,\n)\nprint(response.choices[0].message.content)`;
  if (language === "curl") {
    const body = JSON.stringify({
      model: model.id,
      messages: [{ role: "user", content: "Hello!" }],
      max_completion_tokens: 512,
    });
    return `curl https://api.phaseo.app/v1/chat/completions \\\n  -H "Authorization: Bearer $PHASEO_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  --data '${body.replaceAll("'", "'\\''")}'`;
  }
  return `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: process.env.PHASEO_API_KEY,\n  baseURL: "https://api.phaseo.app/v1",\n});\nconst response = await client.chat.completions.create({\n  model: ${id},\n  messages: [{ role: "user", content: "Hello!" }],\n  max_completion_tokens: 512,\n});\nconsole.log(response.choices[0]?.message.content);`;
}
