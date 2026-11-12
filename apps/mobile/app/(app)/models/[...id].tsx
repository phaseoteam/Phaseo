import { useLocalSearchParams } from "expo-router";
import { ModelDetail } from "@/features/models/ModelDetail";

/** Model IDs contain a slash (`openai/gpt-5`), so the route is a catch-all, matching phaseo.app/models/openai/gpt-5. */
export default function ModelScreen() {
  const { id } = useLocalSearchParams<{ id: string[] | string }>();
  const modelId = (Array.isArray(id) ? id : [id]).map((part) => decodeURIComponent(part ?? "")).join("/");
  return <ModelDetail key={modelId} id={modelId} />;
}
