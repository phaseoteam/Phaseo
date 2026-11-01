import { useLocalSearchParams } from "expo-router";
import { PairScreen } from "@/features/desktops/PairScreen";

export default function PairRoute() {
  // phaseo://pair?p=… opens here with the payload; from Desktops it opens without one.
  const { p } = useLocalSearchParams<{ p?: string }>();
  return <PairScreen link={p ? `phaseo://pair?p=${p}` : undefined} />;
}
