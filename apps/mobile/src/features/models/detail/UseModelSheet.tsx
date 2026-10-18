import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Check, Copy, KeyRound, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Icon, IconButton, Segmented, Select, Text } from "@/components/ui";
import type { GatewayMetadata } from "@/lib/api/models";
import { WEB_ORIGIN } from "@/lib/config";

const BASE_URL = "https://api.phaseo.app/v1";

type Language = "curl" | "typescript" | "python";

/** The request each endpoint takes; other endpoints point to the website's quickstart. */
const ENDPOINTS: Record<string, { path: string; label: string; body: (model: string) => Record<string, unknown>; ts?: string; py?: string }> = {
  "text.generate": { path: "/chat/completions", label: "Chat completions", body: (model) => ({ model, messages: [{ role: "user", content: "Hello!" }] }), ts: "chat.completions.create", py: "chat.completions.create" },
  "chat/completions": { path: "/chat/completions", label: "Chat completions", body: (model) => ({ model, messages: [{ role: "user", content: "Hello!" }] }), ts: "chat.completions.create", py: "chat.completions.create" },
  "text.embed": { path: "/embeddings", label: "Embeddings", body: (model) => ({ model, input: "Hello!" }), ts: "embeddings.create", py: "embeddings.create" },
  embeddings: { path: "/embeddings", label: "Embeddings", body: (model) => ({ model, input: "Hello!" }), ts: "embeddings.create", py: "embeddings.create" },
};

function snippet(language: Language, endpoint: (typeof ENDPOINTS)[string], model: string) {
  const body = endpoint.body(model);
  if (language === "curl") {
    return `curl ${BASE_URL}${endpoint.path} \\\n  -H "Authorization: Bearer $PHASEO_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}'`;
  }
  if (language === "typescript") {
    return `import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  apiKey: process.env.PHASEO_API_KEY,\n  baseURL: '${BASE_URL}',\n});\n\nconst response = await client.${endpoint.ts}(${JSON.stringify(body, null, 2)});\n\nconsole.log(response);`;
  }
  return `import os\nfrom openai import OpenAI\n\nclient = OpenAI(\n    api_key=os.environ.get("PHASEO_API_KEY"),\n    base_url="${BASE_URL}",\n)\n\nresponse = client.${endpoint.py}(**${JSON.stringify(body, null, 4)})\n\nprint(response)`;
}

/** "Get started with {model}": the model ID to send, a working request, and a way to get a key. */
export function UseModelSheet({ open, onClose, modelId, modelName, gateway }: { open: boolean; onClose(): void; modelId: string; modelName: string; gateway: GatewayMetadata | null | undefined }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const identifiers = gateway?.acceptedModelIdentifiers.length ? gateway.acceptedModelIdentifiers : [modelId];
  const [identifier, setIdentifier] = useState(gateway?.primaryModelIdentifier ?? identifiers[0] ?? modelId);
  const [language, setLanguage] = useState<Language>("curl");
  const [copied, setCopied] = useState<string | null>(null);
  const endpointId = [...new Set((gateway?.activeProviders ?? []).map((route) => route.endpoint).filter((value): value is string => Boolean(value)))].find((value) => ENDPOINTS[value]);
  const endpoint = endpointId ? ENDPOINTS[endpointId] : undefined;
  const code = endpoint ? snippet(language, endpoint, identifier) : null;
  const copy = (key: string, value: string) => {
    void Clipboard.setStringAsync(value);
    setCopied(key);
    setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
  };
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
        <View className="flex-row items-start gap-2 border-b border-border px-4 py-3">
          <View className="flex-1">
            <Text variant="heading" numberOfLines={1}>Get started with {modelName}</Text>
            <Text variant="caption" className="mt-0.5">Create a key, configure the request, and copy production-ready code.</Text>
          </View>
          <IconButton icon={X} label="Close" onPress={onClose} />
        </View>
        <ScrollView contentContainerClassName="gap-5 px-4 py-5">
          <View className="gap-2">
            <Text variant="label">Model identifier</Text>
            <View className="flex-row gap-2">
              {identifiers.length > 1 ? (
                <Select className="flex-1" title="Model identifiers" value={identifier} options={identifiers.map((value) => ({ value, label: value, description: value === (gateway?.primaryModelIdentifier ?? modelId) ? "Default" : "Alias" }))} onChange={setIdentifier} />
              ) : (
                <View className="h-10 flex-1 justify-center rounded-md border border-border px-3"><Text variant="mono" selectable className="text-foreground">{identifier}</Text></View>
              )}
              <Button label={copied === "id" ? "Copied" : "Copy"} icon={copied === "id" ? Check : Copy} variant="outline" size="md" onPress={() => copy("id", identifier)} />
            </View>
          </View>
          {code ? (
            <View className="gap-2">
              <Text variant="label">{endpoint!.label}</Text>
              <Segmented value={language} options={[{ value: "curl", label: "cURL" }, { value: "typescript", label: "TypeScript" }, { value: "python", label: "Python" }]} onChange={(value) => setLanguage(value)} />
              <View className="rounded-md border border-border bg-muted p-3">
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text variant="mono" selectable className="text-[12px] leading-[18px] text-foreground">{code}</Text>
                </ScrollView>
              </View>
              <Pressable accessibilityRole="button" onPress={() => copy("code", code)} className="flex-row items-center gap-1.5 self-start">
                <Icon icon={copied === "code" ? Check : Copy} tone="muted" size={14} />
                <Text variant="caption">{copied === "code" ? "Copied" : "Copy code"}</Text>
              </Pressable>
            </View>
          ) : (
            <Text variant="muted">{"Send requests with this identifier. The full quickstart for this model's endpoints is on phaseo.app."}</Text>
          )}
          <View className="gap-2">
            <Button label="Create an API key" icon={KeyRound} onPress={() => { onClose(); router.push("/account/keys"); }} />
            <Button label="Open the full quickstart" variant="outline" onPress={() => void Linking.openURL(`${WEB_ORIGIN}/models/${modelId}#quickstart`)} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
