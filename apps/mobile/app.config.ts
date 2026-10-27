import fs from "node:fs";
import path from "node:path";

import appJson from "./app.json";

function readLocalWebEnvironment() {
  const values: Record<string, string> = {};
  const file = path.resolve(__dirname, "../web/.env.local");

  if (!fs.existsSync(file)) return values;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!key || rawValue == null) continue;
    values[key] = rawValue.replace(/^(['"])(.*)\1$/, "$2");
  }

  return values;
}

const localWebEnvironment = readLocalWebEnvironment();
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  ?? localWebEnvironment.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ?? localWebEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default {
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    supabaseUrl,
    supabasePublishableKey,
  },
};
