import { useLocalSearchParams } from "expo-router";
import { ProviderDetail } from "@/features/providers/ProviderDetail";

export default function ProviderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProviderDetail key={id} id={id} />;
}
